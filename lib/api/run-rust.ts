import type { components } from "@/lib/api/generated/openapi-types";
import type { Language, RunStatus } from "@/types/block-types";
import { createResultApi } from "./base";

const api = createResultApi("exec-compiled");

type RunCodeTranslate = (key: string) => string;

interface RunCodeProps {
  setOutput: (o: string) => void;
  setStatus: (s: RunStatus) => void;
  setIsRunning: (r: boolean) => void;
  code: string;
  language: Language;
  notebookId?: string | undefined;
  t: RunCodeTranslate;
}

type CodeRequest = components["schemas"]["CodeRequest"];
type CodeResponse = components["schemas"]["CodeResponse"];

function formatCombinedOutput({
  stdout,
  stderr,
  t,
}: {
  stdout?: string;
  stderr?: string;
  t: RunCodeTranslate;
}) {
  if (stdout && stderr) {
    return `${stdout}\n\n--- ${t("execution_error_label")} ---\n${stderr}`;
  }
  return stdout || stderr || "";
}

export async function RunCode({
  setOutput,
  setIsRunning,
  setStatus,
  code,
  language,
  notebookId,
  t,
}: RunCodeProps) {
  setIsRunning(true);
  setStatus("idle");
  setOutput("");

  const endpoint = language === "rust" ? "/run" : `/run/${language}`;

  const payload: CodeRequest = { code, notebookId: notebookId ?? null };
  const result = await api.post<CodeResponse>(endpoint, payload);

  if (result.isErr()) {
    console.error(result.error);
    setStatus("error");
    setOutput(t("network_error"));
    setIsRunning(false);
    return;
  }

  const { status, errorCode, stdout, stderr } = result.data;

  if (status === "ok") {
    setStatus("success");
    setOutput(formatCombinedOutput({ stdout, stderr, t }) || t("run_success"));
    setIsRunning(false);
    return;
  }

  setStatus("error");

  if (errorCode === "MODULE_NOT_FOUND") {
    setOutput(`${t("module_not_found")}\n\n${stderr}`);
    setIsRunning(false);
    return;
  }

  setOutput(formatCombinedOutput({ stdout, stderr, t }) || t("run_error"));
  setIsRunning(false);
}
