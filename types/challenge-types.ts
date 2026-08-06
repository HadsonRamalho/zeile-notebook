import type { Language } from "@/types/block-types";

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
  propertySpec: unknown | null;
  teamId: string | null;
  notebookId: string | null;
  blockId: string | null;
  visibility: string;
  createdAt: string;
}

export interface AuthoringTestCase {
  id: string;
  input: string;
  expected: string | null;
  isHidden: boolean;
  weight: number;
  ord: number;
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

export interface ReferenceSolutions {
  solutions: Record<string, string>;
}

export interface SubmissionView {
  id: string;
  challengeId: string;
  userId: string | null;
  language: Language;
  code: string;
  status: SubmissionStatus;
  score: number;
  maxScore: number;
  runtimeMs: number;
  errorMessage: string | null;
  createdAt: string;
  judgedAt: string | null;
  results: SubmissionResultView[];
}

export interface SampleRunResult {
  input: string;
  expected: string | null;
  stdout: string;
  stderr: string | null;
  verdict: Verdict;
}

export interface SampleRunResponse {
  compileError: string | null;
  results: SampleRunResult[];
}

export interface LeaderboardEntry {
  submissionId: string;
  userId: string;
  authorName: string;
  score: number;
  maxScore: number;
  runtimeMs: number;
  createdAt: string;
}

export interface CreateChallengePayload {
  notebookId: string;
  blockId?: string;
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
