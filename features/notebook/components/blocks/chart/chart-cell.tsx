"use client";

import { AreaChart, BarChart3, LineChart, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import type { CellValue } from "@/features/notebook/stores/cell-results-store";
import {
  parseInlineTable,
  type TableResult,
  useCellResult,
} from "@/features/notebook/stores/cell-results-store";
import { cn } from "@/lib/utils";
import type { Block, ChartType } from "@/types/block-types";
import { ChartSvg, toNumber } from "./chart-svg";

interface ChartCellProps {
  block: Block;
  pageBlocks: Block[];
  canWrite: boolean;
  updateBlock: (id: string, content: string) => void;
  updateBlockMetadata: (
    id: string,
    metadata: {
      type: "chart";
      props: {
        chartType: ChartType;
        sourceKind: "inline" | "cell";
        sourceBlockId?: string;
        x?: string;
        y?: string[];
      };
    },
  ) => void;
}

export const defaultChartContent = JSON.stringify(
  [
    { mes: "Jan", vendas: 12, custos: 8 },
    { mes: "Fev", vendas: 19, custos: 11 },
    { mes: "Mar", vendas: 15, custos: 9 },
    { mes: "Abr", vendas: 22, custos: 13 },
  ],
  null,
  2,
);

const CHART_TYPES: { type: ChartType; icon: typeof BarChart3 }[] = [
  { type: "bar", icon: BarChart3 },
  { type: "line", icon: LineChart },
  { type: "area", icon: AreaChart },
];

function readConfig(block: Block) {
  if (block.metadata?.type === "chart") return block.metadata.props;
  return {
    chartType: "bar" as ChartType,
    sourceKind: "inline" as const,
  };
}

function isNumericColumn(table: TableResult, colIndex: number) {
  const sample = table.rows
    .slice(0, 20)
    .map((row) => row[colIndex])
    .filter((v): v is CellValue => v !== null && v !== "" && v !== undefined);
  if (sample.length === 0) return false;
  return sample.every((v) => Number.isFinite(toNumber(v)));
}

export function ChartCell({
  block,
  pageBlocks,
  canWrite,
  updateBlock,
  updateBlockMetadata,
}: ChartCellProps) {
  const t = useTranslations("chart");
  const config = readConfig(block);
  const cellResult = useCellResult(
    config.sourceKind === "cell" ? config.sourceBlockId : undefined,
  );

  const table =
    config.sourceKind === "cell" ? cellResult : parseInlineTable(block.content);

  const sourceCandidates = useMemo(
    () =>
      pageBlocks.filter(
        (b) =>
          b.id !== block.id &&
          (b.type === "sql" || (b.type === "code" && b.language === "python")),
      ),
    [pageBlocks, block.id],
  );

  const [showConfig, setShowConfig] = useState(false);

  const columns = table?.columns ?? [];
  const numericColumns = useMemo(
    () => (table ? columns.filter((_, i) => isNumericColumn(table, i)) : []),
    [table, columns],
  );

  const xColumn =
    config.x ?? columns.find((c) => !numericColumns.includes(c)) ?? columns[0];
  const yColumns =
    config.y && config.y.length > 0
      ? config.y.filter((c) => columns.includes(c))
      : numericColumns.filter((c) => c !== xColumn);

  const { labels, series } = useMemo(() => {
    if (!table || !xColumn || yColumns.length === 0)
      return { labels: [] as string[], series: [] };
    const xIndex = table.columns.indexOf(xColumn);
    const rows = table.rows;
    return {
      labels: rows.map((row) => String(row[xIndex] ?? "")),
      series: yColumns.map((col) => {
        const idx = table.columns.indexOf(col);
        return {
          name: col,
          values: rows.map((row) => toNumber(row[idx] ?? null)),
        };
      }),
    };
  }, [table, xColumn, yColumns]);

  const update = (
    patch: Partial<{
      chartType: ChartType;
      sourceKind: "inline" | "cell";
      sourceBlockId?: string;
      x?: string;
      y?: string[];
    }>,
  ) => {
    updateBlockMetadata(block.id, {
      type: "chart",
      props: { ...config, ...patch },
    });
  };

  const toggleY = (col: string) => {
    const current = new Set(yColumns);
    if (current.has(col)) current.delete(col);
    else current.add(col);
    update({ y: Array.from(current) });
  };

  return (
    <div className="rounded-xl border border-border bg-card/40">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          {CHART_TYPES.map(({ type, icon: Icon }) => (
            <button
              key={type}
              type="button"
              disabled={!canWrite}
              onClick={() => update({ chartType: type })}
              aria-label={t(`type_${type}`)}
              title={t(`type_${type}`)}
              className={cn(
                "rounded-md p-1.5 transition-colors disabled:opacity-40",
                config.chartType === type
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowConfig((v) => !v)}
            aria-label={t("configure")}
            title={t("configure")}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              showConfig
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Settings2 className="size-4" />
          </button>
        )}
      </div>

      {canWrite && showConfig && (
        <div className="flex flex-col gap-3 border-b border-border bg-background/40 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("source")}
            </span>
            <select
              value={
                config.sourceKind === "inline"
                  ? "inline"
                  : (config.sourceBlockId ?? "")
              }
              onChange={(e) => {
                if (e.target.value === "inline") {
                  update({ sourceKind: "inline" });
                } else {
                  update({ sourceKind: "cell", sourceBlockId: e.target.value });
                }
              }}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            >
              <option value="inline">{t("source_inline")}</option>
              {sourceCandidates.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title || b.type}
                </option>
              ))}
            </select>
          </div>

          {config.sourceKind === "inline" && (
            <textarea
              value={block.content}
              onChange={(e) => updateBlock(block.id, e.target.value)}
              spellCheck={false}
              rows={4}
              placeholder={t("inline_placeholder")}
              className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
            />
          )}

          {columns.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("axis_x")}
              </span>
              <select
                value={xColumn ?? ""}
                onChange={(e) => update({ x: e.target.value })}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              >
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {columns.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("series")}
              </span>
              <div className="flex flex-wrap gap-2">
                {columns
                  .filter((c) => c !== xColumn)
                  .map((c) => (
                    <label
                      key={c}
                      className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={yColumns.includes(c)}
                        onChange={() => toggleY(c)}
                      />
                      {c}
                    </label>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        {series.length > 0 ? (
          <ChartSvg
            chartType={config.chartType}
            labels={labels}
            series={series}
          />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {config.sourceKind === "cell" ? t("empty_cell") : t("empty_inline")}
          </p>
        )}
      </div>
    </div>
  );
}
