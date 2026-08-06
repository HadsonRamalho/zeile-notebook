import { catchError } from "@catcherjs/core";
import { getSharedPyodide } from "@/stores/pyodide-store";

export interface PythonRunOutput {
  output: string;
  result: string | undefined;
}

export async function runPythonInSandbox(code: string) {
  return catchError(runPython(code));
}

async function runPython(code: string): Promise<PythonRunOutput> {
  const pyodide = await getSharedPyodide();
  if (!pyodide) {
    throw new Error("Pyodide is not available outside the browser.");
  }

  let output = "";
  pyodide.setStdout({
    batched: (str: string) => {
      output += `${str}\n`;
    },
  });

  await pyodide.loadPackagesFromImports(code);
  const result = await pyodide.runPythonAsync(code);

  return {
    output,
    result: result === undefined ? undefined : String(result),
  };
}
