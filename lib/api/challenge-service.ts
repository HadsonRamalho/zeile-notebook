import { api } from "./base";
import type {
  AuthoringTestCase,
  ChallengeDetail,
  ChallengePublic,
  CreateChallengePayload,
  CreateTestCasePayload,
  LeaderboardEntry,
  ReferenceSolutions,
  SampleRunResponse,
  SubmissionView,
  SubmitPayload,
} from "@/lib/types/challenge-types";

export async function listChallenges() {
  return api.get<ChallengePublic[]>("/challenge/list");
}

export async function getChallenge(slug: string) {
  return api.get<ChallengeDetail>(`/challenge/slug/${slug}`);
}

export async function getChallengeById(id: string) {
  return api.get<ChallengeDetail>(`/challenge/${id}`);
}

export async function listTestCases(id: string) {
  return api.get<AuthoringTestCase[]>(`/challenge/${id}/test-cases`);
}

export async function deleteTestCase(id: string, caseId: string) {
  return api.delete<void>(`/challenge/${id}/test-cases/${caseId}`);
}

export async function createChallenge(payload: CreateChallengePayload) {
  return api.post<ChallengePublic>("/challenge/create", payload);
}

export async function updateChallenge(
  id: string,
  payload: Partial<CreateChallengePayload>,
) {
  return api.put<ChallengePublic>(`/challenge/${id}`, payload);
}

export async function addTestCase(id: string, payload: CreateTestCasePayload) {
  return api.post<{ id: string }>(`/challenge/${id}/test-cases`, payload);
}

export async function setReferenceSolution(
  id: string,
  solution: string,
  language: string,
) {
  return api.post<ChallengePublic>(`/challenge/${id}/reference`, {
    solution,
    language,
  });
}

export async function getReferenceSolutions(id: string) {
  return api.get<ReferenceSolutions>(`/challenge/${id}/reference`);
}

export async function deleteReference(id: string, language: string) {
  return api.delete<ReferenceSolutions>(`/challenge/${id}/reference/${language}`);
}

export async function submitSolution(id: string, payload: SubmitPayload) {
  return api.post<SubmissionView>(`/challenge/${id}/submit`, payload);
}

export async function runSamples(id: string, payload: SubmitPayload) {
  return api.post<SampleRunResponse>(`/challenge/${id}/run`, payload);
}

export async function getSubmission(submissionId: string) {
  return api.get<SubmissionView>(`/challenge/submissions/${submissionId}`);
}

export async function listMySubmissions(challengeId: string) {
  return api.get<SubmissionView[]>(`/challenge/${challengeId}/submissions`);
}

export async function getLeaderboard(challengeId: string) {
  return api.get<LeaderboardEntry[]>(`/challenge/${challengeId}/leaderboard`);
}

export async function pollSubmission(
  submissionId: string,
  onUpdate: (submission: SubmissionView) => void,
  options: { intervalMs?: number; maxAttempts?: number } = {},
) {
  const intervalMs = options.intervalMs ?? 1500;
  const maxAttempts = options.maxAttempts ?? 60;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const submission = await getSubmission(submissionId);
    onUpdate(submission);
    if (submission.status !== "queued" && submission.status !== "running") {
      return submission;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return getSubmission(submissionId);
}
