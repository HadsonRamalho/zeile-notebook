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

interface RunCodeApiResponse {
  stdout?: string;
  stderr?: string;
}

interface FormatCombinedOutputType {
  stdout?: string;
  stderr?: string;
}

function formatCombinedOutput({ stdout, stderr }: FormatCombinedOutputType) {
  if (stdout && stderr) {
    return `${stdout}\n\n--- Erro de Execução ---\n${stderr}`;
  }
  return stdout || stderr || "Código executado com sucesso.";
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

    const stderr = data.stderr || "";
    const stdout = data.stdout || "";

    if (language === "rust") {
      if (stderr) {
        if (stderr.includes("file not found for module")) {
          setStatus("error");
          setOutput(
            `Falha relacionada a outro módulo. Tente compilar outros blocos primeiro :))\n\n${stderr}`,
          );
          return;
        }

        if (
          stderr.includes("Finished `dev` profile [unoptimized + debuginfo]") ||
          stderr.includes("Finished dev [unoptimized + debuginfo]")
        ) {
          setStatus("success");
          setOutput("Bloco compilado!");
          return;
        }

        setStatus("error");
        setOutput(stderr);
        return;
      }

      setStatus("success");
      setOutput(stdout || "Código executado com sucesso.");
      return;
    }

    if (language === "go" || language === "cpp" || language === "zig") {
      const langName =
        language === "go" ? "Go" : language === "cpp" ? "C++" : "Zig";
      const isCompileOrSecError =
        stderr.includes(`Erro de Compilação ${langName}:`) ||
        stderr.includes("Falha ao invocar") ||
        stderr.includes("Segurança:");

      if (isCompileOrSecError) {
        setStatus("error");
        setOutput(stderr);
        return;
      }

      setStatus(stderr ? "error" : "success");
      setOutput(formatCombinedOutput({ stderr, stdout }));
      return;
    }

    setStatus(stderr ? "error" : "success");
    setOutput(formatCombinedOutput({ stderr, stdout }));
  } catch (err) {
    console.error(err);
    setStatus("error");
    setOutput("Erro: Não foi possível se comunicar com o servidor.");
  } finally {
    setIsRunning(false);
  }
}
