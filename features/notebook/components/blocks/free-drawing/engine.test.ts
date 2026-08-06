import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BRUSH_SHAPES,
  CANVAS_SETTINGS_ID,
  computeContentBounds,
  DEFAULT_CAMERA,
  defaultCanvasSettings,
  findTopStrokeAt,
  GEO_SHAPES,
  geoShapePoints,
  isCanvasSettings,
  isLayer,
  isStroke,
  type LayerElement,
  type StrokeElement,
  type StrokePoint,
  strokeMaxWidth,
} from "./engine";

function stroke(
  id: string,
  overrides: Partial<StrokeElement> = {},
): StrokeElement {
  return {
    id,
    version: 1,
    kind: "stroke",
    layerId: "l1",
    order: 0,
    brush: "pen",
    color: "#000000",
    size: 4,
    opacity: 100,
    pressureSensitive: false,
    points: [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 10, y: 10, pressure: 0.5 },
    ],
    ...overrides,
  };
}

function layer(
  id: string,
  overrides: Partial<LayerElement> = {},
): LayerElement {
  return {
    id,
    version: 1,
    kind: "layer",
    order: 0,
    name: id,
    visible: true,
    opacity: 100,
    locked: false,
    ...overrides,
  };
}

describe("guardas de tipo", () => {
  it("distinguem layer, stroke e canvas", () => {
    const l = layer("l1");
    const s = stroke("s1");
    const c = defaultCanvasSettings();

    expect([isLayer(l), isStroke(l), isCanvasSettings(l)]).toEqual([
      true,
      false,
      false,
    ]);
    expect([isLayer(s), isStroke(s), isCanvasSettings(s)]).toEqual([
      false,
      true,
      false,
    ]);
    expect([isLayer(c), isStroke(c), isCanvasSettings(c)]).toEqual([
      false,
      false,
      true,
    ]);
  });
});

describe("defaultCanvasSettings", () => {
  it("usa o id fixo e o modo theme", () => {
    const c = defaultCanvasSettings();

    expect(c.id).toBe(CANVAS_SETTINGS_ID);
    expect(c.backgroundMode).toBe("theme");
  });

  it("devolve objeto novo a cada chamada", () => {
    expect(defaultCanvasSettings()).not.toBe(defaultCanvasSettings());
    expect(defaultCanvasSettings()).toEqual(defaultCanvasSettings());
  });

  it("DEFAULT_CAMERA starts at the origin with zoom 1", () => {
    expect(DEFAULT_CAMERA).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

describe("strokeMaxWidth", () => {
  it("without a shape, it is the size", () => {
    expect(strokeMaxWidth(stroke("s", { size: 7 }))).toBe(7);
  });

  it("with a shape, it is the larger of sizeStart and sizeEnd", () => {
    const s = stroke("s", {
      shape: "pencil",
      size: 4,
      sizeStart: 2,
      sizeEnd: 9,
    });

    expect(strokeMaxWidth(s)).toBe(9);
  });

  it("com shape e taper ausente, cai para size", () => {
    const s = stroke("s", { shape: "pencil", size: 5 });

    expect(strokeMaxWidth(s)).toBe(5);
  });

  it("cobre todas as BRUSH_SHAPES sem devolver NaN", () => {
    for (const shape of BRUSH_SHAPES) {
      const s = stroke("s", { shape, size: 3, sizeStart: 1, sizeEnd: 6 });
      expect(Number.isFinite(strokeMaxWidth(s)), shape).toBe(true);
    }
  });
});

describe("geoShapePoints", () => {
  it("line liga os dois extremos", () => {
    const pts = geoShapePoints("line", 0, 0, 10, 20);

    expect(pts).toHaveLength(2);
    expect([pts[0]?.x, pts[0]?.y]).toEqual([0, 0]);
    expect([pts[1]?.x, pts[1]?.y]).toEqual([10, 20]);
  });

  it("rectangle fecha o contorno com 5 pontos", () => {
    const pts = geoShapePoints("rectangle", 0, 0, 10, 6);

    expect(pts).toHaveLength(5);
    expect([pts[0]?.x, pts[0]?.y]).toEqual([pts[4]?.x, pts[4]?.y]);
  });

  it("triangle closes at the apex, in the middle of the top base", () => {
    const pts = geoShapePoints("triangle", 0, 0, 10, 8);

    expect(pts).toHaveLength(4);
    expect([pts[0]?.x, pts[0]?.y]).toEqual([5, 0]);
    expect([pts[3]?.x, pts[3]?.y]).toEqual([5, 0]);
  });

  it("ellipse closes the loop and stays inside the box", () => {
    const pts = geoShapePoints("ellipse", 0, 0, 10, 4);

    expect(pts).toHaveLength(57);
    expect(pts[0]?.x).toBeCloseTo(pts[56]?.x ?? Number.NaN);
    expect(pts[0]?.y).toBeCloseTo(pts[56]?.y ?? Number.NaN);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x).toBeLessThanOrEqual(10 + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeLessThanOrEqual(4 + 1e-9);
    }
  });

  it("arrow volta à ponta entre as duas asas", () => {
    const pts = geoShapePoints("arrow", 0, 0, 100, 0);

    expect(pts).toHaveLength(5);
    expect([pts[1]?.x, pts[1]?.y]).toEqual([pts[3]?.x, pts[3]?.y]);
    expect(pts[2]?.x).toBeLessThan(100);
    expect(pts[4]?.x).toBeLessThan(100);
  });

  it("zero-length arrow does not produce NaN", () => {
    const pts = geoShapePoints("arrow", 5, 5, 5, 5);

    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("every GEO_SHAPES returns at least 2 points with fixed pressure", () => {
    for (const kind of GEO_SHAPES) {
      const pts = geoShapePoints(kind, 0, 0, 10, 10);
      expect(pts.length, kind).toBeGreaterThanOrEqual(2);
      expect(
        pts.every((p: StrokePoint) => p.pressure === 0.5),
        kind,
      ).toBe(true);
    }
  });

  it("aceita coordenadas invertidas", () => {
    const pts = geoShapePoints("rectangle", 10, 6, 0, 0);

    expect(pts).toHaveLength(5);
    expect([pts[0]?.x, pts[0]?.y]).toEqual([10, 6]);
  });
});

describe("computeContentBounds", () => {
  it("returns null without strokes", () => {
    expect(computeContentBounds([])).toBeNull();
  });

  it("returns null when the strokes have no point", () => {
    expect(computeContentBounds([stroke("s", { points: [] })])).toBeNull();
  });

  it("expande a caixa pela metade da espessura", () => {
    const s = stroke("s", {
      size: 10,
      points: [{ x: 0, y: 0, pressure: 0.5 }],
    });

    expect(computeContentBounds([s])).toEqual({
      minX: -5,
      minY: -5,
      maxX: 5,
      maxY: 5,
    });
  });

  it("covers the union of several strokes", () => {
    const a = stroke("a", { size: 0, points: [{ x: 0, y: 0, pressure: 1 }] });
    const b = stroke("b", {
      size: 0,
      points: [{ x: 30, y: -10, pressure: 1 }],
    });

    expect(computeContentBounds([a, b])).toEqual({
      minX: 0,
      minY: -10,
      maxX: 30,
      maxY: 0,
    });
  });

  it("uses the shape's thickness, not just the size", () => {
    const s = stroke("s", {
      shape: "pencil",
      size: 2,
      sizeStart: 2,
      sizeEnd: 20,
      points: [{ x: 0, y: 0, pressure: 0.5 }],
    });

    expect(computeContentBounds([s])?.maxX).toBe(10);
  });
});

describe("findTopStrokeAt", () => {
  const acertos = new Set<string>();
  let sondado = "";

  class FakePath2D {
    moveTo() {}
    lineTo() {}
    closePath() {}
  }

  beforeEach(() => {
    acertos.clear();
    sondado = "";
    (globalThis as { Path2D?: unknown }).Path2D = FakePath2D;
  });

  afterEach(() => {
    delete (globalThis as { Path2D?: unknown }).Path2D;
  });

  function ctxQueAcertaOsRegistrados(): CanvasRenderingContext2D {
    return {
      lineWidth: 0,
      lineCap: "butt",
      lineJoin: "miter",
      setTransform: () => {},
      isPointInStroke: () => acertos.has(sondado),
      isPointInPath: () => acertos.has(sondado),
    } as unknown as CanvasRenderingContext2D;
  }

  function sondaveis(strokes: StrokeElement[]): StrokeElement[] {
    return strokes.map((s) => {
      const pontos = s.points;
      return {
        ...s,
        get points() {
          sondado = s.id;
          return pontos;
        },
      } as StrokeElement;
    });
  }

  function escolher(
    layers: LayerElement[],
    strokes: StrokeElement[],
    acerta: string[],
  ): StrokeElement | null {
    for (const id of acerta) acertos.add(id);
    return findTopStrokeAt(
      ctxQueAcertaOsRegistrados(),
      layers,
      sondaveis(strokes),
      0,
      0,
    );
  }

  it("returns null when nothing is hit", () => {
    expect(escolher([layer("l1")], [stroke("s1")], [])).toBeNull();
  });

  it("returns the hit stroke", () => {
    expect(escolher([layer("l1")], [stroke("s1")], ["s1"])?.id).toBe("s1");
  });

  it("prefere a camada de order maior", () => {
    const layers = [layer("baixa", { order: 0 }), layer("alta", { order: 5 })];
    const strokes = [
      stroke("na-baixa", { layerId: "baixa" }),
      stroke("na-alta", { layerId: "alta" }),
    ];

    expect(escolher(layers, strokes, ["na-baixa", "na-alta"])?.id).toBe(
      "na-alta",
    );
  });

  it("within the layer, prefers the stroke with the higher order", () => {
    const strokes = [
      stroke("antigo", { order: 1 }),
      stroke("recente", { order: 9 }),
    ];

    expect(escolher([layer("l1")], strokes, ["antigo", "recente"])?.id).toBe(
      "recente",
    );
  });

  it("ignores an invisible layer", () => {
    const layers = [layer("oculta", { visible: false })];
    const strokes = [stroke("s1", { layerId: "oculta" })];

    expect(escolher(layers, strokes, ["s1"])).toBeNull();
  });

  it("ignora camada travada", () => {
    const layers = [layer("travada", { locked: true })];
    const strokes = [stroke("s1", { layerId: "travada" })];

    expect(escolher(layers, strokes, ["s1"])).toBeNull();
  });

  it("ignores a stroke from a layer that is not in the list", () => {
    const strokes = [stroke("orfao", { layerId: "sumiu" })];

    expect(escolher([layer("l1")], strokes, ["orfao"])).toBeNull();
  });

  it("falls back to the layer below when the one above is not hit", () => {
    const layers = [layer("baixa", { order: 0 }), layer("alta", { order: 5 })];
    const strokes = [
      stroke("na-baixa", { layerId: "baixa" }),
      stroke("na-alta", { layerId: "alta" }),
    ];

    expect(escolher(layers, strokes, ["na-baixa"])?.id).toBe("na-baixa");
  });

  it("a stroke with no points at all is never hit", () => {
    const strokes = [stroke("vazio", { points: [] })];

    expect(escolher([layer("l1")], strokes, ["vazio"])).toBeNull();
  });
});
