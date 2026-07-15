type Point = { x: number; y: number };

const SVG_NS = "http://www.w3.org/2000/svg";

function nodeIdOf(el: Element): string | null {
  const match = el.id.match(/^flowchart-(.+?)-\d+$/);
  return match ? match[1] : null;
}

function centerOf(node: SVGGraphicsElement): Point {
  const box = node.getBBox();
  const matrix = node.transform.baseVal.consolidate()?.matrix;
  const tx = matrix ? matrix.e : 0;
  const ty = matrix ? matrix.f : 0;
  return { x: tx + box.x + box.width / 2, y: ty + box.y + box.height / 2 };
}

export function makeMermaidInteractive(svg: SVGSVGElement): () => void {
  const layer = document.createElementNS(SVG_NS, "g");
  layer.setAttribute("class", "pz-layer");
  while (svg.firstChild) {
    layer.appendChild(svg.firstChild);
  }
  svg.appendChild(layer);
  svg.style.touchAction = "none";
  svg.style.cursor = "grab";

  let tx = 0;
  let ty = 0;
  let k = 1;
  const apply = () => {
    layer.setAttribute("transform", `translate(${tx} ${ty}) scale(${k})`);
  };

  const toRoot = (clientX: number, clientY: number): Point => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const inv = ctm.inverse();
    return {
      x: inv.a * clientX + inv.c * clientY + inv.e,
      y: inv.b * clientX + inv.d * clientY + inv.f,
    };
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const pt = toRoot(event.clientX, event.clientY);
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const nextK = Math.min(5, Math.max(0.2, k * factor));
    tx = pt.x - (nextK / k) * (pt.x - tx);
    ty = pt.y - (nextK / k) * (pt.y - ty);
    k = nextK;
    apply();
  };

  let mode: "none" | "pan" | "node" = "none";
  let start: Point = { x: 0, y: 0 };
  let panStart = { tx: 0, ty: 0 };
  let dragNode: SVGGraphicsElement | null = null;
  let nodeStart = { x: 0, y: 0 };
  let connected: {
    path: SVGPathElement;
    source: SVGGraphicsElement;
    target: SVGGraphicsElement;
  }[] = [];

  const buildConnections = (id: string) => {
    connected = [];
    const nodes = new Map<string, SVGGraphicsElement>();
    layer.querySelectorAll<SVGGraphicsElement>("g.node").forEach((node) => {
      const nid = nodeIdOf(node);
      if (nid) nodes.set(nid, node);
    });
    layer
      .querySelectorAll<SVGPathElement>("path.flowchart-link")
      .forEach((path) => {
        let source: string | null = null;
        let target: string | null = null;
        for (const cls of Array.from(path.classList)) {
          if (cls.startsWith("LS-")) source = cls.slice(3);
          else if (cls.startsWith("LE-")) target = cls.slice(3);
        }
        if (
          (source === id || target === id) &&
          source &&
          target &&
          nodes.has(source) &&
          nodes.has(target)
        ) {
          const s = nodes.get(source);
          const t = nodes.get(target);
          if (s && t) connected.push({ path, source: s, target: t });
        }
      });
  };

  const reflow = () => {
    for (const edge of connected) {
      const s = centerOf(edge.source);
      const t = centerOf(edge.target);
      edge.path.setAttribute("d", `M${s.x},${s.y}L${t.x},${t.y}`);
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as Element | null;
    const nodeEl = target?.closest("g.node") as SVGGraphicsElement | null;
    start = toRoot(event.clientX, event.clientY);
    svg.setPointerCapture(event.pointerId);

    if (nodeEl && nodeIdOf(nodeEl)) {
      mode = "node";
      dragNode = nodeEl;
      const matrix = nodeEl.transform.baseVal.consolidate()?.matrix;
      nodeStart = { x: matrix ? matrix.e : 0, y: matrix ? matrix.f : 0 };
      buildConnections(nodeIdOf(nodeEl) ?? "");
      svg.style.cursor = "grabbing";
    } else {
      mode = "pan";
      panStart = { tx, ty };
      svg.style.cursor = "grabbing";
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (mode === "none") return;
    const now = toRoot(event.clientX, event.clientY);
    if (mode === "pan") {
      tx = panStart.tx + (now.x - start.x);
      ty = panStart.ty + (now.y - start.y);
      apply();
    } else if (mode === "node" && dragNode) {
      const nx = nodeStart.x + (now.x - start.x) / k;
      const ny = nodeStart.y + (now.y - start.y) / k;
      dragNode.setAttribute("transform", `translate(${nx}, ${ny})`);
      reflow();
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    mode = "none";
    dragNode = null;
    connected = [];
    svg.style.cursor = "grab";
    if (svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
  };

  svg.addEventListener("wheel", onWheel, { passive: false });
  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", onPointerUp);
  svg.addEventListener("pointercancel", onPointerUp);

  return () => {
    svg.removeEventListener("wheel", onWheel);
    svg.removeEventListener("pointerdown", onPointerDown);
    svg.removeEventListener("pointermove", onPointerMove);
    svg.removeEventListener("pointerup", onPointerUp);
    svg.removeEventListener("pointercancel", onPointerUp);
  };
}
