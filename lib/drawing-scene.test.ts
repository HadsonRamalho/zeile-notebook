import { describe, expect, it } from "vitest";
import type { Block, DrawingElement, Notebook } from "@/lib/types";
import {
  readSceneElements,
  sceneSignature,
  writeSceneElements,
} from "./drawing-scene";

function element(
  id: string,
  extra: Record<string, unknown> = {},
): DrawingElement {
  return {
    id,
    version: 1,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    ...extra,
  };
}

function notebook(blocks: Block[]): Notebook {
  return {
    id: "nb-1",
    title: "Caderno",
    userId: null,
    team_id: null,
    isPublic: false,
    createdAt: "2026-07-29T00:00:00Z",
    updatedAt: "2026-07-29T00:00:00Z",
    blocks,
  };
}

function drawingBlock(
  id: string,
  elements: Record<string, DrawingElement> | undefined = {},
): Block {
  return {
    id,
    title: "Desenho",
    type: "drawing",
    content: "",
    ...(elements === undefined ? {} : { scene: { elements } }),
  };
}

describe("readSceneElements", () => {
  it("devolve os elementos do bloco pedido", () => {
    const doc = notebook([
      drawingBlock("b1", { e1: element("e1"), e2: element("e2") }),
    ]);

    expect(
      readSceneElements(doc, "b1")
        .map((e) => e.id)
        .sort(),
    ).toEqual(["e1", "e2"]);
  });

  it("devolve vazio para doc nulo, bloco inexistente ou bloco sem scene", () => {
    const doc = notebook([drawingBlock("b1", undefined)]);

    expect(readSceneElements(null, "b1")).toEqual([]);
    expect(readSceneElements(doc, "inexistente")).toEqual([]);
    expect(readSceneElements(doc, "b1")).toEqual([]);
  });
});

describe("writeSceneElements", () => {
  it("cria scene quando o bloco ainda não tem", () => {
    const doc = notebook([drawingBlock("b1", undefined)]);

    writeSceneElements(doc, "b1", [element("e1")]);

    expect(Object.keys(doc.blocks[0]?.scene?.elements ?? {})).toEqual(["e1"]);
  });

  it("não faz nada quando o bloco não existe", () => {
    const doc = notebook([drawingBlock("b1")]);

    expect(() =>
      writeSceneElements(doc, "outro", [element("e1")]),
    ).not.toThrow();
    expect(doc.blocks[0]?.scene?.elements).toEqual({});
  });

  it("remove do scene os elementos ausentes da lista de entrada", () => {
    const doc = notebook([
      drawingBlock("b1", { e1: element("e1"), e2: element("e2") }),
    ]);

    writeSceneElements(doc, "b1", [element("e1")]);

    expect(Object.keys(doc.blocks[0]?.scene?.elements ?? {})).toEqual(["e1"]);
  });

  it("grava cópia profunda, não referência ao objeto de entrada", () => {
    const doc = notebook([drawingBlock("b1")]);
    const entrada = element("e1", { points: [[0, 0]] });

    writeSceneElements(doc, "b1", [entrada]);
    const gravado = doc.blocks[0]?.scene?.elements.e1;

    expect(gravado).not.toBe(entrada);
    expect(gravado).toEqual(entrada);
  });

  it("reescreve quando o conteúdo muda de verdade", () => {
    const doc = notebook([drawingBlock("b1", { e1: element("e1") })]);
    const antes = doc.blocks[0]?.scene?.elements.e1;

    writeSceneElements(doc, "b1", [element("e1", { width: 999 })]);
    const depois = doc.blocks[0]?.scene?.elements.e1;

    expect(depois).not.toBe(antes);
    expect(depois?.width).toBe(999);
  });

  it("invariante do loop de eco: não reescreve quando só campos voláteis mudam", () => {
    const doc = notebook([
      drawingBlock("b1", {
        e1: element("e1", {
          version: 1,
          versionNonce: 111,
          updated: 1,
          seed: 7,
        }),
      }),
    ]);
    const antes = doc.blocks[0]?.scene?.elements.e1;

    writeSceneElements(doc, "b1", [
      element("e1", { version: 2, versionNonce: 222, updated: 2, seed: 8 }),
    ]);

    expect(doc.blocks[0]?.scene?.elements.e1).toBe(antes);
  });

  it("invariante do loop de eco: chamada repetida com o mesmo conteúdo é no-op", () => {
    const doc = notebook([drawingBlock("b1")]);
    writeSceneElements(doc, "b1", [element("e1")]);
    const antes = doc.blocks[0]?.scene?.elements.e1;

    writeSceneElements(doc, "b1", [element("e1")]);

    expect(doc.blocks[0]?.scene?.elements.e1).toBe(antes);
  });

  it("reescreve quando um campo não volátil muda junto com os voláteis", () => {
    const doc = notebook([
      drawingBlock("b1", { e1: element("e1", { version: 1, x: 0 }) }),
    ]);
    const antes = doc.blocks[0]?.scene?.elements.e1;

    writeSceneElements(doc, "b1", [element("e1", { version: 2, x: 5 })]);

    expect(doc.blocks[0]?.scene?.elements.e1).not.toBe(antes);
  });

  it("trata isDeleted como conteúdo, não como campo volátil", () => {
    const doc = notebook([
      drawingBlock("b1", { e1: element("e1", { isDeleted: false }) }),
    ]);
    const antes = doc.blocks[0]?.scene?.elements.e1;

    writeSceneElements(doc, "b1", [element("e1", { isDeleted: true })]);

    expect(doc.blocks[0]?.scene?.elements.e1).not.toBe(antes);
  });
});

describe("sceneSignature", () => {
  it("ignora a ordem dos elementos", () => {
    const a = element("a");
    const b = element("b");

    expect(sceneSignature([a, b])).toBe(sceneSignature([b, a]));
  });

  it("ignora a ordem das chaves dentro do elemento", () => {
    const a = { id: "a", version: 1, x: 1, y: 2 } as DrawingElement;
    const b = { y: 2, x: 1, version: 1, id: "a" } as DrawingElement;

    expect(sceneSignature([a])).toBe(sceneSignature([b]));
  });

  it("ignora campos voláteis", () => {
    const antes = element("a", {
      version: 1,
      versionNonce: 1,
      updated: 1,
      seed: 1,
    });
    const depois = element("a", {
      version: 9,
      versionNonce: 9,
      updated: 9,
      seed: 9,
    });

    expect(sceneSignature([antes])).toBe(sceneSignature([depois]));
  });

  it("muda quando o conteúdo muda", () => {
    expect(sceneSignature([element("a", { x: 0 })])).not.toBe(
      sceneSignature([element("a", { x: 1 })]),
    );
  });

  it("muda quando um elemento é removido", () => {
    expect(sceneSignature([element("a"), element("b")])).not.toBe(
      sceneSignature([element("a")]),
    );
  });

  it("muda quando um elemento é marcado como deletado", () => {
    expect(sceneSignature([element("a", { isDeleted: false })])).not.toBe(
      sceneSignature([element("a", { isDeleted: true })]),
    );
  });

  it("é estável para cena vazia", () => {
    expect(sceneSignature([])).toBe("");
  });

  it("sobrevive a round-trip por JSON, como no CRDT", () => {
    const els = [element("a", { nested: { b: 1, a: 2 }, list: [1, 2, 3] })];
    const roundTrip = JSON.parse(JSON.stringify(els)) as DrawingElement[];

    expect(sceneSignature(roundTrip)).toBe(sceneSignature(els));
  });
});
