import type { components } from "@/lib/api/generated/openapi-types";

type Schemas = components["schemas"];

// Language de execução aceita pelo judge — só as 6 que o servidor sabe compilar
// (rust/typescript/python/zig/go/cpp). Não confundir com o `Language` de
// `types/block-types.ts`, que também admite "generic" (bloco de código sem execução).
export type ChallengeLanguage = Schemas["Language"];

export type JudgeMode = Schemas["JudgeMode"];
export type Verdict = Schemas["Verdict"];
export type SubmissionStatus = Schemas["SubmissionStatus"];
export type ChallengeDifficulty = Schemas["ChallengeDifficulty"];

export type ChallengePublic = Omit<
  Schemas["ChallengePublic"],
  "languages" | "tags" | "starterCode" | "propertySpec"
> & {
  tags: string[];
  languages: ChallengeLanguage[];
  starterCode: Record<string, string> | null;
  propertySpec: unknown | null;
};

export type AuthoringTestCase = Schemas["TestCaseAuthoringView"];

export type TestCasePublic = Schemas["TestCasePublic"];

export type ChallengeDetail = {
  challenge: ChallengePublic;
  sampleTests: TestCasePublic[];
};

export type SubmissionResultView = Schemas["SubmissionResultView"];

export type ReferenceSolutions = Schemas["ReferenceSolutionsResponse"];

export type SubmissionView = Schemas["SubmissionView"];

export type SampleRunResult = Schemas["SampleResultView"];

export type SampleRunResponse = Schemas["RunSamplesResponse"];

export type LeaderboardEntry = Schemas["LeaderboardEntry"];

export type CreateChallengePayload = Omit<
  Schemas["CreateChallengeRequest"],
  "languages" | "starterCode" | "propertySpec"
> & {
  languages: ChallengeLanguage[];
  starterCode?: Record<string, string>;
  propertySpec?: unknown;
};

export type UpdateChallengePayload = Schemas["UpdateChallengeRequest"];

export type CreateTestCasePayload = Schemas["CreateTestCaseRequest"];
export type TestCaseCreatedResponse = Schemas["TestCaseCreatedResponse"];

export type SubmitPayload = Schemas["SubmitRequest"];
