import type { Language, RunStatus } from "../types";
import { createApi } from "./base";

const api = createApi("exec-compiled");

interface RunCodeProps {
  setOutput: (o: string) => void;
  setStatus: (s: RunStatus) => void;
  setIsRunning: (r: boolean) => void;
  code: string;
  language: Language;
  notebookId?: string;
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
}: {
  stdout?: string;
  stderr?: string;
}) {
  if (stdout && stderr) {
    return `${stdout}\n\n--- Erro de Execução ---\n${stderr}`;
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
        formatCombinedOutput({ stdout, stderr }) ||
          "Código executado com sucesso.",
      );
      return;
    }

    setStatus("error");

    if (errorCode === "MODULE_NOT_FOUND") {
      setOutput(
        `Falha relacionada a outro módulo. Tente compilar outros blocos primeiro :))\n\n${stderr}`,
      );
      return;
    }

    setOutput(formatCombinedOutput({ stdout, stderr }) || "Erro na execução.");
  } catch (err) {
    console.error(err);
    setStatus("error");
    setOutput("Erro: Não foi possível se comunicar com o servidor.");
  } finally {
    setIsRunning(false);
  }
}
