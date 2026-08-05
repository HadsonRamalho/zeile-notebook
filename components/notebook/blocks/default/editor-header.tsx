import { Clock, Eye, EyeClosed, Play, Terminal } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import type { Block, TsMode } from "@/lib/types";

const getRustFileName = (codeVal: string): string => {
  const match = codeVal.match(/^\/\/ *#\[mod=([a-zA-Z0-9_]+)\]/m);
  return match?.[1] ? `${match[1]}.rs` : "main.rs";
};

const getPythonFileName = (codeVal: string): string => {
  const match = codeVal.match(/^\/\/ *#\[mod=([a-zA-Z0-9_]+)\]/m);
  return match?.[1] ? `${match[1]}.py` : "script.py";
};

const getGoFileName = (): string => {
  return "main.go";
};

const getTsxFileName = () => {
  return "App.tsx";
};

const getCppFileName = () => {
  return "main.cpp";
};

const getZigFileName = () => {
  return "main.zig";
};

interface RenderFileNameProps {
  name: string;
  pageBlocks: Block[];
  setBlocksAction: (b: Block[]) => void;
  block: Block;
}

function RenderFileName({
  name,
  pageBlocks,
  block,
  setBlocksAction,
}: RenderFileNameProps) {
  return (
    <input
      value={name}
      onChange={(e) => {
        const newBlocks = pageBlocks.map((b) =>
          b.id === block.id ? { ...b, title: e.target.value } : b,
        );
        setBlocksAction(newBlocks);
      }}
      className="bg-transparent text-muted-foreground text-sm font-mono focus:outline-none focus:text-primary h-full"
      placeholder="Nome do componente..."
    />
  );
}

interface EditorHeaderProps {
  block: Block;
  pageBlocks: Block[];
  setBlocksAction: (b: Block[]) => void;
  mode?: TsMode;
  babelReady: boolean;
  handleRunSimple: () => void;
  setMode?: (m: TsMode) => void;
  setShowPreview: (s: boolean) => void;
  showPreview: boolean;
  showConsole?: boolean;
  setShowConsole?: (s: boolean) => void;
  loadBabel?: () => void;
}

export function EditorHeader({
  block,
  pageBlocks,
  setBlocksAction,
  mode,
  babelReady,
  setMode,
  handleRunSimple,
  setShowPreview,
  loadBabel,
  showPreview,
  showConsole,
  setShowConsole,
}: EditorHeaderProps) {
  let fileName = getTsxFileName();
  switch (block.language) {
    case "cpp":
      fileName = getCppFileName();
      break;
    case "zig":
      fileName = getZigFileName();
      break;
    case "go":
      fileName = getGoFileName();
      break;
    case "python":
      fileName = getPythonFileName(block.content);
      break;
    case "rust":
      fileName = getRustFileName(block.content);
      break;
    case "typescript":
      fileName = getTsxFileName();
      break;
  }

  return (
    <div className="w-full grid p-2 grid-cols-1 md:flex">
      <div className="flex items-center gap-4">
        <div>
          {block.language === "typescript" ? (
            <div className="flex items-center gap-2 p-2 text-muted-foreground">
              <Terminal size={16} />
              <RenderFileName
                name={block.title}
                pageBlocks={pageBlocks}
                block={block}
                setBlocksAction={setBlocksAction}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 p-2 text-muted-foreground">
              <Terminal size={16} />
              <span className="text-xs font-mono uppercase tracking-widest">
                {fileName}
              </span>
            </div>
          )}
        </div>
      </div>
      {block.language === "typescript" && (
        <div className="grid grid-cols-1 md:flex flex-cols gap-2 w-full justify-end print:hidden">
          {mode === "simple" && (
            <button
              type="button"
              onClick={babelReady ? handleRunSimple : loadBabel}
              disabled={!babelReady}
              className="flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all print:hidden bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 disabled:bg-muted disabled:text-accent-violet disabled:cursor-not-allowed"
            >
              {babelReady ? (
                <>
                  <Play className="size-3.5 fill-current" /> Executar
                </>
              ) : (
                <>
                  <Clock className="size-3.5" /> Carregar o Compilador...
                </>
              )}
            </button>
          )}
          <Select
            {...(mode !== undefined ? { value: mode } : {})}
            onValueChange={(e) => {
              setMode?.(e as TsMode);
            }}
          >
            <SelectTrigger className="bg-transparent py-1.5 w-full justify-center md:w-44 border-none rounded text-foreground">
              <SelectValue placeholder="Selecione o modo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="advanced">Modo Sandpack</SelectItem>
              <SelectItem value="simple">Modo Nativo</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {showPreview ? (
              <>
                <Eye className="size-4" /> Ocultar Renderização
              </>
            ) : (
              <>
                <EyeClosed className="size-4" />
                Exibir Renderização
              </>
            )}
          </button>
          {mode === "advanced" && setShowConsole && (
            <button
              type="button"
              onClick={() => setShowConsole(!showConsole)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Terminal className="size-4" />
              {showConsole ? "Ocultar Console" : "Exibir Console"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
