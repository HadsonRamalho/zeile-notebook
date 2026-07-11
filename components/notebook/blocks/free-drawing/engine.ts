import { getStroke } from "perfect-freehand";

export type BrushKind = "pen" | "marker" | "calligraphy" | "eraser";

export type BrushShape =
  | "pencil"
  | "dot"
  | "pen"
  | "marker"
  | "airbrush"
  | "watercolor"
  | "oil"
  | "charcoal"
  | "chalk";

export const BRUSH_SHAPE_LABELS: Record<BrushShape, string> = {
  pencil: "Lápis",
  dot: "Ponto",
  pen: "Caneta",
  marker: "Marcador",
  airbrush: "Aerógrafo",
  watercolor: "Pincel de água",
  oil: "Óleo",
  charcoal: "Carvão",
  chalk: "Giz",
};

export const BRUSH_SHAPES: BrushShape[] = [
  "pencil",
  "dot",
  "pen",
  "marker",
  "airbrush",
  "watercolor",
  "oil",
  "charcoal",
  "chalk",
];

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
}

export interface LayerElement {
  id: string;
  version: number;
  kind: "layer";
  order: number;
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  [key: string]: unknown;
}

export interface StrokeElement {
  id: string;
  version: number;
  kind: "stroke";
  layerId: string;
  order: number;
  brush: BrushKind;
  color: string;
  size: number;
  opacity: number;
  pressureSensitive: boolean;
  points: StrokePoint[];
  shape?: BrushShape;
  sizeStart?: number;
  sizeEnd?: number;
  opacityStart?: number;
  opacityEnd?: number;
  [key: string]: unknown;
}

export type CanvasBackgroundMode = "theme" | "custom";

export const CANVAS_SETTINGS_ID = "canvas-settings";

export interface CanvasSettingsElement {
  id: string;
  version: number;
  kind: "canvas";
  backgroundMode: CanvasBackgroundMode;
  backgroundColor: string;
  [key: string]: unknown;
}

export type FreeDrawingElement =
  | LayerElement
  | StrokeElement
  | CanvasSettingsElement;

export const BRUSH_LABELS: Record<BrushKind, string> = {
  pen: "Caneta",
  marker: "Marcador",
  calligraphy: "Caligráfico",
  eraser: "Borracha",
};

export function isLayer(el: FreeDrawingElement): el is LayerElement {
  return el.kind === "layer";
}

export function isStroke(el: FreeDrawingElement): el is StrokeElement {
  return el.kind === "stroke";
}

export function isCanvasSettings(
  el: FreeDrawingElement,
): el is CanvasSettingsElement {
  return el.kind === "canvas";
}

export function defaultCanvasSettings(): CanvasSettingsElement {
  return {
    id: CANVAS_SETTINGS_ID,
    version: 1,
    kind: "canvas",
    backgroundMode: "theme",
    backgroundColor: "#ffffff",
  };
}

/** Traço tipo caneta/pincel: contorno suave via perfect-freehand, largura reage à pressão. */
function penPath(stroke: StrokeElement): Path2D {
  const outline = getStroke(
    stroke.points.map((p) => [p.x, p.y, p.pressure]),
    {
      size: stroke.size,
      thinning: stroke.pressureSensitive ? 0.65 : 0.35,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: !stroke.pressureSensitive,
    },
  );
  const path = new Path2D();
  if (outline.length === 0) return path;
  path.moveTo(outline[0]![0], outline[0]![1]);
  for (const [x, y] of outline.slice(1)) path.lineTo(x, y);
  path.closePath();
  return path;
}

/** Marcador: ponta reta, largura constante (sem afinar pela pressão), traço simples. */
function marketPath(stroke: StrokeElement): {
  path: Path2D;
  lineWidth: number;
} {
  const path = new Path2D();
  const pts = stroke.points;
  if (pts.length > 0) {
    path.moveTo(pts[0]!.x, pts[0]!.y);
    for (const p of pts.slice(1)) path.lineTo(p.x, p.y);
  }
  return { path, lineWidth: stroke.size };
}

/**
 * Caligráfico: bico fixo em 45°, largura do traço varia com o ângulo de
 * movimento em relação ao bico (perpendicular = mais largo, paralelo = fino).
 * Renderizado como retângulos rotacionados carimbados ao longo do trajeto.
 */
function calligraphyQuads(
  stroke: StrokeElement,
): { x: number; y: number; w: number; h: number; angle: number }[] {
  const NIB_ANGLE = Math.PI / 4;
  const pts = stroke.points;
  const quads: { x: number; y: number; w: number; h: number; angle: number }[] =
    [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01) continue;
    const moveAngle = Math.atan2(dy, dx);
    const widthFactor = Math.max(
      0.25,
      Math.abs(Math.sin(moveAngle - NIB_ANGLE)),
    );
    const pressure = stroke.pressureSensitive ? (a.pressure + b.pressure) / 2 : 0.6;
    const width = stroke.size * widthFactor * (0.5 + pressure);
    quads.push({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      w: dist + width,
      h: width,
      angle: moveAngle,
    });
  }
  return quads;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ResolvedTaper {
  sizeStart: number;
  sizeEnd: number;
  opStart: number;
  opEnd: number;
}

function resolveTaper(s: StrokeElement): ResolvedTaper {
  return {
    sizeStart: s.sizeStart ?? s.size,
    sizeEnd: s.sizeEnd ?? s.size,
    opStart: (s.opacityStart ?? s.opacity) / 100,
    opEnd: (s.opacityEnd ?? s.opacity) / 100,
  };
}

export function strokeMaxWidth(s: StrokeElement): number {
  if (s.shape) return Math.max(s.sizeStart ?? s.size, s.sizeEnd ?? s.size);
  return s.size;
}

function shapedPenPath(
  s: StrokeElement,
  t: ResolvedTaper,
  smoothing: number,
): Path2D {
  const n = s.points.length;
  const max = Math.max(t.sizeStart, t.sizeEnd, 0.1);
  const pts = s.points.map((p, i) => {
    const u = n <= 1 ? 0 : i / (n - 1);
    const w = lerp(t.sizeStart, t.sizeEnd, u);
    const pressure = s.pressureSensitive ? p.pressure : 1;
    return [p.x, p.y, Math.max(0.02, (pressure * w) / max)] as [
      number,
      number,
      number,
    ];
  });
  const outline = getStroke(pts, {
    size: max,
    thinning: 1,
    smoothing,
    streamline: 0.5,
    simulatePressure: false,
  });
  const path = new Path2D();
  if (outline.length === 0) return path;
  path.moveTo(outline[0]![0], outline[0]![1]);
  for (const [x, y] of outline.slice(1)) path.lineTo(x, y);
  path.closePath();
  return path;
}

function drawTaperedPolyline(
  ctx: CanvasRenderingContext2D,
  s: StrokeElement,
  t: ResolvedTaper,
  cap: CanvasLineCap,
) {
  const pts = s.points;
  const n = pts.length;
  ctx.lineJoin = "round";
  ctx.lineCap = cap;
  for (let i = 0; i < n - 1; i++) {
    const u = n <= 1 ? 0 : i / (n - 1);
    ctx.globalAlpha = lerp(t.opStart, t.opEnd, u);
    ctx.lineWidth = Math.max(0.5, lerp(t.sizeStart, t.sizeEnd, u));
    ctx.beginPath();
    ctx.moveTo(pts[i]!.x, pts[i]!.y);
    ctx.lineTo(pts[i + 1]!.x, pts[i + 1]!.y);
    ctx.stroke();
  }
}

function stampAlong(
  ctx: CanvasRenderingContext2D,
  s: StrokeElement,
  t: ResolvedTaper,
  opts: {
    spacing: number;
    jitter: number;
    radiusScale: number;
    rng: () => number;
    grain?: number;
  },
) {
  const pts = s.points;
  const n = pts.length;
  if (n === 0) return;
  const grain = opts.grain ?? 1;
  let carry = 0;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 0.001) continue;
    const u = n <= 1 ? 0 : i / (n - 1);
    const width = lerp(t.sizeStart, t.sizeEnd, u);
    const alpha = lerp(t.opStart, t.opEnd, u);
    const step = Math.max(0.5, width * opts.spacing);
    for (let d = carry; d < segLen; d += step) {
      const f = d / segLen;
      const cx = a.x + dx * f;
      const cy = a.y + dy * f;
      for (let g = 0; g < grain; g++) {
        const jx = (opts.rng() - 0.5) * width * opts.jitter;
        const jy = (opts.rng() - 0.5) * width * opts.jitter;
        const r =
          (width / 2) * opts.radiusScale * (0.5 + opts.rng() * 0.7);
        ctx.globalAlpha = alpha * (0.4 + opts.rng() * 0.5);
        ctx.beginPath();
        ctx.arc(cx + jx, cy + jy, Math.max(0.25, r), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    carry = ((carry - segLen) % step + step) % step;
  }
}

function drawShapedStroke(ctx: CanvasRenderingContext2D, s: StrokeElement) {
  const t = resolveTaper(s);
  const shape = s.shape as BrushShape;
  const rng = mulberry32(hashSeed(s.id));
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = s.color;
  ctx.strokeStyle = s.color;

  switch (shape) {
    case "pen": {
      ctx.globalAlpha = (t.opStart + t.opEnd) / 2;
      ctx.fill(shapedPenPath(s, t, 0.55));
      break;
    }
    case "pencil": {
      ctx.fill(shapedPenPath(s, { ...t, opStart: 1, opEnd: 1 }, 0.3));
      stampAlong(ctx, s, t, {
        spacing: 0.35,
        jitter: 0.9,
        radiusScale: 0.35,
        rng,
      });
      break;
    }
    case "marker": {
      drawTaperedPolyline(ctx, s, t, "square");
      break;
    }
    case "dot": {
      stampAlong(ctx, s, t, {
        spacing: 1.4,
        jitter: 0.05,
        radiusScale: 1,
        rng,
      });
      break;
    }
    case "airbrush": {
      const pts = s.points;
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const u = n <= 1 ? 0 : i / (n - 1);
        const width = lerp(t.sizeStart, t.sizeEnd, u);
        const alpha = lerp(t.opStart, t.opEnd, u);
        const density = Math.max(6, Math.round(width * 1.2));
        for (let k = 0; k < density; k++) {
          const ang = rng() * Math.PI * 2;
          const rad = rng() * width;
          ctx.globalAlpha = alpha * 0.08;
          ctx.beginPath();
          ctx.arc(
            pts[i]!.x + Math.cos(ang) * rad,
            pts[i]!.y + Math.sin(ang) * rad,
            width * 0.12,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
      break;
    }
    case "watercolor": {
      for (let pass = 0; pass < 3; pass++) {
        const off = pass === 0 ? 0 : (rng() - 0.5) * (t.sizeStart + t.sizeEnd) * 0.15;
        ctx.save();
        ctx.translate(off, (rng() - 0.5) * off);
        ctx.globalAlpha = ((t.opStart + t.opEnd) / 2) * 0.35;
        ctx.fill(
          shapedPenPath(
            { ...s, id: `${s.id}-${pass}` },
            { ...t, sizeStart: t.sizeStart * 1.1, sizeEnd: t.sizeEnd * 1.1 },
            0.7,
          ),
        );
        ctx.restore();
      }
      break;
    }
    case "oil": {
      ctx.globalAlpha = (t.opStart + t.opEnd) / 2;
      drawTaperedPolyline(ctx, s, t, "round");
      for (let pass = 0; pass < 2; pass++) {
        ctx.save();
        ctx.translate((rng() - 0.5) * 2, (rng() - 0.5) * 2);
        drawTaperedPolyline(
          ctx,
          s,
          {
            ...t,
            sizeStart: t.sizeStart * 0.6,
            sizeEnd: t.sizeEnd * 0.6,
            opStart: t.opStart * 0.5,
            opEnd: t.opEnd * 0.5,
          },
          "round",
        );
        ctx.restore();
      }
      break;
    }
    case "charcoal": {
      stampAlong(ctx, s, t, {
        spacing: 0.16,
        jitter: 0.95,
        radiusScale: 0.28,
        grain: 5,
        rng,
      });
      break;
    }
    case "chalk": {
      stampAlong(ctx, s, t, {
        spacing: 0.25,
        jitter: 1.1,
        radiusScale: 0.4,
        rng,
      });
      break;
    }
  }
  ctx.restore();
}

export type GeoShape = "line" | "rectangle" | "ellipse" | "triangle" | "arrow";

export const GEO_SHAPE_LABELS: Record<GeoShape, string> = {
  line: "Linha",
  rectangle: "Retângulo",
  ellipse: "Elipse",
  triangle: "Triângulo",
  arrow: "Seta",
};

export const GEO_SHAPES: GeoShape[] = [
  "line",
  "rectangle",
  "ellipse",
  "triangle",
  "arrow",
];

/** Gera os pontos que traçam uma forma geométrica entre (x0,y0) e (x1,y1). */
export function geoShapePoints(
  kind: GeoShape,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): StrokePoint[] {
  const p = (x: number, y: number): StrokePoint => ({ x, y, pressure: 0.5 });
  switch (kind) {
    case "line":
      return [p(x0, y0), p(x1, y1)];
    case "rectangle":
      return [p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1), p(x0, y0)];
    case "triangle":
      return [p((x0 + x1) / 2, y0), p(x1, y1), p(x0, y1), p((x0 + x1) / 2, y0)];
    case "ellipse": {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const rx = Math.abs(x1 - x0) / 2;
      const ry = Math.abs(y1 - y0) / 2;
      const pts: StrokePoint[] = [];
      const steps = 56;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        pts.push(p(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
      }
      return pts;
    }
    case "arrow": {
      const angle = Math.atan2(y1 - y0, x1 - x0);
      const len = Math.hypot(x1 - x0, y1 - y0);
      const head = Math.min(24, len * 0.3);
      const wing = Math.PI / 7;
      const lx = x1 - Math.cos(angle - wing) * head;
      const ly = y1 - Math.sin(angle - wing) * head;
      const rx = x1 - Math.cos(angle + wing) * head;
      const ry = y1 - Math.sin(angle + wing) * head;
      return [p(x0, y0), p(x1, y1), p(lx, ly), p(x1, y1), p(rx, ry)];
    }
  }
}

/** Renderiza um traço em um contexto 2D já configurado (globalAlpha/composite). */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: StrokeElement) {
  if (stroke.points.length === 0) return;
  if (stroke.shape) {
    drawShapedStroke(ctx, stroke);
    return;
  }
  ctx.save();
  ctx.globalAlpha = stroke.opacity / 100;
  ctx.globalCompositeOperation =
    stroke.brush === "eraser" ? "destination-out" : "source-over";
  ctx.fillStyle = stroke.color;
  ctx.strokeStyle = stroke.color;

  if (stroke.brush === "pen" || stroke.brush === "eraser") {
    ctx.fill(penPath(stroke));
  } else if (stroke.brush === "marker") {
    const { path, lineWidth } = marketPath(stroke);
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "square";
    ctx.lineJoin = "round";
    ctx.stroke(path);
  } else if (stroke.brush === "calligraphy") {
    for (const q of calligraphyQuads(stroke)) {
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(q.angle);
      ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
      ctx.restore();
    }
  }
  ctx.restore();
}

function calligraphyHitPath(stroke: StrokeElement): Path2D {
  const path = new Path2D();
  for (const q of calligraphyQuads(stroke)) {
    const cos = Math.cos(q.angle);
    const sin = Math.sin(q.angle);
    const hw = q.w / 2;
    const hh = q.h / 2;
    const corners: [number, number][] = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ].map(([lx, ly]) => [q.x + lx * cos - ly * sin, q.y + lx * sin + ly * cos]);
    path.moveTo(corners[0]![0], corners[0]![1]);
    for (const c of corners.slice(1)) path.lineTo(c[0], c[1]);
    path.closePath();
  }
  return path;
}

/**
 * Testa se o ponto (em espaço CSS, mesma origem dos pontos do traço) cai
 * sobre o traço. Usado pela ferramenta de balde de tinta. O `ctx` só serve
 * de "régua" geométrica (isPointInPath/isPointInStroke) — precisa ter a
 * transform resetada para identidade antes de chamar.
 */
export function hitTestStroke(
  ctx: CanvasRenderingContext2D,
  stroke: StrokeElement,
  x: number,
  y: number,
): boolean {
  if (stroke.points.length === 0) return false;
  if (stroke.shape) {
    const path = new Path2D();
    path.moveTo(stroke.points[0]!.x, stroke.points[0]!.y);
    for (const p of stroke.points.slice(1)) path.lineTo(p.x, p.y);
    ctx.lineWidth = Math.max(strokeMaxWidth(stroke), 6);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return ctx.isPointInStroke(path, x, y);
  }
  if (stroke.brush === "pen" || stroke.brush === "eraser") {
    return ctx.isPointInPath(penPath(stroke), x, y);
  }
  if (stroke.brush === "marker") {
    const { path, lineWidth } = marketPath(stroke);
    ctx.lineWidth = Math.max(lineWidth, 6);
    ctx.lineCap = "square";
    ctx.lineJoin = "round";
    return ctx.isPointInStroke(path, x, y);
  }
  return ctx.isPointInPath(calligraphyHitPath(stroke), x, y);
}

/**
 * Traço visível mais ao topo (camada mais alta primeiro, depois ordem dentro
 * da camada) sob o ponto — ignora camadas ocultas/travadas.
 */
export function findTopStrokeAt(
  ctx: CanvasRenderingContext2D,
  layers: LayerElement[],
  strokes: StrokeElement[],
  x: number,
  y: number,
): StrokeElement | null {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sortedLayers = [...layers].sort((a, b) => b.order - a.order);
  for (const layer of sortedLayers) {
    if (!layer.visible || layer.locked) continue;
    const layerStrokes = strokes
      .filter((s) => s.layerId === layer.id)
      .sort((a, b) => b.order - a.order);
    for (const stroke of layerStrokes) {
      if (hitTestStroke(ctx, stroke, x, y)) return stroke;
    }
  }
  return null;
}

/** Posição/zoom da câmera sobre o canvas infinito (espaço-mundo -> tela). */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

/**
 * Desenha as camadas visíveis (bottom-to-top) em `destCtx`, cada uma primeiro
 * renderizada isolada num canvas de rascunho (pro `globalCompositeOperation`
 * da borracha não vazar entre camadas) e depois composta com sua opacidade.
 * `setLayerTransform` decide o mapeamento espaço-mundo -> pixel de destino —
 * é o único ponto que difere entre a renderização ao vivo (câmera) e a
 * exportação (bounding box do conteúdo).
 */
function compositeVisibleLayers(
  destCtx: CanvasRenderingContext2D,
  destWidthPx: number,
  destHeightPx: number,
  setLayerTransform: (ctx: CanvasRenderingContext2D) => void,
  layers: LayerElement[],
  strokes: StrokeElement[],
  scratch: Map<string, HTMLCanvasElement>,
  clearFirst: boolean,
) {
  destCtx.setTransform(1, 0, 0, 1, 0, 0);
  if (clearFirst) destCtx.clearRect(0, 0, destWidthPx, destHeightPx);
  const sortedLayers = [...layers].sort((a, b) => a.order - b.order);

  for (const layer of sortedLayers) {
    if (!layer.visible) continue;
    let canvas = scratch.get(layer.id);
    if (!canvas) {
      canvas = document.createElement("canvas");
      scratch.set(layer.id, canvas);
    }
    if (canvas.width !== destWidthPx || canvas.height !== destHeightPx) {
      canvas.width = destWidthPx;
      canvas.height = destHeightPx;
    }
    const layerCtx = canvas.getContext("2d");
    if (!layerCtx) continue;
    layerCtx.setTransform(1, 0, 0, 1, 0, 0);
    layerCtx.clearRect(0, 0, destWidthPx, destHeightPx);
    setLayerTransform(layerCtx);

    const layerStrokes = strokes
      .filter((s) => s.layerId === layer.id)
      .sort((a, b) => a.order - b.order);
    for (const stroke of layerStrokes) drawStroke(layerCtx, stroke);

    destCtx.save();
    destCtx.globalAlpha = layer.opacity / 100;
    destCtx.drawImage(canvas, 0, 0);
    destCtx.restore();
  }

  for (const [id] of scratch) {
    if (!sortedLayers.some((l) => l.id === id)) scratch.delete(id);
  }
}

/**
 * Renderiza a cena ao vivo no canvas principal. `cssWidth`/`cssHeight` são o
 * tamanho em pixels CSS do viewport; `dpr` escala o backing store para
 * nitidez em telas de alta densidade; `camera` mapeia o canvas infinito
 * (espaço-mundo, onde os pontos dos traços vivem) para a tela.
 */
export function renderScene(
  mainCtx: CanvasRenderingContext2D,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  camera: Camera,
  layers: LayerElement[],
  strokes: StrokeElement[],
  offscreen: Map<string, HTMLCanvasElement>,
) {
  const width = Math.max(1, Math.round(cssWidth * dpr));
  const height = Math.max(1, Math.round(cssHeight * dpr));
  compositeVisibleLayers(
    mainCtx,
    width,
    height,
    (ctx) =>
      ctx.setTransform(
        camera.zoom * dpr,
        0,
        0,
        camera.zoom * dpr,
        camera.x * dpr,
        camera.y * dpr,
      ),
    layers,
    strokes,
    offscreen,
    true,
  );
}

export interface ContentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Bounding box (espaço-mundo) do conteúdo dos traços, expandida pela espessura de cada um. */
export function computeContentBounds(
  strokes: StrokeElement[],
): ContentBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const stroke of strokes) {
    const pad = strokeMaxWidth(stroke) / 2;
    for (const p of stroke.points) {
      minX = Math.min(minX, p.x - pad);
      minY = Math.min(minY, p.y - pad);
      maxX = Math.max(maxX, p.x + pad);
      maxY = Math.max(maxY, p.y + pad);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Renderiza só o conteúdo (camadas visíveis) recortado no bounding box + a
 * folga (`padding`, em unidades do canvas), escalado por `scale` (resolução
 * de exportação). Fundo "theme" fica transparente — só "custom" é pintado.
 */
export function exportSceneToCanvas(
  layers: LayerElement[],
  strokes: StrokeElement[],
  bounds: ContentBounds,
  padding: number,
  scale: number,
  background: { mode: CanvasBackgroundMode; color: string },
): HTMLCanvasElement {
  const contentWidth = bounds.maxX - bounds.minX + padding * 2;
  const contentHeight = bounds.maxY - bounds.minY + padding * 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(contentWidth * scale));
  canvas.height = Math.max(1, Math.round(contentHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  if (background.mode === "custom") {
    ctx.fillStyle = background.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const offsetX = padding - bounds.minX;
  const offsetY = padding - bounds.minY;
  compositeVisibleLayers(
    ctx,
    canvas.width,
    canvas.height,
    (layerCtx) =>
      layerCtx.setTransform(
        scale,
        0,
        0,
        scale,
        offsetX * scale,
        offsetY * scale,
      ),
    layers,
    strokes,
    new Map(),
    false,
  );
  return canvas;
}

let idCounter = 1;
export function nextElementId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function defaultLayer(order: number, name: string): LayerElement {
  return {
    id: nextElementId("layer"),
    version: 1,
    kind: "layer",
    order,
    name,
    visible: true,
    opacity: 100,
    locked: false,
  };
}

export interface LaserStroke {
  id: string;
  points: { x: number; y: number }[];
  bornAt: number;
  releasedAt: number | null;
}

export const LASER_FADE_MS = 900;
export const LASER_COLOR = "#ff2d55";

export function drawLaser(
  ctx: CanvasRenderingContext2D,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  camera: Camera,
  lasers: LaserStroke[],
  now: number,
): boolean {
  ctx.save();
  ctx.setTransform(
    camera.zoom * dpr,
    0,
    0,
    camera.zoom * dpr,
    camera.x * dpr,
    camera.y * dpr,
  );
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  let anyAlive = false;
  for (const laser of lasers) {
    let alpha = 1;
    if (laser.releasedAt !== null) {
      const age = now - laser.releasedAt;
      if (age >= LASER_FADE_MS) continue;
      alpha = 1 - age / LASER_FADE_MS;
    }
    anyAlive = true;
    if (laser.points.length === 0) continue;
    const path = new Path2D();
    path.moveTo(laser.points[0]!.x, laser.points[0]!.y);
    for (const p of laser.points.slice(1)) path.lineTo(p.x, p.y);
    ctx.globalAlpha = alpha * 0.35;
    ctx.strokeStyle = LASER_COLOR;
    ctx.lineWidth = 14 / camera.zoom;
    ctx.stroke(path);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4 / camera.zoom;
    ctx.stroke(path);
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = LASER_COLOR;
    ctx.lineWidth = 6 / camera.zoom;
    ctx.stroke(path);
  }
  ctx.restore();
  void cssWidth;
  void cssHeight;
  return anyAlive;
}

/** Substitui (ou insere, se ainda não existir) o registro singleton de configuração do canvas. */
export function upsertCanvasSettings(
  elements: FreeDrawingElement[],
  settings: CanvasSettingsElement,
): FreeDrawingElement[] {
  const exists = elements.some(isCanvasSettings);
  return exists
    ? elements.map((e) => (isCanvasSettings(e) ? settings : e))
    : [...elements, settings];
}
