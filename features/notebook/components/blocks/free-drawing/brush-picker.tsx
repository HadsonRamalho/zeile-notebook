"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { type Brush, brushSize, makeCustomBrush } from "./brushes";
import {
  BRUSH_SHAPE_LABEL_KEYS,
  BRUSH_SHAPES,
  type BrushShape,
  drawStroke,
  type StrokeElement,
} from "./engine";

function BrushPreview({ brush }: { brush: Brush }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const color = getComputedStyle(canvas).color || "#0f172a";

    const cap = h * 0.42;
    const scale = Math.min(
      1,
      cap / Math.max(brush.sizeStart, brush.sizeEnd, 1),
    );
    const points = [];
    const N = 28;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      points.push({
        x: 10 + u * (w - 20),
        y: h / 2 - Math.sin(u * Math.PI) * (h * 0.24),
        pressure: 0.55,
      });
    }
    const stroke: StrokeElement = {
      id: `preview-${brush.id}`,
      version: 1,
      kind: "stroke",
      layerId: "",
      order: 0,
      brush: "pen",
      color,
      size: brushSize(brush),
      opacity: 100,
      pressureSensitive: false,
      points,
      shape: brush.shape,
      sizeStart: brush.sizeStart * scale,
      sizeEnd: brush.sizeEnd * scale,
      opacityStart: brush.opacityStart,
      opacityEnd: brush.opacityEnd,
    };
    drawStroke(ctx, stroke);
  }, [brush]);

  return <canvas ref={ref} className="h-10 w-full text-foreground" />;
}

const NumberField = ({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) => (
  <div className="flex flex-col gap-1">
    <Label className="text-[11px] text-muted-foreground">{label}</Label>
    <Input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isNaN(n)) return;
        onChange(Math.min(max, Math.max(min, n)));
      }}
      className="h-8"
    />
  </div>
);

function CreateBrushForm({ onCreate }: { onCreate: (brush: Brush) => void }) {
  const t = useTranslations("free_drawing");
  const [name, setName] = useState("");
  const [shape, setShape] = useState<BrushShape>("pen");
  const [sizeStart, setSizeStart] = useState(8);
  const [sizeEnd, setSizeEnd] = useState(8);
  const [opacityStart, setOpacityStart] = useState(100);
  const [opacityEnd, setOpacityEnd] = useState(100);

  const preview: Brush = {
    id: "draft",
    name: name || t("brush_picker.new_brush_default_name"),
    shape,
    sizeStart,
    sizeEnd,
    opacityStart,
    opacityEnd,
  };

  const submit = () => {
    onCreate(
      makeCustomBrush({
        name: name.trim() || t(BRUSH_SHAPE_LABEL_KEYS[shape]),
        shape,
        sizeStart,
        sizeEnd,
        opacityStart,
        opacityEnd,
      }),
    );
    setName("");
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("brush_picker.create_title")}
      </span>

      <div className="rounded-md border border-border bg-card">
        <BrushPreview brush={preview} />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-[11px] text-muted-foreground">
          {t("brush_picker.name_label")}
        </Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(BRUSH_SHAPE_LABEL_KEYS[shape])}
          className="h-8"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-[11px] text-muted-foreground">
          {t("brush_picker.shape_label")}
        </Label>
        <div className="grid grid-cols-3 gap-1">
          {BRUSH_SHAPES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setShape(s)}
              className={cn(
                "rounded-md border px-2 py-1.5 text-[11px] transition-colors",
                s === shape
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {t(BRUSH_SHAPE_LABEL_KEYS[s])}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label={t("brush_picker.size_start")}
          value={sizeStart}
          min={1}
          max={120}
          onChange={setSizeStart}
        />
        <NumberField
          label={t("brush_picker.size_end")}
          value={sizeEnd}
          min={1}
          max={120}
          onChange={setSizeEnd}
        />
        <NumberField
          label={t("brush_picker.opacity_start")}
          value={opacityStart}
          min={1}
          max={100}
          onChange={setOpacityStart}
        />
        <NumberField
          label={t("brush_picker.opacity_end")}
          value={opacityEnd}
          min={1}
          max={100}
          onChange={setOpacityEnd}
        />
      </div>

      <Button type="button" size="sm" onClick={submit} className="gap-1.5">
        <Plus className="size-4" />
        {t("brush_picker.add_brush")}
      </Button>
    </div>
  );
}

export function BrushPicker({
  open,
  onOpenChange,
  brushes,
  activeBrushId,
  onSelect,
  onCreate,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brushes: Brush[];
  activeBrushId: string;
  onSelect: (id: string) => void;
  onCreate: (brush: Brush) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("free_drawing");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 max-md:top-auto max-md:bottom-0 max-md:translate-y-0 max-md:rounded-b-none max-md:max-w-full sm:max-w-md">
        <DialogHeader className="shrink-0 border-b border-border p-4">
          <DialogTitle>{t("brush_picker.title")}</DialogTitle>
          <DialogDescription>{t("brush_picker.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2">
            {brushes.map((brush) => (
              <div
                key={brush.id}
                className={cn(
                  "group/brush relative flex flex-col gap-1 rounded-lg border p-2 text-left transition-colors",
                  brush.id === activeBrushId
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent/50",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(brush.id);
                    onOpenChange(false);
                  }}
                  className="flex flex-col gap-1"
                >
                  <BrushPreview brush={brush} />
                  <span className="truncate text-xs font-medium text-foreground">
                    {brush.name}
                  </span>
                </button>
                {!brush.builtin && (
                  <button
                    type="button"
                    onClick={() => onDelete(brush.id)}
                    aria-label={t("brush_picker.delete_brush_aria", {
                      name: brush.name,
                    })}
                    className="absolute right-1 top-1 grid size-6 place-items-center rounded-md bg-card/80 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/brush:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <CreateBrushForm onCreate={onCreate} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
