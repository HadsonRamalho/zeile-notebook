import { getStroke } from "perfect-freehand";

export type BrushKind = "pen" | "marker" | "calligraphy" | "eraser";

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

/** Renderiza um traço em um contexto 2D já configurado (globalAlpha/composite). */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: StrokeElement) {
  if (stroke.points.length === 0) return;
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
    const pad = stroke.size / 2;
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
