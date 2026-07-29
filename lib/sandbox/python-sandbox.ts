import { getSharedPyodide } from "@/lib/pyodideStore";

export async function runPythonInSandbox(code: string) {
  try {
    const pyodide = await getSharedPyodide();

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
      result: result?.toString(),
    };
  } catch (err: any) {
    return { error: err.message };
  }
}
