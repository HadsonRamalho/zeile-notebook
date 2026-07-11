"use client";

import { Reorder, useDragControls } from "framer-motion";
import {
  ChevronDown,
  Download,
  Eraser,
  EyeIcon,
  EyeOffIcon,
  Focus,
  GripVertical,
  Hand,
  Layers,
  LockIcon,
  Maximize2,
  Minimize2,
  PaintBucket,
  Paintbrush,
  Palette,
  PlusIcon,
  Redo2,
  Scan,
  Trash2,
  Undo2,
  UnlockIcon,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { readSceneElements, sceneSignature } from "@/lib/drawing-scene";
import type { DrawingElement, Notebook } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type Camera,
  type CanvasSettingsElement,
  computeContentBounds,
  DEFAULT_CAMERA,
  defaultCanvasSettings,
  defaultLayer,
  drawLaser,
  exportSceneToCanvas,
  findTopStrokeAt,
  type FreeDrawingElement,
  isCanvasSettings,
  isLayer,
  isStroke,
  LASER_FADE_MS,
  type LaserStroke,
  type LayerElement,
  nextElementId,
  renderScene,
  type StrokeElement,
  type StrokePoint,
  upsertCanvasSettings,
} from "./engine";
import {
  type Brush,
  BUILTIN_BRUSHES,
  brushSize,
  loadCustomBrushes,
  saveCustomBrushes,
  scaleBrushSize,
} from "./brushes";
import { BrushPicker } from "./brush-picker";

type ToolKind = "draw" | "eraser" | "bucket" | "hand" | "laser";

const SWATCHES = [
  "#0f172a",
  "#ffffff",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
];

const TOOL_ICONS: Record<ToolKind, typeof Paintbrush> = {
  draw: Paintbrush,
  eraser: Eraser,
  bucket: PaintBucket,
  hand: Hand,
  laser: Zap,
};

const TOOL_LABELS: Record<ToolKind, string> = {
  draw: "Pincel",
  eraser: "Borracha",
  bucket: "Balde de tinta",
  hand: "Mão (mover)",
  laser: "Laser (temporário)",
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const EXPORT_PADDING = 10;

// Compacta o slider de arrasto (o base-ui aplica min-w-44 por padrão, largo
// demais para as pílulas estreitas da toolbar aqui).
const COMPACT_SLIDER = "[&_[data-slot=slider-control]]:min-w-0";

interface FreeDrawingCellProps {
  doc: Notebook | null;
  blockId: string;
  updateDrawingScene: (
    blockId: string,
    elements: readonly DrawingElement[],
  ) => void;
  canWrite: boolean;
}

const MAX_HISTORY = 50;

export function FreeDrawingCell({
  doc,
  blockId,
  updateDrawingScene,
  canWrite,
}: FreeDrawingCellProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [elements, setElements] = useState<FreeDrawingElement[]>(() => {
    const seeded = readSceneElements(
      doc,
      blockId,
    ) as unknown as FreeDrawingElement[];
    return seeded.length > 0 ? seeded : [defaultLayer(0, "Camada 1")];
  });
  const [activeLayerId, setActiveLayerId] = useState<string | null>(
    () => elements.find(isLayer)?.id ?? null,
  );
  const [tool, setTool] = useState<ToolKind>("draw");
  const [color, setColor] = useState("#0f172a");
  const [brushes, setBrushes] = useState<Brush[]>(BUILTIN_BRUSHES);
  const [activeBrushId, setActiveBrushId] = useState<string>(
    BUILTIN_BRUSHES[0]!.id,
  );
  const [eraserSize, setEraserSize] = useState(8);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Vive aqui (não dentro de LayersPanel) porque o painel desmonta ao entrar
  // em modo foco (só é renderizado quando `!focusMode`) — um `useState`
  // local perderia o estado de minimizado a cada entrada/saída do foco.
  const [layersMinimized, setLayersMinimized] = useState(false);
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const panState = useRef<{
    startScreen: { x: number; y: number };
    startCamera: Camera;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const hitCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const lastSyncedSig = useRef<string>(sceneSignature(elements));
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoStack = useRef<FreeDrawingElement[][]>([]);
  const redoStack = useRef<FreeDrawingElement[][]>([]);

  const pendingStroke = useRef<StrokeElement | null>(null);
  const [, forceTick] = useState(0);
  const orderCounter = useRef(elements.length);
  const opacityBaseline = useRef<FreeDrawingElement[] | null>(null);
  const reorderBaseline = useRef<FreeDrawingElement[] | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const laserStrokes = useRef<LaserStroke[]>([]);
  const activeLaserId = useRef<string | null>(null);
  const laserRaf = useRef<number | null>(null);

  const activeBrush = brushes.find((b) => b.id === activeBrushId) ?? brushes[0]!;

  useEffect(() => {
    const custom = loadCustomBrushes();
    if (custom.length > 0) setBrushes([...BUILTIN_BRUSHES, ...custom]);
  }, []);

  const createBrush = (brush: Brush) => {
    setBrushes((prev) => {
      const next = [...prev, brush];
      saveCustomBrushes(next);
      return next;
    });
    setActiveBrushId(brush.id);
  };

  const deleteBrush = (id: string) => {
    setBrushes((prev) => {
      const next = prev.filter((b) => b.id !== id);
      saveCustomBrushes(next);
      return next;
    });
    if (activeBrushId === id) setActiveBrushId(BUILTIN_BRUSHES[0]!.id);
  };

  const setActiveBrushSize = (nextSize: number) => {
    setBrushes((prev) => {
      const next = prev.map((b) =>
        b.id === activeBrushId ? scaleBrushSize(b, nextSize) : b,
      );
      saveCustomBrushes(next);
      return next;
    });
  };

  // Reconcilia mudanças remotas (outros peers) na cena, com a mesma
  // detecção de eco por assinatura de conteúdo usada no bloco de Excalidraw.
  useEffect(() => {
    const remote = readSceneElements(
      doc,
      blockId,
    ) as unknown as FreeDrawingElement[];
    const sig = sceneSignature(remote);
    if (sig === lastSyncedSig.current) return;
    lastSyncedSig.current = sig;
    const next = remote.length > 0 ? remote : [defaultLayer(0, "Camada 1")];
    setElements(next);
    if (!next.some((e) => isLayer(e) && e.id === activeLayerId)) {
      setActiveLayerId(next.find(isLayer)?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, blockId]);

  useEffect(() => {
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
  }, []);

  const commit = useCallback(
    (next: FreeDrawingElement[], pushHistory: FreeDrawingElement[] | null) => {
      if (pushHistory) {
        undoStack.current = [...undoStack.current, pushHistory].slice(
          -MAX_HISTORY,
        );
        redoStack.current = [];
      }
      setElements(next);
      const sig = sceneSignature(next as unknown as DrawingElement[]);
      if (sig === lastSyncedSig.current) return;
      lastSyncedSig.current = sig;
      if (commitTimer.current) clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => {
        updateDrawingScene(blockId, next as unknown as DrawingElement[]);
      }, 250);
    },
    [blockId, updateDrawingScene],
  );

  const layers = useMemo(
    () => elements.filter(isLayer).sort((a, b) => a.order - b.order),
    [elements],
  );
  const strokes = useMemo(() => elements.filter(isStroke), [elements]);
  const activeLayer = layers.find((l) => l.id === activeLayerId) ?? null;
  const canvasSettings = useMemo(
    () => elements.find(isCanvasSettings) ?? defaultCanvasSettings(),
    [elements],
  );

  // Canvas fora da tela usado só como "régua" geométrica para o balde de
  // tinta (isPointInPath/isPointInStroke não precisam de pixels desenhados).
  if (!hitCtxRef.current && typeof document !== "undefined") {
    hitCtxRef.current = document.createElement("canvas").getContext("2d");
  }

  // Redimensiona o canvas para acompanhar o container (e o redimensionamento
  // vertical manual do bloco).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setCanvasSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Impede que o scroll (vertical ou horizontal) dentro do bloco vaze para a
  // página do notebook — em vez disso, vira pan do canvas infinito. Precisa
  // ser um listener nativo com passive:false (o onWheel do React é anexado
  // como passivo e não consegue preventDefault). Ctrl/Cmd+wheel dá zoom
  // centrado no cursor, igual Excalidraw/Figma.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        setCamera((cur) => {
          const factor = Math.exp(-e.deltaY * 0.01);
          const nextZoom = Math.min(
            MAX_ZOOM,
            Math.max(MIN_ZOOM, cur.zoom * factor),
          );
          const wx = (sx - cur.x) / cur.zoom;
          const wy = (sy - cur.y) / cur.zoom;
          return {
            zoom: nextZoom,
            x: sx - wx * nextZoom,
            y: sy - wy * nextZoom,
          };
        });
      } else {
        setCamera((cur) => ({
          ...cur,
          x: cur.x - e.deltaX,
          y: cur.y - e.deltaY,
        }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasSize.width === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = Math.max(1, Math.round(canvasSize.width * dpr));
    canvas.height = Math.max(1, Math.round(canvasSize.height * dpr));
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;

    const liveStrokes = pendingStroke.current
      ? [...strokes, pendingStroke.current]
      : strokes;
    renderScene(
      ctx,
      canvasSize.width,
      canvasSize.height,
      dpr,
      camera,
      layers,
      liveStrokes,
      offscreenRef.current,
    );

    if (laserStrokes.current.length > 0) {
      drawLaser(
        ctx,
        canvasSize.width,
        canvasSize.height,
        dpr,
        camera,
        laserStrokes.current,
        Date.now(),
      );
    }
  }, [canvasSize, dpr, camera, layers, strokes]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Loop de animação do laser: enquanto houver traços vivos, redesenha e poda
  // os que já esvaeceram. Traços de laser são efêmeros e não entram na cena.
  const tickLaser = useCallback(() => {
    if (laserRaf.current !== null) return;
    const loop = () => {
      laserRaf.current = null;
      const now = Date.now();
      laserStrokes.current = laserStrokes.current.filter(
        (l) => l.releasedAt === null || now - l.releasedAt < LASER_FADE_MS,
      );
      redraw();
      if (laserStrokes.current.length > 0) {
        laserRaf.current = requestAnimationFrame(loop);
      }
    };
    laserRaf.current = requestAnimationFrame(loop);
  }, [redraw]);

  useEffect(() => {
    return () => {
      if (laserRaf.current !== null) cancelAnimationFrame(laserRaf.current);
    };
  }, []);

  // Converte um ponto de tela (relativo ao canvas) para o espaço-mundo do
  // canvas infinito, desfazendo o pan/zoom atual da câmera.
  const screenToWorld = useCallback(
    (clientX: number, clientY: number, rect: DOMRect) => ({
      x: (clientX - rect.left - camera.x) / camera.zoom,
      y: (clientY - rect.top - camera.y) / camera.zoom,
    }),
    [camera],
  );

  const getPoint = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
      const rect = e.currentTarget.getBoundingClientRect();
      const world = screenToWorld(e.clientX, e.clientY, rect);
      return {
        ...world,
        pressure: e.pointerType === "pen" ? e.pressure || 0.5 : 0.5,
      };
    },
    [screenToWorld],
  );

  const applyBucket = (x: number, y: number) => {
    const hitCtx = hitCtxRef.current;
    if (!hitCtx) return;
    const hit = findTopStrokeAt(hitCtx, layers, strokes, x, y);
    if (hit) {
      commit(
        elements.map((e) =>
          isStroke(e) && e.id === hit.id ? { ...e, color } : e,
        ),
        elements,
      );
      return;
    }
    const next: CanvasSettingsElement = {
      ...canvasSettings,
      backgroundMode: "custom",
      backgroundColor: color,
    };
    commit(upsertCanvasSettings(elements, next), elements);
  };

  const zoomBy = (factor: number) => {
    const el = containerRef.current;
    const rect = el?.getBoundingClientRect();
    const sx = rect ? rect.width / 2 : 0;
    const sy = rect ? rect.height / 2 : 0;
    setCamera((cur) => {
      const nextZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, cur.zoom * factor),
      );
      const wx = (sx - cur.x) / cur.zoom;
      const wy = (sy - cur.y) / cur.zoom;
      return { zoom: nextZoom, x: sx - wx * nextZoom, y: sy - wy * nextZoom };
    });
  };

  const fitToContent = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    const bounds = computeContentBounds(strokes);
    if (!rect || !bounds) {
      setCamera(DEFAULT_CAMERA);
      return;
    }
    const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
    const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
    const margin = 48;
    const nextZoom = Math.min(
      MAX_ZOOM,
      Math.max(
        MIN_ZOOM,
        Math.min(
          (rect.width - margin * 2) / contentWidth,
          (rect.height - margin * 2) / contentHeight,
        ),
      ),
    );
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    setCamera({
      zoom: nextZoom,
      x: rect.width / 2 - cx * nextZoom,
      y: rect.height / 2 - cy * nextZoom,
    });
  };

  const exportPng = () => {
    const visibleStrokes = strokes.filter((s) =>
      layers.some((l) => l.id === s.layerId && l.visible),
    );
    const bounds = computeContentBounds(visibleStrokes);
    if (!bounds) return;
    const exportScale = Math.max(2, dpr);
    const canvas = exportSceneToCanvas(
      layers,
      strokes,
      bounds,
      EXPORT_PADDING,
      exportScale,
      {
        mode: canvasSettings.backgroundMode,
        color: canvasSettings.backgroundColor,
      },
    );
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `desenho-${blockId}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  const setBackgroundCustom = (bg: string) => {
    const next: CanvasSettingsElement = {
      ...canvasSettings,
      backgroundMode: "custom",
      backgroundColor: bg,
    };
    commit(upsertCanvasSettings(elements, next), elements);
  };

  const setBackgroundTheme = () => {
    const next: CanvasSettingsElement = {
      ...canvasSettings,
      backgroundMode: "theme",
    };
    commit(upsertCanvasSettings(elements, next), elements);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canWrite) return;
    if (e.button !== 0) return;
    if (tool === "hand") {
      e.currentTarget.setPointerCapture(e.pointerId);
      panState.current = {
        startScreen: { x: e.clientX, y: e.clientY },
        startCamera: camera,
      };
      return;
    }
    if (tool === "bucket") {
      const rect = e.currentTarget.getBoundingClientRect();
      const world = screenToWorld(e.clientX, e.clientY, rect);
      applyBucket(world.x, world.y);
      return;
    }
    if (tool === "laser") {
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = getPoint(e);
      const id = nextElementId("laser");
      activeLaserId.current = id;
      laserStrokes.current = [
        ...laserStrokes.current,
        { id, points: [{ x: p.x, y: p.y }], bornAt: Date.now(), releasedAt: null },
      ];
      tickLaser();
      return;
    }
    if (!activeLayer || activeLayer.locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    orderCounter.current += 1;
    pendingStroke.current =
      tool === "eraser"
        ? {
            id: nextElementId("stroke"),
            version: 1,
            kind: "stroke",
            layerId: activeLayer.id,
            order: orderCounter.current,
            brush: "eraser",
            color,
            size: eraserSize,
            opacity: 100,
            pressureSensitive: e.pointerType === "pen",
            points: [getPoint(e)],
          }
        : {
            id: nextElementId("stroke"),
            version: 1,
            kind: "stroke",
            layerId: activeLayer.id,
            order: orderCounter.current,
            brush: "pen",
            color,
            size: brushSize(activeBrush),
            opacity: activeBrush.opacityStart,
            pressureSensitive: e.pointerType === "pen",
            points: [getPoint(e)],
            shape: activeBrush.shape,
            sizeStart: activeBrush.sizeStart,
            sizeEnd: activeBrush.sizeEnd,
            opacityStart: activeBrush.opacityStart,
            opacityEnd: activeBrush.opacityEnd,
          };
    forceTick((t) => t + 1);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (panState.current) {
      const { startScreen, startCamera } = panState.current;
      setCamera({
        ...startCamera,
        x: startCamera.x + (e.clientX - startScreen.x),
        y: startCamera.y + (e.clientY - startScreen.y),
      });
      return;
    }
    if (activeLaserId.current) {
      const p = getPoint(e);
      const laser = laserStrokes.current.find(
        (l) => l.id === activeLaserId.current,
      );
      laser?.points.push({ x: p.x, y: p.y });
      return;
    }
    if (!pendingStroke.current) return;
    pendingStroke.current.points.push(getPoint(e));
    redraw();
  };

  const releaseLaser = () => {
    if (!activeLaserId.current) return;
    const laser = laserStrokes.current.find(
      (l) => l.id === activeLaserId.current,
    );
    if (laser) laser.releasedAt = Date.now();
    activeLaserId.current = null;
    tickLaser();
  };

  const finishStroke = () => {
    const stroke = pendingStroke.current;
    pendingStroke.current = null;
    if (!stroke || stroke.points.length < 2) {
      forceTick((t) => t + 1);
      return;
    }
    commit([...elements, stroke], elements);
  };

  const onPointerUp = () => {
    panState.current = null;
    releaseLaser();
    finishStroke();
  };
  const onPointerLeave = () => {
    panState.current = null;
    releaseLaser();
    if (pendingStroke.current) finishStroke();
  };

  const addLayer = () => {
    const layer = defaultLayer(
      orderCounter.current + 1,
      `Camada ${layers.length + 1}`,
    );
    orderCounter.current += 1;
    commit([...elements, layer], elements);
    setActiveLayerId(layer.id);
  };

  const updateLayer = (
    id: string,
    patch: Partial<LayerElement>,
    pushHistory: FreeDrawingElement[] | null = elements,
  ) => {
    commit(
      elements.map((e) => (isLayer(e) && e.id === id ? { ...e, ...patch } : e)),
      pushHistory,
    );
  };

  // Slider de opacidade dispara onValueChange a cada pixel arrastado; só
  // registra 1 entrada de undo por arraste (baseline capturado no início,
  // consolidado em onLayerOpacityCommit ao soltar).
  const onLayerOpacityChange = (id: string, opacity: number) => {
    if (opacityBaseline.current === null) opacityBaseline.current = elements;
    updateLayer(id, { opacity }, null);
  };

  const onLayerOpacityCommit = () => {
    if (opacityBaseline.current) {
      undoStack.current = [...undoStack.current, opacityBaseline.current].slice(
        -MAX_HISTORY,
      );
      redoStack.current = [];
      opacityBaseline.current = null;
    }
  };

  // `visualTopToBottom` é a lista exibida no painel (camada do topo primeiro).
  // framer-motion chama onReorder a cada troca de posição durante o arraste;
  // só registra 1 entrada de undo por arraste inteiro (mesmo padrão do slider
  // de opacidade), consolidada em onReorderLayersCommit ao soltar.
  const onReorderLayers = (visualTopToBottom: LayerElement[]) => {
    if (reorderBaseline.current === null) reorderBaseline.current = elements;
    const bottomToTop = [...visualTopToBottom].reverse();
    const orderById = new Map(bottomToTop.map((l, i) => [l.id, i]));
    commit(
      elements.map((e) =>
        isLayer(e) ? { ...e, order: orderById.get(e.id) ?? e.order } : e,
      ),
      null,
    );
  };

  const onReorderLayersCommit = () => {
    if (reorderBaseline.current) {
      undoStack.current = [...undoStack.current, reorderBaseline.current].slice(
        -MAX_HISTORY,
      );
      redoStack.current = [];
      reorderBaseline.current = null;
    }
  };

  const renameLayer = (id: string, name: string) => {
    updateLayer(id, { name });
  };

  const deleteLayer = (id: string) => {
    if (layers.length <= 1) return;
    const next = elements.filter((e) => !(isLayer(e) && e.id === id));
    const cleaned = next.filter((e) => !(isStroke(e) && e.layerId === id));
    commit(cleaned, elements);
    if (activeLayerId === id) {
      setActiveLayerId(cleaned.find(isLayer)?.id ?? null);
    }
    toast("Camada excluída — Ctrl+Z para desfazer");
  };

  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current = [...redoStack.current, elements];
    setElements(prev);
    const sig = sceneSignature(prev as unknown as DrawingElement[]);
    lastSyncedSig.current = sig;
    updateDrawingScene(blockId, prev as unknown as DrawingElement[]);
  };

  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current = [...undoStack.current, elements];
    setElements(next);
    const sig = sceneSignature(next as unknown as DrawingElement[]);
    lastSyncedSig.current = sig;
    updateDrawingScene(blockId, next as unknown as DrawingElement[]);
  };

  // Ctrl+Z desfaz, Ctrl+Shift+Z ou Ctrl+Y refaz (ou Cmd no mac) — só quando o
  // cursor está sobre este bloco, pra não roubar o atalho de outros
  // blocos/editores na mesma página.
  useEffect(() => {
    if (!canWrite || !isHovered) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const isTypingTarget =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable);
      if (isTypingTarget) return;
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;
      const key = e.key.toLowerCase();
      if (key === "y") {
        e.preventDefault();
        redo();
      } else if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canWrite, isHovered, undo, redo]);

  return (
    <div
      style={
        fullscreen
          ? undefined
          : {
              height: 480,
              minHeight: 480,
              maxHeight: 960,
              resize: "vertical",
              overflow: "hidden",
            }
      }
      className={cn(
        "relative w-full rounded-lg border bg-card print:!h-auto print:!max-h-none print:!overflow-visible",
        fullscreen && "fixed inset-0 z-overlay bg-background",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          "print:hidden absolute right-2 top-2 flex items-center gap-1.5",
          fullscreen ? "z-overlay-controls" : "z-10",
        )}
      >
        <button
          type="button"
          onClick={() => setFocusMode((v) => !v)}
          aria-pressed={focusMode}
          className={cn(
            "rounded-md border border-border p-1.5 shadow-lg backdrop-blur hover:bg-foreground/[0.06] hover:text-foreground",
            focusMode
              ? "bg-foreground/[0.1] text-foreground"
              : "bg-card/85 text-foreground/70",
            // Em tela cheia no mobile, o botão de foco sai daqui e aparece
            // centralizado embaixo (ver bloco fixed abaixo) — mais alcançável
            // com o polegar do que o canto superior.
            fullscreen && "max-md:hidden",
          )}
          title={focusMode ? "Sair do modo foco" : "Modo foco"}
          aria-label={focusMode ? "Sair do modo foco" : "Modo foco"}
        >
          <Focus size={16} />
        </button>
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          className="rounded-md border border-border bg-card/85 p-1.5 text-foreground/70 shadow-lg backdrop-blur hover:bg-foreground/[0.06] hover:text-foreground"
          title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
          aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        {!focusMode && (
          <button
            type="button"
            onClick={exportPng}
            className="rounded-md border border-border bg-card/85 p-1.5 text-foreground/70 shadow-lg backdrop-blur hover:bg-foreground/[0.06] hover:text-foreground"
            title="Exportar como PNG"
            aria-label="Exportar como PNG"
          >
            <Download size={16} />
          </button>
        )}
      </div>

      {fullscreen && (
        <button
          type="button"
          onClick={() => setFocusMode((v) => !v)}
          aria-pressed={focusMode}
          className={cn(
            "print:hidden -translate-x-1/2 fixed bottom-4 left-1/2 z-overlay-controls rounded-md border border-border p-2 shadow-lg backdrop-blur hover:bg-foreground/[0.06] hover:text-foreground md:hidden",
            focusMode
              ? "bg-foreground/[0.1] text-foreground"
              : "bg-card/85 text-foreground/70",
          )}
          title={focusMode ? "Sair do modo foco" : "Modo foco"}
          aria-label={focusMode ? "Sair do modo foco" : "Modo foco"}
        >
          <Focus size={16} />
        </button>
      )}

      <div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden rounded-lg"
      >
        <div
          className={cn(
            "absolute inset-0",
            canvasSettings.backgroundMode === "theme" && "bg-background",
          )}
          style={
            canvasSettings.backgroundMode === "custom"
              ? { backgroundColor: canvasSettings.backgroundColor }
              : undefined
          }
        />
        <canvas
          ref={canvasRef}
          className={cn(
            "absolute inset-0 touch-none",
            canWrite
              ? tool === "bucket"
                ? "cursor-copy"
                : tool === "hand"
                  ? "cursor-grab active:cursor-grabbing"
                  : "cursor-crosshair"
              : "cursor-default",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
        />

        {canWrite && !focusMode && (
          <div className="print:hidden contents">
            <BrushPalette
              tool={tool}
              activeBrush={activeBrush}
              onSelectTool={setTool}
              onOpenBrushes={() => {
                setTool("draw");
                setPickerOpen(true);
              }}
              onUndo={undo}
              onRedo={redo}
            />
            {(tool === "draw" || tool === "eraser") && (
              <BrushSizePopover
                label={tool === "eraser" ? "Borracha" : activeBrush.name}
                size={
                  tool === "eraser" ? eraserSize : brushSize(activeBrush)
                }
                onSize={(v) =>
                  tool === "eraser" ? setEraserSize(v) : setActiveBrushSize(v)
                }
              />
            )}
            <ColorPicker color={color} onColor={setColor} />
            <BackgroundControl
              settings={canvasSettings}
              onCustom={setBackgroundCustom}
              onFollowTheme={setBackgroundTheme}
            />
            <LayersPanel
              layers={layers}
              activeLayerId={activeLayerId}
              onSelect={setActiveLayerId}
              onAdd={addLayer}
              onToggleVisible={(id) =>
                updateLayer(id, {
                  visible: !layers.find((l) => l.id === id)?.visible,
                })
              }
              onToggleLocked={(id) =>
                updateLayer(id, {
                  locked: !layers.find((l) => l.id === id)?.locked,
                })
              }
              onOpacity={onLayerOpacityChange}
              onOpacityCommit={onLayerOpacityCommit}
              onReorder={onReorderLayers}
              onReorderCommit={onReorderLayersCommit}
              onRename={renameLayer}
              onDelete={deleteLayer}
              minimized={layersMinimized}
              onMinimizedChange={setLayersMinimized}
            />
          </div>
        )}

        {!focusMode && (
          <div className="print:hidden contents">
            <ZoomControls
              zoom={camera.zoom}
              onIn={() => zoomBy(1.2)}
              onOut={() => zoomBy(1 / 1.2)}
              onFit={fitToContent}
            />
          </div>
        )}
      </div>

      <BrushPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        brushes={brushes}
        activeBrushId={activeBrushId}
        onSelect={setActiveBrushId}
        onCreate={createBrush}
        onDelete={deleteBrush}
      />
    </div>
  );
}

function ToolButton({
  id,
  isActive,
  onClick,
}: {
  id: ToolKind;
  isActive: boolean;
  onClick: (t: ToolKind) => void;
}) {
  const Icon = TOOL_ICONS[id];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={TOOL_LABELS[id]}
          aria-pressed={isActive}
          onClick={() => onClick(id)}
          className={cn(
            "grid size-9 place-items-center rounded-md transition-colors",
            isActive
              ? "bg-foreground/[0.1] text-foreground"
              : "text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{TOOL_LABELS[id]}</TooltipContent>
    </Tooltip>
  );
}

function BrushPalette({
  tool,
  activeBrush,
  onSelectTool,
  onOpenBrushes,
  onUndo,
  onRedo,
}: {
  tool: ToolKind;
  activeBrush: Brush;
  onSelectTool: (t: ToolKind) => void;
  onOpenBrushes: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const actions: ToolKind[] = ["bucket", "hand", "laser"];
  const BrushIcon = TOOL_ICONS.draw;
  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-0.5 rounded-xl border border-border bg-card/85 p-1 shadow-lg backdrop-blur">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Pincéis (${activeBrush.name})`}
            aria-pressed={tool === "draw"}
            onClick={onOpenBrushes}
            className={cn(
              "grid size-9 place-items-center rounded-md transition-colors",
              tool === "draw"
                ? "bg-foreground/[0.1] text-foreground"
                : "text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground",
            )}
          >
            <BrushIcon className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Pincéis — {activeBrush.name}</TooltipContent>
      </Tooltip>
      <ToolButton id="eraser" isActive={tool === "eraser"} onClick={onSelectTool} />
      <div className="my-1 h-px bg-border" />
      {actions.map((a) => (
        <ToolButton
          key={a}
          id={a}
          isActive={tool === a}
          onClick={onSelectTool}
        />
      ))}
      <div className="my-1 h-px bg-border" />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Desfazer"
            onClick={onUndo}
            className="grid size-9 place-items-center rounded-md text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <Undo2 className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Desfazer</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Refazer"
            onClick={onRedo}
            className="grid size-9 place-items-center rounded-md text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <Redo2 className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Refazer</TooltipContent>
      </Tooltip>
    </div>
  );
}

function ColorPicker({
  color,
  onColor,
}: {
  color: string;
  onColor: (c: string) => void;
}) {
  return (
    <div className="-translate-x-1/2 absolute top-3 left-1/2 z-10 flex items-center gap-1.5 rounded-full border border-border bg-card/85 px-3 py-1.5 shadow-lg backdrop-blur">
      <div className="hidden items-center gap-1.5 md:flex">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Cor ${c}`}
            onClick={() => onColor(c)}
            className={cn(
              "size-5 rounded-full border transition-shadow",
              color === c
                ? "border-foreground/60 ring-2 ring-foreground/20 ring-offset-2 ring-offset-card"
                : "border-border hover:border-foreground/40",
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <label className="relative size-5 cursor-pointer overflow-hidden rounded-full border border-border">
        <input
          type="color"
          value={color}
          onChange={(e) => onColor(e.target.value)}
          className="absolute -inset-1 cursor-pointer"
          aria-label="Cor customizada"
        />
      </label>
    </div>
  );
}

// Tamanho da ferramenta ativa (pincel ou borracha), com slider e input numérico
// para escolher um valor exato.
function BrushSizePopover({
  label,
  size,
  onSize,
}: {
  label: string;
  size: number;
  onSize: (s: number) => void;
}) {
  return (
    <div className="absolute top-3 left-16 z-10 flex items-center gap-2 rounded-full border border-border bg-card/85 px-3 py-1.5 shadow-lg backdrop-blur">
      <span className="max-w-[84px] truncate font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
        {label}
      </span>
      <div className="h-5 w-px bg-border" />
      <div className="flex w-44 items-center gap-2">
        <Slider
          className={cn("flex-1", COMPACT_SLIDER)}
          min={1}
          max={120}
          value={[size]}
          onValueChange={(v) =>
            onSize(Math.round(Array.isArray(v) ? v[0]! : v))
          }
        />
        <input
          type="number"
          min={1}
          max={120}
          value={size}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isNaN(n)) return;
            onSize(Math.min(120, Math.max(1, Math.round(n))));
          }}
          aria-label="Tamanho em pixels"
          className="w-12 rounded border border-border bg-background px-1 py-0.5 text-center font-mono text-[10px] tabular-nums outline-none"
        />
      </div>
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
  return (
    <div className="-translate-x-1/2 absolute bottom-3 left-1/2 z-10 hidden items-center gap-0.5 rounded-full border border-border bg-card/85 p-1 shadow-lg backdrop-blur md:flex">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Diminuir zoom"
            onClick={onOut}
            className="grid size-7 place-items-center rounded-full text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <ZoomOut className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Diminuir zoom</TooltipContent>
      </Tooltip>
      <span className="min-w-[42px] px-1 text-center font-mono text-foreground/80 text-xs tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Aumentar zoom"
            onClick={onIn}
            className="grid size-7 place-items-center rounded-full text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <ZoomIn className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Aumentar zoom</TooltipContent>
      </Tooltip>
      <div className="mx-1 h-5 w-px bg-border" />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Ajustar ao conteúdo"
            onClick={onFit}
            className="grid size-7 place-items-center rounded-full text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <Scan className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Ajustar ao conteúdo</TooltipContent>
      </Tooltip>
    </div>
  );
}

function BackgroundControl({
  settings,
  onCustom,
  onFollowTheme,
}: {
  settings: CanvasSettingsElement;
  onCustom: (color: string) => void;
  onFollowTheme: () => void;
}) {
  const isTheme = settings.backgroundMode === "theme";
  return (
    <div className="absolute bottom-3 left-3 z-10 hidden items-center gap-1.5 rounded-full border border-border bg-card/85 px-2 py-1.5 shadow-lg backdrop-blur md:flex">
      <label
        className={cn(
          "relative size-6 cursor-pointer overflow-hidden rounded-full border",
          isTheme
            ? "border-border"
            : "border-foreground/60 ring-2 ring-foreground/20",
        )}
        style={
          !isTheme ? { backgroundColor: settings.backgroundColor } : undefined
        }
      >
        {isTheme && (
          <span className="grid size-full place-items-center bg-background">
            <Palette className="size-3.5 text-muted-foreground" />
          </span>
        )}
        <input
          type="color"
          value={isTheme ? "#ffffff" : settings.backgroundColor}
          onChange={(e) => onCustom(e.target.value)}
          className="absolute -inset-1 cursor-pointer opacity-0"
          aria-label="Cor de fundo customizada"
        />
      </label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Seguir cor da aplicação"
            aria-pressed={isTheme}
            onClick={onFollowTheme}
            disabled={isTheme}
            className={cn(
              "grid size-6 place-items-center rounded-full transition-colors",
              isTheme
                ? "text-foreground/40"
                : "text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground",
            )}
          >
            <Palette className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Seguir cor da aplicação</TooltipContent>
      </Tooltip>
    </div>
  );
}

function LayersPanel({
  layers,
  activeLayerId,
  onSelect,
  onAdd,
  onToggleVisible,
  onToggleLocked,
  onOpacity,
  onOpacityCommit,
  onReorder,
  onReorderCommit,
  onRename,
  onDelete,
  minimized,
  onMinimizedChange,
}: {
  layers: LayerElement[];
  activeLayerId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onToggleVisible: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onOpacity: (id: string, opacity: number) => void;
  onOpacityCommit: () => void;
  onReorder: (visualTopToBottom: LayerElement[]) => void;
  onReorderCommit: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  minimized: boolean;
  onMinimizedChange: (minimized: boolean) => void;
}) {
  const visualTopToBottom = [...layers].reverse();

  if (minimized) {
    return (
      <div className="absolute right-3 bottom-3 z-10">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Expandir camadas"
              aria-pressed={false}
              onClick={() => onMinimizedChange(false)}
              className="grid size-9 place-items-center rounded-xl border border-border bg-card/85 text-foreground/70 shadow-lg backdrop-blur hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <Layers className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Expandir camadas</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="absolute right-3 bottom-3 z-10 w-64 overflow-hidden rounded-xl border border-border bg-card/85 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between border-border border-b px-3 py-1.5">
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.15em]">
          Camadas
        </span>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Nova camada"
                onClick={onAdd}
                className="grid size-6 place-items-center rounded-md text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <PlusIcon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Nova camada</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Minimizar camadas"
                aria-pressed={false}
                onClick={() => onMinimizedChange(true)}
                className="grid size-6 place-items-center rounded-md text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <ChevronDown className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Minimizar camadas</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <Reorder.Group
        axis="y"
        values={visualTopToBottom}
        onReorder={onReorder}
        className="max-h-64 space-y-0.5 overflow-y-auto p-1.5"
      >
        {visualTopToBottom.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            isActive={layer.id === activeLayerId}
            canDelete={layers.length > 1}
            onSelect={onSelect}
            onToggleVisible={onToggleVisible}
            onToggleLocked={onToggleLocked}
            onOpacity={onOpacity}
            onOpacityCommit={onOpacityCommit}
            onDragEnd={onReorderCommit}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
      </Reorder.Group>
    </div>
  );
}

function LayerRow({
  layer,
  isActive,
  canDelete,
  onSelect,
  onToggleVisible,
  onToggleLocked,
  onOpacity,
  onOpacityCommit,
  onDragEnd,
  onRename,
  onDelete,
}: {
  layer: LayerElement;
  isActive: boolean;
  canDelete: boolean;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onOpacity: (id: string, opacity: number) => void;
  onOpacityCommit: () => void;
  onDragEnd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const dragControls = useDragControls();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(layer.name);

  const startEditing = () => {
    setDraft(layer.name);
    setIsEditing(true);
  };

  const commitEditing = () => {
    setIsEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== layer.name) onRename(layer.id, trimmed);
  };

  return (
    <Reorder.Item
      value={layer}
      id={layer.id}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(layer.id)}
      className={cn(
        "flex w-full cursor-pointer flex-col gap-1 rounded-md bg-card px-2 py-1.5 text-left text-[11px] transition-colors",
        isActive
          ? "bg-primary/10 text-primary"
          : "hover:bg-foreground/5",
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onPointerDown={(e) => dragControls.start(e)}
          aria-label="Arrastar para reordenar"
          className="grid size-4 shrink-0 touch-none select-none place-items-center text-foreground/40 hover:cursor-grab hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-3" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisible(layer.id);
          }}
          aria-label={layer.visible ? "Ocultar" : "Mostrar"}
          className="grid size-4 shrink-0 place-items-center text-foreground/50 hover:text-foreground"
        >
          {layer.visible ? (
            <EyeIcon className="size-3" />
          ) : (
            <EyeOffIcon className="size-3" />
          )}
        </button>
        {isEditing ? (
          <input
            autoFocus
            value={draft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEditing}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEditing();
              else if (e.key === "Escape") setIsEditing(false);
            }}
            className="w-0 min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-[11px] outline-none"
          />
        ) : (
          <span
            className="flex-1 truncate"
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
            title="Duplo clique para renomear"
          >
            {layer.name}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleLocked(layer.id);
          }}
          aria-label={layer.locked ? "Destravar" : "Travar"}
          className="grid size-4 shrink-0 place-items-center text-foreground/50 hover:text-foreground"
        >
          {layer.locked ? (
            <LockIcon className="size-3" />
          ) : (
            <UnlockIcon className="size-3" />
          )}
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(layer.id);
            }}
            aria-label="Excluir camada"
            className="grid size-4 shrink-0 place-items-center text-foreground/50 hover:text-destructive"
          >
            <Trash2 className="size-3" />
          </button>
        )}
      </div>
      {isActive && (
        <div
          className="flex items-center gap-2 pl-6"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="w-6 font-mono text-[9px] text-muted-foreground tabular-nums">
            {layer.opacity}%
          </span>
          <Slider
            className={cn("flex-1", COMPACT_SLIDER)}
            min={0}
            max={100}
            value={[layer.opacity]}
            onValueChange={(v) =>
              onOpacity(layer.id, Math.round(Array.isArray(v) ? v[0]! : v))
            }
            onValueCommitted={onOpacityCommit}
          />
        </div>
      )}
    </Reorder.Item>
  );
}
