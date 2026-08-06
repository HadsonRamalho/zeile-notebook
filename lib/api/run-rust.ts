import type { Language, RunStatus } from "@/types/block-types";
import { createApi } from "./base";

const api = createApi("exec-compiled");

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

type ExecStatus =
  | "ok"
  | "compile_error"
  | "runtime_error"
  | "timeout"
  | "security_rejected"
  | "unauthenticated"
  | "permission_denied"
  | "invalid_request"
  | "server_busy"
  | "toolchain_unavailable"
  | "internal";

interface RunCodeApiResponse {
  status: ExecStatus;
  errorCode: string | null;
  stdout: string;
  stderr: string;
}

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

  try {
    const endpoint = language === "rust" ? "/run" : `/run/${language}`;

    const data: RunCodeApiResponse = await api.post(endpoint, {
      code,
      notebookId,
    });

    const { status, errorCode, stdout, stderr } = data;

    if (status === "ok") {
      setStatus("success");
      setOutput(
        formatCombinedOutput({ stdout, stderr, t }) || t("run_success"),
      );
      return;
    }

    setStatus("error");

    if (errorCode === "MODULE_NOT_FOUND") {
      setOutput(`${t("module_not_found")}\n\n${stderr}`);
      return;
    }

    setOutput(formatCombinedOutput({ stdout, stderr, t }) || t("run_error"));
  } catch (err) {
    console.error(err);
    setStatus("error");
    setOutput(t("network_error"));
  } finally {
    setIsRunning(false);
  }
}
