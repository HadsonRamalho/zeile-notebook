import type {
  ChallengeLanguage,
  JudgeMode,
  SubmissionStatus,
  Verdict,
} from "@/types/challenge-types";

export const CHALLENGE_LANGUAGES: ChallengeLanguage[] = [
  "rust",
  "go",
  "cpp",
  "zig",
];

const LANGUAGE_LABELS: Record<string, string> = {
  rust: "Rust",
  go: "Go",
  cpp: "C++",
  zig: "Zig",
  typescript: "TypeScript",
  python: "Python",
};

export function languageLabel(lang: string): string {
  return LANGUAGE_LABELS[lang] ?? lang;
}

export type DifficultyKey = "easy" | "medium" | "hard";

export function difficultyKey(raw: string): DifficultyKey {
  const value = raw.toLowerCase();
  if (value === "easy" || value === "hard") return value;
  return "medium";
}

export const DIFFICULTY_DOT: Record<DifficultyKey, string> = {
  easy: "bg-primary",
  medium: "bg-amber-500",
  hard: "bg-rose-500",
};

export const DIFFICULTY_LABEL_KEYS: Record<DifficultyKey, string> = {
  easy: "difficulty.easy",
  medium: "difficulty.medium",
  hard: "difficulty.hard",
};

export const JUDGE_MODES: JudgeMode[] = ["io", "reference", "property"];

export const JUDGE_MODE_LABEL_KEYS: Record<JudgeMode, string> = {
  io: "judge_mode.io",
  reference: "judge_mode.reference",
  property: "judge_mode.property",
};

export const SUBMISSION_STATUS_LABEL_KEYS: Record<SubmissionStatus, string> = {
  queued: "status.queued",
  running: "status.running",
  done: "status.done",
  compile_error: "status.compile_error",
  error: "status.error",
};

const PASS_VERDICTS: ReadonlySet<Verdict> = new Set<Verdict>(["AC", "SKIP"]);

export function isPassingVerdict(verdict: Verdict): boolean {
  return PASS_VERDICTS.has(verdict);
}

export function isTerminalStatus(status: SubmissionStatus): boolean {
  return status !== "queued" && status !== "running";
}

export function verdictTone(
  verdict: Verdict,
): "pass" | "fail" | "slow" | "neutral" {
  switch (verdict) {
    case "AC":
      return "pass";
    case "WA":
    case "RE":
    case "CE":
      return "fail";
    case "TLE":
      return "slow";
    default:
      return "neutral";
  }
}

export const VERDICT_TONE_CLASSES: Record<
  "pass" | "fail" | "slow" | "neutral",
  string
> = {
  pass: "border-primary/25 bg-primary/10 text-primary",
  fail: "border-destructive/25 bg-destructive/10 text-destructive",
  slow: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  neutral: "border-border bg-muted text-muted-foreground",
};
