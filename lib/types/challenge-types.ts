import type { Language } from "@/lib/types";

export type JudgeMode = "io" | "reference" | "property";

export type SubmissionStatus =
  | "queued"
  | "running"
  | "done"
  | "compile_error"
  | "error";

export type Verdict = "AC" | "WA" | "TLE" | "RE" | "CE" | "SKIP";

export interface ChallengePublic {
  id: string;
  slug: string;
  title: string;
  statementMd: string;
  difficulty: string;
  tags: string[];
  languages: Language[];
  judgeMode: JudgeMode;
  timeLimitMs: number;
  memLimitKb: number;
  starterCode: Record<string, string> | null;
  teamId: string | null;
  visibility: string;
  createdAt: string;
}

export interface TestCasePublic {
  id: string;
  input: string;
  expected: string | null;
  weight: number;
  ord: number;
}

export interface ChallengeDetail {
  challenge: ChallengePublic;
  sampleTests: TestCasePublic[];
}

export interface SubmissionResultView {
  testCaseId: string | null;
  verdict: Verdict;
  runtimeMs: number;
  isHidden: boolean;
  stderrSnippet: string | null;
  ord: number;
}

export interface SubmissionView {
  id: string;
  challengeId: string;
  userId: string | null;
  language: Language;
  status: SubmissionStatus;
  score: number;
  maxScore: number;
  runtimeMs: number;
  errorMessage: string | null;
  createdAt: string;
  judgedAt: string | null;
  results: SubmissionResultView[];
}

export interface LeaderboardEntry {
  userId: string;
  authorName: string;
  score: number;
  maxScore: number;
  runtimeMs: number;
  createdAt: string;
}

export interface CreateChallengePayload {
  slug: string;
  title: string;
  statementMd: string;
  difficulty?: string;
  tags?: string[];
  languages: Language[];
  judgeMode?: JudgeMode;
  timeLimitMs?: number;
  memLimitKb?: number;
  starterCode?: Record<string, string>;
  propertySpec?: unknown;
  visibility?: string;
  teamId?: string | null;
}

export interface CreateTestCasePayload {
  input: string;
  expected?: string | null;
  isHidden?: boolean;
  weight?: number;
  ord?: number;
}

export interface SubmitPayload {
  language: Language;
  code: string;
}
