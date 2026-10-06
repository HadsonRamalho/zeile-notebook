#!/usr/bin/env bash
# gate-lock.sh — gate admission queue for loop-eng-zeile.
#
# Memory belongs to the machine, not to the repository: there is one queue for every session, in
# ZEILE_GATE_QUEUE_DIR (default ~/.claude/loop-eng-zeile/gate).
#   - One global FIFO queue for every kind; only the head of the queue is admitted (no jumping).
#   - Memory-based admission: sum of the costs (GB) of running gates + the new one <= budget
#     (ZEILE_GATE_BUDGET_GB, default 8) and MemAvailable >= cost + reserve (default 2 GB).
#   - At most ONE heavy gate (test, gate) at a time on the machine.
#   - The command runs in a systemd scope with MemoryMax: on overflow the gate dies, not the machine.
#
#   gate-lock.sh run <kind> [--label L] [--timeout S] [--cost-gb N] -- <cmd...>
#   gate-lock.sh status
#
# kind: lint | build | test | gate (grant for a whole sequence)
# Exit 75 (EX_TEMPFAIL) = not admitted before the timeout; the caller yields the tick.

set -uo pipefail

EX_USAGE=2
EX_TEMPFAIL=75

DEFAULT_TIMEOUT=3600
POLL=5
NOTE_EVERY=60

BUDGET_GB=${ZEILE_GATE_BUDGET_GB:-8}
RESERVE_GB=${ZEILE_GATE_RESERVE_GB:-2}
HEADROOM_GB=${ZEILE_GATE_HEADROOM_GB:-3}
SWAPCAP_GB=${ZEILE_GATE_SWAPCAP_GB:-1}
PSI_MAX=${ZEILE_GATE_PSI_MAX:-10}
MEMCAP=${ZEILE_GATE_MEMCAP:-1}

usage() {
  sed -n '4,17p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit "$EX_USAGE"
}

die() { printf 'gate-lock: %s\n' "$1" >&2; exit "$EX_USAGE"; }
note() { printf 'gate-lock: %s\n' "$1" >&2; }

# kind -> "<cost-gb> <heavy>". Cost is peak, not average: cargo and tsc on a large project reach it.
spec_for() {
  case "$1" in
    lint) printf '2 0' ;;
    build) printf '3 0' ;;
    test) printf '4 1' ;;
    gate) printf '5 1' ;;
    *) return 1 ;;
  esac
}

# Field 22 of /proc/<pid>/stat (starttime): tells a live wrapper apart from a recycled pid.
proc_start() {
  local s
  s=$(cat "/proc/$1/stat" 2>/dev/null) || return 1
  s=${s##*) }
  awk '{ print $20 }' <<< "$s"
}

alive() {
  local pid=$1 start=$2
  [[ -n "$pid" && -d "/proc/$pid" ]] || return 1
  [[ -z "$start" || "$(proc_start "$pid")" == "$start" ]]
}

field() { sed -n "s/^$2=//p" "$1" 2>/dev/null | head -1; }
num() { local v; v=$(field "$1" "$2"); printf '%s' "${v:-0}"; }

mem_available_mb() { awk '/^MemAvailable:/ { print int($2 / 1024) }' /proc/meminfo; }

psi_some_avg10() {
  awk '/^some/ { split($2, a, "="); print int(a[2]) }' /proc/pressure/memory 2>/dev/null || printf '0'
}

journal() {
  printf '%s\t%s\n' "$(date -u +%FT%TZ)" "$*" >> "$DIR/gate-journal.tsv" 2>/dev/null || true
}

# --- critical section: everything that reads or writes the queue goes through the flock on fd 9 ---

lock_queue() { flock -w 30 9 || die "flock on $MUTEX not acquired within 30 s"; }
unlock_queue() { flock -u 9; }

write_ticket() {
  local path=$1 tmp
  shift
  tmp="$path.tmp.$$"
  printf '%s\n' "$@" > "$tmp" && mv -f "$tmp" "$path"
}

set_state() {
  local t=$1 state=$2 tmp
  tmp="$t.tmp.$$"
  sed "s/^state=.*/state=$state/" "$t" > "$tmp" && printf 'started=%s\n' "$(date +%s)" >> "$tmp" \
    && mv -f "$tmp" "$t"
}

# A ticket is orphaned when both the wrapper AND the command it launched are dead (same host, pid
# missing or recycled). `child` covers a wrapper killed by SIGKILL while the gate still uses memory.
prune() {
  local t pid host
  for t in "$QUEUE"/*.t; do
    [[ -f "$t" ]] || continue
    host=$(field "$t" host)
    [[ "$host" == "$(hostname)" ]] || continue
    pid=$(field "$t" pid)
    alive "$pid" "$(field "$t" pstart)" && continue
    alive "$(field "$t" child)" "$(field "$t" childstart)" && continue
    note "ticket $(basename "$t") orphaned (kind=$(field "$t" kind) label=$(field "$t" label), pid $pid dead) — removing"
    journal "orphan	$(field "$t" kind)	$(field "$t" label)	$(field "$t" clone)"
    rm -f "$t"
  done
}

# Decides whether ticket $1 is admitted now. Prints the reason when it is not.
try_admit() {
  local mine=$1 cost=$2 heavy=$3 t used=0 heavy_run=0 ahead=0 head='' avail psi
  prune
  for t in "$QUEUE"/*.t; do
    [[ -f "$t" ]] || continue
    if [[ "$(field "$t" state)" == 'running' ]]; then
      used=$((used + $(num "$t" cost)))
      heavy_run=$((heavy_run + $(num "$t" heavy)))
    elif [[ -z "$head" ]]; then
      head=$t
    fi
  done
  if [[ "$head" != "$mine" ]]; then
    for t in "$QUEUE"/*.t; do
      [[ "$t" == "$mine" ]] && break
      [[ "$(field "$t" state)" == 'waiting' ]] && ahead=$((ahead + 1))
    done
    printf 'queue: %d gate(s) ahead' "$ahead"
    return 1
  fi
  if ((heavy && heavy_run > 0)); then
    printf 'a heavy gate is already running'
    return 1
  fi
  # A cost larger than the whole budget is only admitted when no other gate is running.
  if ((used > 0 && used + cost > BUDGET_GB)); then
    printf 'budget: %d+%d GB > %d GB' "$used" "$cost" "$BUDGET_GB"
    return 1
  fi
  avail=$(mem_available_mb)
  if ((avail < (cost + RESERVE_GB) * 1024)); then
    printf 'MemAvailable %d MB < %d MB (cost %d + reserve %d GB)' "$avail" \
      $(((cost + RESERVE_GB) * 1024)) "$cost" "$RESERVE_GB"
    return 1
  fi
  psi=$(psi_some_avg10)
  if ((psi > PSI_MAX)); then
    printf 'memory pressure some avg10=%d%% > %d%%' "$psi" "$PSI_MAX"
    return 1
  fi
  set_state "$mine" running
  return 0
}

describe_running() {
  local t
  for t in "$QUEUE"/*.t; do
    [[ -f "$t" ]] || continue
    printf '  %s: state=%s kind=%s cost=%sGB label=%s clone=%s since=%s\n' "$(basename "$t")" \
      "$(field "$t" state)" "$(field "$t" kind)" "$(field "$t" cost)" "$(field "$t" label)" \
      "$(field "$t" clone)" "$(field "$t" since)" >&2
  done
}

# Runs the command under a memory cap (user@ cgroup v2, no root). A test database container lives
# in the container runtime's cgroup and stays outside the cap.
run_capped() {
  local cap=$1
  shift
  if [[ "$MEMCAP" == 1 ]] && command -v systemd-run > /dev/null 2>&1 \
    && systemd-run --user --scope --quiet -- true > /dev/null 2>&1; then
    systemd-run --user --scope --quiet --collect \
      -p "MemoryMax=${cap}G" -p "MemorySwapMax=${SWAPCAP_GB}G" -- "$@"
  else
    note 'no systemd-run --user --scope: running without a memory cap'
    "$@"
  fi
}

run() {
  local kind=$1 label=$2 timeout=$3 cost=$4 spec heavy dcost clone waited=0 reason last='' t0 rc cap
  shift 4
  spec=$(spec_for "$kind") || die "invalid kind: '$kind' (use lint | build | test | gate)"
  read -r dcost heavy <<< "$spec"
  [[ -n "$cost" ]] || cost=$dcost
  [[ "$cost" =~ ^[0-9]+$ ]] || die "--cost-gb takes an integer in GB: $cost"
  [[ "$timeout" =~ ^[0-9]+$ ]] || die "--timeout takes an integer in seconds: $timeout"
  ((cost >= 4)) && heavy=1

  # Inside a live `gate` grant the step runs directly: the whole sequence was already admitted.
  if [[ -n "${GATE_LOCK_TICKET:-}" && -f "$GATE_LOCK_TICKET" ]] \
    && [[ "$(field "$GATE_LOCK_TICKET" state)" == 'running' ]] \
    && alive "$(field "$GATE_LOCK_TICKET" pid)" "$(field "$GATE_LOCK_TICKET" pstart)"; then
    ((cost > $(num "$GATE_LOCK_TICKET" cost))) \
      && note "step $kind/$label costs ${cost} GB, more than the grant ($(num "$GATE_LOCK_TICKET" cost) GB)"
    "$@" 9>&-
    return $?
  fi

  mkdir -p "$QUEUE" || die "could not create $QUEUE"
  clone=$(git rev-parse --show-toplevel 2>/dev/null || printf '%s' "$PWD")
  TICKET="$QUEUE/$(date +%s%N)-$$.t"

  lock_queue
  write_ticket "$TICKET" "kind=$kind" "label=$label" "cost=$cost" "heavy=$heavy" "clone=$clone" \
    "pid=$$" "pstart=$(proc_start $$)" "host=$(hostname)" "since=$(date -u +%FT%TZ)" "state=waiting"
  unlock_queue
  trap 'rm -f "$TICKET"' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  journal "enqueue	$kind	$label	$cost	$clone"

  while :; do
    lock_queue
    reason=$(try_admit "$TICKET" "$cost" "$heavy") && { unlock_queue; break; }
    unlock_queue
    if ((waited >= timeout)); then
      note "not admitted after ${waited}s ($reason) — gate queued, yield the tick"
      describe_running
      journal "timeout	$kind	$label	$cost	$clone	waited=$waited	$reason"
      return "$EX_TEMPFAIL"
    fi
    if [[ "$reason" != "$last" ]] || ((waited % NOTE_EVERY == 0)); then
      note "waiting: $reason (${waited}s/${timeout}s)"
      last=$reason
    fi
    sleep "$POLL"
    waited=$((waited + POLL))
  done

  journal "admit	$kind	$label	$cost	$clone	waited=$waited	avail=$(mem_available_mb)MB"
  export GATE_LOCK_TICKET=$TICKET
  cap=$((cost + HEADROOM_GB))
  t0=$(date +%s)
  # In the background so the trap can forward the signal: an async command in a non-interactive
  # shell inherits SIGINT as ignored, so INT becomes TERM on the child.
  run_capped "$cap" "$@" 9>&- &
  CHILD=$!
  printf 'child=%s\nchildstart=%s\n' "$CHILD" "$(proc_start "$CHILD")" >> "$TICKET"
  trap 'kill -TERM "$CHILD" 2>/dev/null; exit 130' INT
  trap 'kill -TERM "$CHILD" 2>/dev/null; exit 143' TERM
  wait "$CHILD"
  rc=$?
  ((rc == 137)) && note "command killed by SIGKILL (137): likely the ${cap} GB memory cap — not a failed gate"
  journal "done	$kind	$label	$cost	$clone	rc=$rc	dur=$(($(date +%s) - t0))s"
  return "$rc"
}

status() {
  local t found=0
  printf 'queue %s | budget %s GB | reserve %s GB | MemAvailable %s MB | PSI some avg10 %s%%\n' \
    "$QUEUE" "$BUDGET_GB" "$RESERVE_GB" "$(mem_available_mb)" "$(psi_some_avg10)"
  if [[ -d "$QUEUE" ]]; then
    for t in "$QUEUE"/*.t; do
      [[ -f "$t" ]] || continue
      found=1
      printf '%s\tstate=%s\tkind=%s\tcost=%sGB\tlabel=%s\tpid=%s\tsince=%s\tclone=%s\n' "$(basename "$t")" \
        "$(field "$t" state)" "$(field "$t" kind)" "$(field "$t" cost)" "$(field "$t" label)" \
        "$(field "$t" pid)" "$(field "$t" since)" "$(field "$t" clone)"
    done
  fi
  ((found)) || printf 'no gate queued or running\n'
}

main() {
  local cmd=${1:-} kind='' label='-' timeout="$DEFAULT_TIMEOUT" cost=''
  TICKET=''
  CHILD=''
  [[ -n "$cmd" ]] || usage
  shift
  DIR=${ZEILE_GATE_QUEUE_DIR:-$HOME/.claude/loop-eng-zeile/gate}
  QUEUE="$DIR/queue"
  MUTEX="$DIR/queue.mutex"

  case "$cmd" in
    status) status ;;
    run)
      kind=${1:-}; [[ -n "$kind" ]] || usage
      shift
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --label) label=${2:?--label takes a value}; shift 2 ;;
          --timeout) timeout=${2:?--timeout takes a value}; shift 2 ;;
          --cost-gb) cost=${2:?--cost-gb takes a value}; shift 2 ;;
          --) shift; break ;;
          *) die "unexpected argument: $1" ;;
        esac
      done
      [[ $# -gt 0 ]] || die 'run takes `-- <cmd...>`'
      mkdir -p "$DIR" || die "could not create $DIR"
      exec 9> "$MUTEX" || die "could not open $MUTEX"
      run "$kind" "$label" "$timeout" "$cost" "$@"
      exit $?
      ;;
    *) usage ;;
  esac
}

main "$@"
