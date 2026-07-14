"use client";

import { useId } from "react";
import type { CellValue } from "@/lib/cellResultsStore";
import type { ChartType } from "@/lib/types";

const SERIES_VARS = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
];

const W = 760;
const H = 340;
const MARGIN = { top: 16, right: 16, bottom: 44, left: 48 };
const PLOT_W = W - MARGIN.left - MARGIN.right;
const PLOT_H = H - MARGIN.top - MARGIN.bottom;

interface ChartSvgProps {
  chartType: ChartType;
  labels: string[];
  series: { name: string; values: number[] }[];
}

function seriesColor(index: number) {
  return `var(${SERIES_VARS[index % SERIES_VARS.length]})`;
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (min === max) return [min];
  const step = (max - min) / count;
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) ticks.push(min + step * i);
  return ticks;
}

function formatValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) >= 1000)
    return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return String(Math.round(value * 100) / 100);
}

export function ChartSvg({ chartType, labels, series }: ChartSvgProps) {
  const clipId = useId();

  const n = labels.length;
  const allValues = series.flatMap((s) => s.values).filter(Number.isFinite);
  const rawMax = allValues.length ? Math.max(...allValues) : 1;
  const rawMin = allValues.length ? Math.min(...allValues, 0) : 0;
  const yMax = rawMax === rawMin ? rawMax + 1 : rawMax;
  const yMin = rawMin;

  const xToPx = (i: number) =>
    MARGIN.left + (PLOT_W / Math.max(n, 1)) * (i + 0.5);
  const bandWidth = PLOT_W / Math.max(n, 1);
  const yToPx = (v: number) =>
    MARGIN.top + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H;

  const showEveryX = n > 12 ? Math.ceil(n / 12) : 1;
  const ticks = niceTicks(yMin, yMax, 4).map((value) => ({
    value,
    y: yToPx(value),
  }));
  const labelData = labels.map((label, i) => ({ label, i, cx: xToPx(i) }));

  const innerWidth = bandWidth * 0.7;
  const groupGap = 2;
  const barWidth = Math.max(
    1,
    (innerWidth - groupGap * (series.length - 1)) / series.length,
  );

  const seriesData = series.map((s, si) => ({
    name: s.name,
    color: seriesColor(si),
    si,
    points: s.values.map((value, i) => ({ value, i, cx: xToPx(i) })),
  }));

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Gráfico de dados"
        preserveAspectRatio="xMidYMid meet"
      >
        <title>Gráfico de dados</title>
        <clipPath id={clipId}>
          <rect x={MARGIN.left} y={MARGIN.top} width={PLOT_W} height={PLOT_H} />
        </clipPath>

        {ticks.map((tick) => (
          <g key={`tick-${tick.value}`}>
            <line
              x1={MARGIN.left}
              x2={W - MARGIN.right}
              y1={tick.y}
              y2={tick.y}
              className="stroke-border"
              strokeWidth={1}
              strokeOpacity={0.5}
            />
            <text
              x={MARGIN.left - 8}
              y={tick.y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              fontSize={11}
            >
              {formatValue(tick.value)}
            </text>
          </g>
        ))}

        {labelData.map((d) =>
          d.i % showEveryX === 0 ? (
            <text
              key={`xlabel-${d.i}`}
              x={d.cx}
              y={MARGIN.top + PLOT_H + 18}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={11}
            >
              {d.label.length > 12 ? `${d.label.slice(0, 11)}…` : d.label}
            </text>
          ) : null,
        )}

        <g clipPath={`url(#${clipId})`}>
          {chartType === "bar" &&
            seriesData.map((s) => (
              <g key={`bars-${s.name}`}>
                {s.points.map((p) => {
                  if (!Number.isFinite(p.value)) return null;
                  const x =
                    p.cx - innerWidth / 2 + s.si * (barWidth + groupGap);
                  const y = yToPx(Math.max(p.value, 0));
                  const height = Math.abs(yToPx(p.value) - yToPx(0));
                  return (
                    <rect
                      key={`bar-${s.name}-${p.i}`}
                      x={x}
                      y={y}
                      width={barWidth}
                      height={Math.max(height, 0)}
                      rx={2}
                      fill={s.color}
                    >
                      <title>{`${labels[p.i]} · ${s.name}: ${formatValue(p.value)}`}</title>
                    </rect>
                  );
                })}
              </g>
            ))}

          {(chartType === "line" || chartType === "area") &&
            seriesData.map((s) => {
              const points = s.points
                .filter((p) => Number.isFinite(p.value))
                .map((p) => `${p.cx},${yToPx(p.value)}`)
                .join(" ");
              const areaPath =
                chartType === "area"
                  ? `M ${xToPx(0)},${yToPx(yMin)} L ${s.points
                      .map((p) =>
                        Number.isFinite(p.value)
                          ? `${p.cx},${yToPx(p.value)}`
                          : `${p.cx},${yToPx(yMin)}`,
                      )
                      .join(" L ")} L ${xToPx(n - 1)},${yToPx(yMin)} Z`
                  : "";
              return (
                <g key={`line-${s.name}`}>
                  {chartType === "area" && (
                    <path d={areaPath} fill={s.color} fillOpacity={0.15} />
                  )}
                  <polyline
                    points={points}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {s.points.map((p) =>
                    Number.isFinite(p.value) ? (
                      <circle
                        key={`dot-${s.name}-${p.i}`}
                        cx={p.cx}
                        cy={yToPx(p.value)}
                        r={3}
                        fill={s.color}
                      >
                        <title>{`${labels[p.i]} · ${s.name}: ${formatValue(p.value)}`}</title>
                      </circle>
                    ) : null,
                  )}
                </g>
              );
            })}
        </g>
      </svg>

      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {series.map((s, si) => (
            <div key={`legend-${s.name}`} className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: seriesColor(si) }}
              />
              <span className="text-xs text-muted-foreground">{s.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function toNumber(value: CellValue): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
}
