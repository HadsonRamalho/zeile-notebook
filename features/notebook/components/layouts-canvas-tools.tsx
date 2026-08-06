import {
  Circle as CircleIcon,
  EyeIcon,
  EyeOffIcon,
  Hand,
  ImageIcon,
  LockIcon,
  Maximize,
  Maximize2,
  MinusIcon,
  MoreHorizontal,
  MousePointer2,
  Pen,
  PlusIcon,
  Share2,
  Square,
  Type,
  UnlockIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ShapeType = "rectangle" | "ellipse" | "text";
type Tool =
  | "move"
  | "hand"
  | "frame"
  | "ellipse"
  | "text"
  | "pen"
  | "image"
  | "more";

interface Shape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  opacity: number;
  visible: boolean;
  locked: boolean;
  text?: string | undefined;
  name: string;
}

const SWATCHES = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];

const TOOLS: {
  id: Tool;
  icon: typeof MousePointer2;
  label: string;
  shortcut: string;
}[] = [
  { id: "move", icon: MousePointer2, label: "Move", shortcut: "V" },
  { id: "hand", icon: Hand, label: "Hand", shortcut: "H" },
  { id: "frame", icon: Square, label: "Frame", shortcut: "F" },
  { id: "ellipse", icon: CircleIcon, label: "Ellipse", shortcut: "O" },
  { id: "text", icon: Type, label: "Text", shortcut: "T" },
  { id: "pen", icon: Pen, label: "Pen", shortcut: "P" },
  { id: "image", icon: ImageIcon, label: "Place image", shortcut: "I" },
  { id: "more", icon: MoreHorizontal, label: "More", shortcut: "" },
];

const SEED_SHAPES: Shape[] = [
  {
    id: "hero",
    type: "rectangle",
    x: 60,
    y: 220,
    width: 480,
    height: 280,
    fill: "#3b82f6",
    opacity: 100,
    visible: true,
    locked: false,
    name: "Hero",
  },
  {
    id: "card",
    type: "rectangle",
    x: 600,
    y: 80,
    width: 320,
    height: 180,
    fill: "#8b5cf6",
    opacity: 100,
    visible: true,
    locked: false,
    name: "Card",
  },
  {
    id: "avatar",
    type: "ellipse",
    x: -60,
    y: 300,
    width: 120,
    height: 120,
    fill: "#10b981",
    opacity: 70,
    visible: true,
    locked: false,
    name: "Avatar",
  },
];

const COLLAB = [
  { initials: "SK", tone: "bg-rose-500" },
  { initials: "MR", tone: "bg-emerald-500" },
  { initials: "JL", tone: "bg-sky-500" },
  { initials: "DV", tone: "bg-amber-500" },
];

interface Point {
  x: number;
  y: number;
}

type DragState =
  | {
      kind: "create";
      type: ShapeType;
      startW: Point;
      currentW: Point;
      fill: string;
    }
  | { kind: "move"; id: string; startW: Point; startShape: Shape }
  | { kind: "pan"; startScreen: Point; startPan: Point };

let idCounter = 1;
function nextId(prefix: string): string {
  return `${prefix}-${idCounter++}`;
}

function defaultName(type: ShapeType, n: number): string {
  if (type === "rectangle") return `Frame ${n}`;
  if (type === "ellipse") return `Ellipse ${n}`;
  return `Text ${n}`;
}

export function LayoutsCanvasToolsShowcasePage() {
  const [shapes, setShapes] = useState<Shape[]>(SEED_SHAPES);
  const [selectedId, setSelectedId] = useState<string | null>("hero");
  const [tool, setTool] = useState<Tool>("move");
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState<Point>({ x: 80, y: 60 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [creationCount, setCreationCount] = useState(1);

  const canvasRef = useRef<HTMLDivElement>(null);

  const selectedShape = shapes.find((s) => s.id === selectedId) ?? null;
  const isPanGesture = tool === "hand" || spaceDown;

  const updateShape = (id: string, patch: Partial<Shape>) => {
    setShapes((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  };

  const screenToWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan.x, pan.y, zoom],
  );

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const shapeEl = target.closest<HTMLElement>("[data-shape-id]");
    const clickedShapeId = shapeEl?.dataset.shapeId ?? null;
    const world = screenToWorld(e.clientX, e.clientY);

    if (isPanGesture) {
      setDrag({
        kind: "pan",
        startScreen: { x: e.clientX, y: e.clientY },
        startPan: { ...pan },
      });
      return;
    }

    if (clickedShapeId) {
      const shape = shapes.find((s) => s.id === clickedShapeId);
      if (!shape) return;
      setSelectedId(shape.id);
      if (tool === "move" && !shape.locked) {
        setDrag({
          kind: "move",
          id: shape.id,
          startW: world,
          startShape: shape,
        });
      }
      return;
    }

    if (tool === "frame" || tool === "ellipse" || tool === "text") {
      const shapeType: ShapeType =
        tool === "frame" ? "rectangle" : (tool as ShapeType);
      const fill = SWATCHES[creationCount % SWATCHES.length] ?? SWATCHES[0]!;
      setDrag({
        kind: "create",
        type: shapeType,
        startW: world,
        currentW: world,
        fill,
      });
      setSelectedId(null);
      return;
    }

    setSelectedId(null);
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      if (drag.kind === "pan") {
        const dx = e.clientX - drag.startScreen.x;
        const dy = e.clientY - drag.startScreen.y;
        setPan({ x: drag.startPan.x + dx, y: drag.startPan.y + dy });
        return;
      }
      const world = screenToWorld(e.clientX, e.clientY);
      if (drag.kind === "create") {
        setDrag({ ...drag, currentW: world });
        return;
      }
      if (drag.kind === "move") {
        const dx = world.x - drag.startW.x;
        const dy = world.y - drag.startW.y;
        setShapes((prev) =>
          prev.map((s) =>
            s.id === drag.id
              ? {
                  ...s,
                  x: drag.startShape.x + dx,
                  y: drag.startShape.y + dy,
                }
              : s,
          ),
        );
      }
    };
    const onUp = () => {
      if (drag.kind === "create") {
        const x1 = Math.min(drag.startW.x, drag.currentW.x);
        const y1 = Math.min(drag.startW.y, drag.currentW.y);
        const w = Math.abs(drag.currentW.x - drag.startW.x);
        const h = Math.abs(drag.currentW.y - drag.startW.y);
        if (w >= 4 && h >= 4) {
          const id = nextId(drag.type);
          const next = creationCount + 1;
          setShapes((prev) => [
            ...prev,
            {
              id,
              type: drag.type,
              x: x1,
              y: y1,
              width: drag.type === "text" ? Math.max(w, 80) : w,
              height: drag.type === "text" ? Math.max(h, 32) : h,
              fill: drag.fill,
              opacity: 100,
              visible: true,
              locked: false,
              text: drag.type === "text" ? "Text" : undefined,
              name: defaultName(drag.type, creationCount),
            },
          ]);
          setSelectedId(id);
          setCreationCount(next);
          setTool("move");
        }
      }
      setDrag(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, creationCount, screenToWorld]);

  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      return (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpaceDown(true);
        return;
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          e.preventDefault();
          setShapes((prev) => prev.filter((s) => s.id !== selectedId));
          setSelectedId(null);
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "v") setTool("move");
      else if (k === "h") setTool("hand");
      else if (k === "r" || k === "f") setTool("frame");
      else if (k === "o") setTool("ellipse");
      else if (k === "t") setTool("text");
      else if (k === "p") setTool("pen");
      else if (k === "i") setTool("image");
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [selectedId]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.01);
        setZoom((current) => {
          const next = Math.min(4, Math.max(0.25, current * factor));
          const wx = (sx - pan.x) / current;
          const wy = (sy - pan.y) / current;
          setPan({ x: sx - wx * next, y: sy - wy * next });
          return next;
        });
      } else {
        e.preventDefault();
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [pan.x, pan.y]);

  const onZoomChange = (delta: number) => {
    const el = canvasRef.current;
    if (!el) {
      setZoom((z) => Math.min(4, Math.max(0.25, z + delta)));
      return;
    }
    const rect = el.getBoundingClientRect();
    const sx = rect.width / 2;
    const sy = rect.height / 2;
    setZoom((current) => {
      const next = Math.min(4, Math.max(0.25, current + delta));
      const wx = (sx - pan.x) / current;
      const wy = (sy - pan.y) / current;
      setPan({ x: sx - wx * next, y: sy - wy * next });
      return next;
    });
  };

  const onFitToScreen = () => {
    const el = canvasRef.current;
    const visible = shapes.filter((s) => s.visible);
    if (!el || visible.length === 0) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const rect = el.getBoundingClientRect();
    const minX = Math.min(...visible.map((s) => s.x));
    const minY = Math.min(...visible.map((s) => s.y));
    const maxX = Math.max(...visible.map((s) => s.x + s.width));
    const maxY = Math.max(...visible.map((s) => s.y + s.height));
    const w = maxX - minX;
    const h = maxY - minY;
    const padding = 80;
    const scaleX = (rect.width - padding * 2) / w;
    const scaleY = (rect.height - padding * 2) / h;
    const next = Math.min(4, Math.max(0.25, Math.min(scaleX, scaleY)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setZoom(next);
    setPan({
      x: rect.width / 2 - cx * next,
      y: rect.height / 2 - cy * next,
    });
  };

  const visibleShapes = shapes.filter((s) => s.visible);
  const previewRect =
    drag?.kind === "create"
      ? {
          x: Math.min(drag.startW.x, drag.currentW.x),
          y: Math.min(drag.startW.y, drag.currentW.y),
          width: Math.abs(drag.currentW.x - drag.startW.x),
          height: Math.abs(drag.currentW.y - drag.startW.y),
          fill: drag.fill,
          type: drag.type,
        }
      : null;

  const cursorClass =
    drag?.kind === "pan"
      ? "cursor-grabbing"
      : isPanGesture
        ? "cursor-grab"
        : tool === "frame" || tool === "ellipse" || tool === "text"
          ? "cursor-crosshair"
          : "cursor-default";

  return (
    <div className="relative h-svh w-full select-none overflow-hidden bg-foreground/[0.02] text-foreground">
      <DotGrid pan={pan} zoom={zoom} />

      {/* biome-ignore lint/a11y/noStaticElementInteractions: superfície de desenho/pan por ponteiro, não é um controle discreto operável por teclado */}
      <div
        ref={canvasRef}
        className={cn("absolute inset-0", cursorClass)}
        onMouseDown={onCanvasMouseDown}
      >
        <div
          className="absolute top-0 left-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {visibleShapes.map((s) => (
            <ShapeRender
              key={s.id}
              shape={s}
              isSelected={s.id === selectedId}
              zoom={zoom}
              tool={tool}
            />
          ))}
          {previewRect && previewRect.width > 0 && previewRect.height > 0 ? (
            <div
              className="pointer-events-none absolute"
              style={{
                left: previewRect.x,
                top: previewRect.y,
                width: previewRect.width,
                height: previewRect.height,
              }}
            >
              <div
                className={cn(
                  "size-full",
                  previewRect.type === "ellipse"
                    ? "rounded-full"
                    : "rounded-md",
                )}
                style={{
                  backgroundColor: previewRect.fill,
                  opacity: 0.6,
                }}
              />
              <div
                className="pointer-events-none absolute inset-0 border-2 border-blue-500 border-dashed"
                style={{
                  borderRadius:
                    previewRect.type === "ellipse" ? "9999px" : "6px",
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      <ToolsPalette tool={tool} onChangeTool={setTool} />
      <CollabBar />
      <ZoomControls
        zoom={zoom}
        onIn={() => onZoomChange(0.1)}
        onOut={() => onZoomChange(-0.1)}
        onFit={onFitToScreen}
      />
      <StatusPill selected={selectedShape} total={shapes.length} />

      <Inspector
        shape={selectedShape}
        shapes={shapes}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onUpdate={updateShape}
        onToggleVisible={(id) =>
          setShapes((prev) =>
            prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)),
          )
        }
        onToggleLocked={(id) =>
          setShapes((prev) =>
            prev.map((s) => (s.id === id ? { ...s, locked: !s.locked } : s)),
          )
        }
        onDelete={(id) => {
          setShapes((prev) => prev.filter((s) => s.id !== id));
          if (selectedId === id) setSelectedId(null);
        }}
      />
    </div>
  );
}

function DotGrid({ pan, zoom }: { pan: Point; zoom: number }) {
  const size = 24 * zoom;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          "radial-gradient(color-mix(in oklab, var(--color-foreground) 18%, transparent) 1px, transparent 1px)",
        backgroundSize: `${size}px ${size}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    />
  );
}

function ShapeRender({
  shape,
  isSelected,
  zoom,
  tool,
}: {
  shape: Shape;
  isSelected: boolean;
  zoom: number;
  tool: Tool;
}) {
  const cursor =
    shape.locked || tool !== "move" ? "cursor-default" : "cursor-move";
  return (
    <div
      data-shape-id={shape.id}
      className={cn("absolute", cursor)}
      style={{
        left: shape.x,
        top: shape.y,
        width: shape.width,
        height: shape.height,
        opacity: shape.opacity / 100,
      }}
    >
      {shape.type === "ellipse" ? (
        <div
          className="size-full rounded-full"
          style={{ backgroundColor: shape.fill }}
        />
      ) : shape.type === "text" ? (
        <div
          className="flex size-full items-center justify-start font-heading"
          style={{
            color: shape.fill,
            fontSize: Math.max(16, shape.height * 0.5),
            lineHeight: 1,
          }}
        >
          {shape.text ?? "Text"}
        </div>
      ) : (
        <div
          className="size-full rounded-md"
          style={{ backgroundColor: shape.fill }}
        />
      )}
      {isSelected ? <SelectionFrame shape={shape} zoom={zoom} /> : null}
    </div>
  );
}

function SelectionFrame({ shape, zoom }: { shape: Shape; zoom: number }) {
  const handle = 8 / zoom;
  const stroke = 1.5 / zoom;
  const ringInset = -stroke;
  const handles: { left: number; top: number }[] = [
    { left: 0, top: 0 },
    { left: shape.width / 2, top: 0 },
    { left: shape.width, top: 0 },
    { left: 0, top: shape.height / 2 },
    { left: shape.width, top: shape.height / 2 },
    { left: 0, top: shape.height },
    { left: shape.width / 2, top: shape.height },
    { left: shape.width, top: shape.height },
  ];
  return (
    <>
      <div
        className="pointer-events-none absolute"
        style={{
          inset: ringInset,
          border: `${stroke}px solid rgb(59 130 246)`,
        }}
      />
      {handles.map((p, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: posições fixas de handles de resize, recalculadas a cada render, sem identidade própria
          key={i}
          className="pointer-events-none absolute bg-blue-500"
          style={{
            left: p.left - handle / 2,
            top: p.top - handle / 2,
            width: handle,
            height: handle,
            border: `${stroke}px solid white`,
          }}
        />
      ))}
    </>
  );
}

function ToolsPalette({
  tool,
  onChangeTool,
}: {
  tool: Tool;
  onChangeTool: (t: Tool) => void;
}) {
  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-0.5 rounded-xl border border-border bg-card/85 p-1 shadow-lg backdrop-blur">
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const isActive = tool === t.id;
        return (
          <Tooltip key={t.id}>
            <TooltipTrigger
              aria-label={t.label}
              aria-pressed={isActive}
              onClick={() => onChangeTool(t.id)}
              className={cn(
                "grid size-9 place-items-center rounded-md transition-colors",
                isActive
                  ? "bg-foreground/[0.1] text-foreground"
                  : "text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="right">
              <span className="flex items-center gap-2">
                {t.label}
                {t.shortcut ? (
                  <span className="rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                    {t.shortcut}
                  </span>
                ) : null}
              </span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function CollabBar() {
  return (
    <div className="-translate-x-1/2 absolute top-3 left-1/2 z-10 flex items-center gap-2 rounded-full border border-border bg-card/85 px-2 py-1 shadow-lg backdrop-blur">
      <div className="flex -space-x-1.5">
        {COLLAB.map((c) => (
          <Avatar
            key={c.initials}
            className={cn("size-7 text-white ring-2 ring-card", c.tone)}
          >
            <AvatarFallback className="bg-transparent font-medium text-[10px] text-white">
              {c.initials}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      <Separator orientation="vertical" className="h-5" />
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-2.5 py-1 font-medium text-[11px] text-background hover:bg-foreground/90"
      >
        <Share2 className="size-3" />
        Share
      </button>
    </div>
  );
}

function ZoomControls({
  zoom,
  onIn,
  onOut,
  onFit,
}: {
  zoom: number;
  onIn: () => void;
  onOut: () => void;
  onFit: () => void;
}) {
  const t = useTranslations("layouts_canvas_tools");
  return (
    <div className="absolute top-3 right-3 z-10 flex items-center gap-0.5 rounded-full border border-border bg-card/85 p-1 shadow-lg backdrop-blur">
      <Tooltip>
        <TooltipTrigger
          aria-label={t("zoom_out")}
          onClick={onOut}
          className="grid size-7 place-items-center rounded-full text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <MinusIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>{t("zoom_out")}</TooltipContent>
      </Tooltip>
      <span className="min-w-[42px] px-2 text-center font-mono text-foreground/80 text-xs tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <Tooltip>
        <TooltipTrigger
          aria-label={t("zoom_in")}
          onClick={onIn}
          className="grid size-7 place-items-center rounded-full text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <PlusIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>{t("zoom_in")}</TooltipContent>
      </Tooltip>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Tooltip>
        <TooltipTrigger
          aria-label={t("fit_to_screen")}
          onClick={onFit}
          className="grid size-7 place-items-center rounded-full text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <Maximize2 className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>{t("fit_to_screen")}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          aria-label={t("fullscreen")}
          className="grid size-7 place-items-center rounded-full text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <Maximize className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>{t("fullscreen")}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function StatusPill({
  selected,
  total,
}: {
  selected: Shape | null;
  total: number;
}) {
  return (
    <div className="absolute bottom-3 left-3 z-10 rounded-md border border-border bg-card/85 px-2 py-1 font-mono text-[10px] text-foreground/70 uppercase tracking-[0.2em] backdrop-blur">
      {selected
        ? `1 selected · ${Math.round(selected.width)} × ${Math.round(selected.height)}`
        : `${total} layer${total === 1 ? "" : "s"} · drag a tool to draw`}
    </div>
  );
}

function Inspector({
  shape,
  shapes,
  selectedId,
  onSelect,
  onUpdate,
  onToggleVisible,
  onToggleLocked,
  onDelete,
}: {
  shape: Shape | null;
  shapes: Shape[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Shape>) => void;
  onToggleVisible: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("layouts_canvas_tools");
  const tabs = [t("tabs.design"), t("tabs.prototype"), t("tabs.inspect")];
  return (
    <div className="absolute right-3 bottom-3 z-10 w-72 overflow-hidden rounded-xl border border-border bg-card/85 shadow-lg backdrop-blur">
      <div className="flex border-border border-b px-1 pt-1">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            type="button"
            disabled={i !== 0}
            className={cn(
              "flex-1 rounded-t-md px-2 py-1.5 font-medium text-[11px] transition-colors",
              i === 0
                ? "bg-foreground/[0.06] text-foreground"
                : "cursor-not-allowed text-muted-foreground",
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {!shape ? (
        <div className="px-3 py-6 text-center">
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.15em]">
            {t("no_selection_title")}
          </div>
          <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
            {t("no_selection_hint")}
          </p>
        </div>
      ) : (
        <div className="space-y-3 px-3 py-2">
          <InspectorSection title={t("section.position")}>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="X"
                value={Math.round(shape.x)}
                onChange={(v) => onUpdate(shape.id, { x: v })}
              />
              <NumberField
                label="Y"
                value={Math.round(shape.y)}
                onChange={(v) => onUpdate(shape.id, { y: v })}
              />
            </div>
          </InspectorSection>
          <InspectorSection title={t("section.size")}>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="W"
                value={Math.round(shape.width)}
                onChange={(v) => onUpdate(shape.id, { width: Math.max(4, v) })}
              />
              <NumberField
                label="H"
                value={Math.round(shape.height)}
                onChange={(v) => onUpdate(shape.id, { height: Math.max(4, v) })}
              />
            </div>
          </InspectorSection>
          <InspectorSection title={t("section.fill")}>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={t("fill_swatch_aria", { color: c })}
                    onClick={() => onUpdate(shape.id, { fill: c })}
                    className={cn(
                      "size-5 rounded-md border transition-shadow",
                      shape.fill === c
                        ? "border-foreground/60 ring-2 ring-foreground/20 ring-offset-2 ring-offset-card"
                        : "border-border hover:border-foreground/40",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="w-8 font-mono text-[10px] text-muted-foreground tabular-nums">
                  {shape.opacity}%
                </span>
                <Slider
                  className="flex-1"
                  max={100}
                  min={0}
                  value={[shape.opacity]}
                  onValueChange={(v) =>
                    onUpdate(shape.id, {
                      opacity: Math.round(Array.isArray(v) ? v[0]! : v),
                    })
                  }
                />
              </div>
            </div>
          </InspectorSection>
        </div>
      )}

      <Separator />

      <div className="px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.15em]">
            {t("layers_title")}
          </span>
          {shape ? (
            <button
              type="button"
              onClick={() => onDelete(shape.id)}
              className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.15em] hover:text-destructive"
            >
              {t("delete")}
            </button>
          ) : null}
        </div>
        <div className="space-y-0.5">
          {shapes.length === 0 ? (
            <p className="px-1.5 py-2 text-muted-foreground text-[11px]">
              {t("no_layers")}
            </p>
          ) : (
            [...shapes].reverse().map((layer) => {
              const isActive = selectedId === layer.id;
              return (
                // biome-ignore lint/a11y/useSemanticElements: não pode ser um button real, já contém um button aninhado para outra ação
                <div
                  key={layer.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(layer.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(layer.id);
                    }
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] transition-colors",
                    isActive
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "hover:bg-foreground/[0.05]",
                  )}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisible(layer.id);
                    }}
                    aria-label={layer.visible ? t("hide") : t("show")}
                    className="grid size-4 place-items-center text-foreground/50 hover:text-foreground"
                  >
                    {layer.visible ? (
                      <EyeIcon className="size-3" />
                    ) : (
                      <EyeOffIcon className="size-3" />
                    )}
                  </button>
                  <ShapeIcon type={layer.type} />
                  <span className="flex-1 truncate">{layer.name}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLocked(layer.id);
                    }}
                    aria-label={layer.locked ? t("unlock") : t("lock")}
                    className="grid size-4 place-items-center text-foreground/50 hover:text-foreground"
                  >
                    {layer.locked ? (
                      <LockIcon className="size-3" />
                    ) : (
                      <UnlockIcon className="size-3" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function ShapeIcon({ type }: { type: ShapeType }) {
  if (type === "ellipse")
    return <CircleIcon className="size-3 shrink-0 text-foreground/60" />;
  if (type === "text")
    return <Type className="size-3 shrink-0 text-foreground/60" />;
  return <Square className="size-3 shrink-0 text-foreground/60" />;
}

function InspectorSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.15em]">
        {title}
      </div>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => setLocal(String(value)), [value]);
  return (
    <label className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 has-focus:border-foreground/40">
      <span className="font-mono text-[10px] text-muted-foreground">
        {label}
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const n = Number(local);
          if (Number.isFinite(n)) onChange(n);
          else setLocal(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-full bg-transparent font-mono text-[11px] text-foreground tabular-nums outline-none"
      />
    </label>
  );
}
