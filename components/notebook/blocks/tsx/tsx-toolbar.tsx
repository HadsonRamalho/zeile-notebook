"use client";

import { Clock, Cpu, Eye, EyeClosed, Play, Wifi } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TsMode } from "@/lib/types";

interface TsxToolbar {
  mode: TsMode;
  babelReady: boolean;
  handleRunSimple: () => void;
  setMode: (m: TsMode) => void;
  setShowPreview: (s: boolean) => void;
  showPreview: boolean;
}

export function TsxToolbar({
  mode,
  babelReady,
  handleRunSimple,
  setMode,
  setShowPreview,
  showPreview,
}: TsxToolbar) {
  return (
    <div className="grid grid-cols-1 md:flex flex-cols gap-2 w-full justify-end">
      {mode === "simple" && (
        <button
          type="button"
          disabled={!babelReady}
          onClick={handleRunSimple}
          className="px-3 py-1 text-xs bg-[#333] hover:bg-[#444] text-white rounded transition-colors"
        >
          <div className="flex items-center justify-center gap-2">
            {babelReady ? (
              <>
                <Play className="size-4" /> Executar
              </>
            ) : (
              <>
                <Clock /> Carregando o Compilador...
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
        <SelectTrigger className="bg-[#333] hover:bg-[#444] py-5 w-full justify-center md:w-44 h-full rounded text-foreground">
          <SelectValue
            placeholder={
              mode === "advanced" ? (
                <div className="flex justify-center">
                  <Wifi /> Modo Sandpack
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
              <Wifi /> Modo Sandpack
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
        className="px-3 py-1 text-xs bg-[#333] hover:bg-[#444] text-white rounded transition-colors"
      >
        {showPreview ? (
          <div className="flex items-center justify-center gap-2">
            <Eye className="size-4" /> Ocultar Renderização
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <EyeClosed className="size-4" />
            Mostrar Renderização
          </div>
        )}
      </button>
    </div>
  );
}
