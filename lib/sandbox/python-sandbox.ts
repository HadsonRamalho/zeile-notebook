import { getSharedPyodide } from "@/stores/pyodide-store";

export async function runPythonInSandbox(code: string) {
  try {
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
      output: output,
      result: result === undefined ? undefined : String(result),
    };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
