const PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/";
const PYODIDE_SCRIPT_URL = `${PYODIDE_INDEX_URL}pyodide.js`;

interface PyodideInterface {
  setStdout: (options: { batched: (str: string) => void }) => void;
  loadPackagesFromImports: (code: string) => Promise<void>;
  runPythonAsync: (code: string) => Promise<unknown>;
}

interface PyodideWindow extends Window {
  loadPyodide?: (options: { indexURL: string }) => Promise<PyodideInterface>;
}

let pyodidePromise: Promise<PyodideInterface> | null = null;
let scriptPromise: Promise<void> | null = null;

function loadPyodideScript(): Promise<void> {
  if ((window as PyodideWindow).loadPyodide) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PYODIDE_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Falha ao carregar o script do Pyodide."));
    };
    document.body.appendChild(script);
  });

  return scriptPromise;
}

export async function getSharedPyodide() {
  if (typeof window === "undefined") return null;

  if (pyodidePromise) return pyodidePromise;

  await loadPyodideScript();

  const loadPyodide = (window as PyodideWindow).loadPyodide;
  if (!loadPyodide) {
    throw new Error("Pyodide script not found on Window.");
  }

  pyodidePromise = loadPyodide({
    indexURL: PYODIDE_INDEX_URL,
  });

  return pyodidePromise;
}
