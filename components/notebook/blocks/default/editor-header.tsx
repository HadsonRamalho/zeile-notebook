import { Clock, Cpu, Eye, EyeClosed, Play, Terminal, Wifi } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      className="bg-transparent text-muted-foreground text-sm font-mono focus:outline-none focus:text-emerald-400 h-full"
      placeholder="Nome do componente..."
    />
  );
}

interface EditorHeaderProps {
  block: Block;
  pageBlocks: Block[];
  setBlocksAction: (b: Block[]) => void;
  mode: TsMode;
  babelReady: boolean;
  handleRunSimple: () => void;
  setMode: (m: TsMode) => void;
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
            <div className="flex items-center justify-center gap-2 px-6 py-4 text-muted-foreground">
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
              className="px-3 py-1 text-xs bg-card text-foreground rounded transition-colors"
            >
              <div className="flex items-center justify-center gap-2">
                {babelReady ? (
                  <>
                    <Play className="size-4" /> Executar
                  </>
                ) : (
                  <>
                    <Clock /> Carregar o Compilador...
                  </>
                )}
              </div>
            </button>
          )}
          <Select
            onValueChange={(e) => {
              setMode(e as TsMode);
            }}
          >
            <SelectTrigger className="bg-transparent py-6 w-full justify-center md:w-44 border-none h-full rounded text-foreground">
              <SelectValue
                className="bg-transparent"
                placeholder={
                  mode === "advanced" ? (
                    <div className="flex justify-center">
                      <Wifi />
                      Modo Sandpack
                    </div>
                  ) : (
                    <div className="flex justify-center">
                      <Cpu />
                      Modo Nativo
                    </div>
                  )
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="advanced">
                  <Wifi />
                  Modo Sandpack
                </SelectItem>
                <SelectItem value="simple">
                  <Cpu />
                  Modo Nativo
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="px-3 py-1 text-xs bg-transparent text-foreground rounded transition-colors"
          >
            {showPreview ? (
              <div className="flex items-center justify-center gap-2">
                <Eye className="size-4" /> Ocultar Renderização
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <EyeClosed className="size-4" />
                Exibir Renderização
              </div>
            )}
          </button>
          {mode === "advanced" && setShowConsole && (
            <button
              type="button"
              onClick={() => setShowConsole(!showConsole)}
              className="px-3 py-1 text-xs bg-transparent text-foreground rounded transition-colors"
            >
              <div className="flex items-center justify-center gap-2">
                <Terminal className="size-4" />
                {showConsole ? "Ocultar Console" : "Exibir Console"}
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
