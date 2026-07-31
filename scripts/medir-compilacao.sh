#!/usr/bin/env bash
# Q106 — tempo de compilação antes × depois do envelope bwrap, na mesma máquina.
# Resultado comentado em docs/medicoes/compilacao-sandbox.md.
set -u

BASE=$(mktemp -d)
CACHE=$(mktemp -d)
trap 'rm -rf "$BASE" "$CACHE"' EXIT
REPS=${REPS:-5}

CARGO_DIR=${CARGO_HOME:-$HOME/.cargo}
RUSTUP_DIR=${RUSTUP_HOME:-$HOME/.rustup}

ENVELOPE=(
  --unshare-all --die-with-parent --new-session
  --ro-bind /usr /usr --ro-bind-try /lib /lib --ro-bind-try /lib64 /lib64
  --ro-bind-try /bin /bin --dev /dev --proc /proc --dir /tmp
)
LIMITES=(--cpu=30 --as=4294967296)

cronometra() {
  local rotulo=$1 log=$2
  shift 2
  local total=0 falhou=0
  for _ in $(seq "$REPS"); do
    local ini fim
    ini=$(date +%s%N)
    "$@" >"$log" 2>&1 || falhou=1
    fim=$(date +%s%N)
    total=$((total + (fim - ini) / 1000000))
  done
  printf "%-46s %6s ms  %s\n" "$rotulo" "$((total / REPS))" \
    "$([ $falhou -eq 0 ] && echo ok || echo FALHOU)"
}

# ---------------------------------------------------------------- Go
GO=$BASE/go
mkdir -p "$GO"
printf 'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println("ola") }\n' >"$GO/main.go"

go_antes() {
  touch "$GO/main.go"
  (cd "$GO" && GOCACHE=$GO/.hostcache go build -o app main.go)
}

go_depois() {
  touch "$GO/main.go"
  prlimit "${LIMITES[@]}" -- bwrap "${ENVELOPE[@]}" \
    --bind "$CACHE" /cache --bind "$GO" /app --chdir /app \
    env -i PATH=/usr/bin:/bin HOME=/app TMPDIR=/tmp \
    GOCACHE=/cache/go-build GOMODCACHE=/cache/go-mod GOPATH=/app/.go \
    CGO_ENABLED=0 GOTOOLCHAIN=local \
    go build -o app main.go
}

# uma sessão nova por repetição: é o caso real, cada submissão tem workspace próprio
go_sessao_nova() {
  local dir
  dir=$(mktemp -d "$BASE/sessao.XXXX")
  printf 'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println("ola") }\n' >"$dir/main.go"
  prlimit "${LIMITES[@]}" -- bwrap "${ENVELOPE[@]}" \
    --bind "$CACHE" /cache --bind "$dir" /app --chdir /app \
    env -i PATH=/usr/bin:/bin HOME=/app TMPDIR=/tmp \
    GOCACHE=/cache/go-build GOMODCACHE=/cache/go-mod GOPATH=/app/.go \
    CGO_ENABLED=0 GOTOOLCHAIN=local \
    go build -o app main.go
}

# ---------------------------------------------------------------- C++
CPP=$BASE/cpp
mkdir -p "$CPP"
printf '#include <iostream>\nint main() { std::cout << "ola" << std::endl; }\n' >"$CPP/main.cpp"

cpp_antes() {
  (cd "$CPP" && prlimit --cpu=10 --as=2147483648 -- clang++ -O2 -std=c++20 -o app main.cpp)
}

cpp_depois() {
  prlimit "${LIMITES[@]}" -- bwrap "${ENVELOPE[@]}" \
    --bind "$CPP" /app --chdir /app \
    env -i PATH=/usr/bin:/bin HOME=/app TMPDIR=/tmp \
    clang++ -O2 -std=c++20 -o app main.cpp
}

# ---------------------------------------------------------------- Rust
RS=$BASE/rs
cargo init --bin --name app_bench "$RS" >/dev/null 2>&1
printf 'fn main() { println!("ola"); }\n' >"$RS/src/main.rs"

rust_antes() {
  touch "$RS/src/main.rs"
  bwrap "${ENVELOPE[@]}" \
    --ro-bind-try "$RUSTUP_DIR" "$RUSTUP_DIR" --ro-bind-try "$CARGO_DIR" "$CARGO_DIR" \
    --bind "$RS" /app --chdir /app \
    env PATH="$CARGO_DIR/bin:/usr/bin:/bin" HOME="$HOME" \
    cargo build --message-format=json --target=wasm32-wasip1 --offline -q
}

rust_depois() {
  touch "$RS/src/main.rs"
  prlimit "${LIMITES[@]}" -- bwrap "${ENVELOPE[@]}" \
    --ro-bind-try "$RUSTUP_DIR" "$RUSTUP_DIR" --ro-bind-try "$CARGO_DIR" "$CARGO_DIR" \
    --bind "$RS" /app --chdir /app \
    env -i PATH="$CARGO_DIR/bin:/usr/bin:/bin" HOME="$HOME" TMPDIR=/tmp \
    RUSTUP_HOME="$RUSTUP_DIR" CARGO_HOME="$CARGO_DIR" \
    cargo build --message-format=json --target=wasm32-wasip1 --offline -q
}

echo "repetições por medida: $REPS (média)"
echo

echo "-- cache frio: primeira compilação depois do boot --"
ini=$(date +%s%N)
go_sessao_nova >/dev/null 2>&1
fim=$(date +%s%N)
printf "%-46s %6s ms\n" "go · sessão nova, cache do servidor vazio" "$(((fim - ini) / 1000000))"
echo

# aquece tudo antes de medir
for f in go_antes go_depois cpp_antes cpp_depois rust_antes rust_depois; do
  $f >/dev/null 2>&1
done

echo "-- cache quente --"
cronometra "go   · antes  (host, sem sandbox)" "$BASE/l1" go_antes
cronometra "go   · depois (bwrap + prlimit)" "$BASE/l2" go_depois
cronometra "go   · depois, sessão nova a cada vez" "$BASE/l3" go_sessao_nova
cronometra "cpp  · antes  (só prlimit)" "$BASE/l4" cpp_antes
cronometra "cpp  · depois (bwrap + prlimit)" "$BASE/l5" cpp_depois
cronometra "rust · antes  (bwrap, sem prlimit)" "$BASE/l6" rust_antes
cronometra "rust · depois (bwrap + prlimit)" "$BASE/l7" rust_depois

echo
echo "--- artefato gerado ---"
for f in "$GO/app" "$CPP/app" "$RS/target/wasm32-wasip1/debug/app_bench.wasm"; do
  [ -e "$f" ] && echo "ok    $f" || echo "FALTA $f"
done
