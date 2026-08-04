import { describe, expect, it } from "vitest";
import type {
  CapabilitySnapshot,
  CatalogPermission,
  GrantEffect,
  GrantView,
  PermissionCatalog,
  PermissionTargetKind,
} from "@/lib/types/permission-types";
import { buildImpliedIndex, can } from "./engine";

const NOTEBOOK = "11111111-1111-1111-1111-111111111111";
const OTHER_NOTEBOOK = "22222222-2222-2222-2222-222222222222";
const BLOCK = "33333333-3333-3333-3333-333333333333";
const OTHER_BLOCK = "44444444-4444-4444-4444-444444444444";

function perm(key: string, impliedBy: string[] = []): CatalogPermission {
  return {
    key,
    tier: "granular",
    targets: ["notebook"],
    label: `perm.${key}`,
    impliedBy,
    view: null,
  };
}

function catalog(...permissions: CatalogPermission[]): PermissionCatalog {
  return { permissions };
}

function grant(
  key: string,
  effect: GrantEffect,
  kind: PermissionTargetKind,
  opts: { targetId?: string | null; targetValue?: string | null } = {},
): GrantView {
  return {
    permissionKey: key,
    effect,
    targetKind: kind,
    targetId: opts.targetId ?? null,
    targetValue: opts.targetValue ?? null,
  };
}

function snapshot(grants: GrantView[], all = false): CapabilitySnapshot {
  return { all, grants };
}

const target = { notebookId: NOTEBOOK };

describe("buildImpliedIndex", () => {
  it("indexa implied_by por chave", () => {
    const index = buildImpliedIndex(
      catalog(perm("a.view", ["a"]), perm("a"), perm("b.view", ["b", "a"])),
    );

    expect(index.get("a.view")).toEqual(["a"]);
    expect(index.get("a")).toEqual([]);
    expect(index.get("b.view")).toEqual(["b", "a"]);
  });

  it("returns an empty map for an empty catalog", () => {
    expect(buildImpliedIndex(catalog()).size).toBe(0);
  });
});

describe("can — default deny", () => {
  const implied = buildImpliedIndex(catalog(perm("notebook.view")));

  it("denies when there is no grant at all", () => {
    expect(can(snapshot([]), implied, "notebook.view", target)).toBe(false);
  });

  it("denies when the grant is for another permission", () => {
    const snap = snapshot([grant("notebook.edit", "allow", "team")]);
    expect(can(snap, implied, "notebook.view", target)).toBe(false);
  });

  it("denies with an empty catalog, because the key doesn't expand into anything", () => {
    const vazio = buildImpliedIndex(catalog());
    const snap = snapshot([grant("notebook.blocks.view", "allow", "team")]);
    expect(can(snap, vazio, "notebook.view", target)).toBe(false);
  });

  it("allows with an empty catalog when the grant is for the key itself", () => {
    const vazio = buildImpliedIndex(catalog());
    const snap = snapshot([grant("notebook.view", "allow", "team")]);
    expect(can(snap, vazio, "notebook.view", target)).toBe(true);
  });
});

describe("can — snapshot.all curto-circuita", () => {
  const implied = buildImpliedIndex(catalog(perm("notebook.delete")));

  it("permite qualquer chave sem consultar grants", () => {
    expect(can(snapshot([], true), implied, "notebook.delete", target)).toBe(
      true,
    );
  });

  it("allows even when there is an explicit deny", () => {
    const snap = snapshot([grant("notebook.delete", "deny", "team")], true);
    expect(can(snap, implied, "notebook.delete", target)).toBe(true);
  });
});

describe("can — level precedence", () => {
  const implied = buildImpliedIndex(
    catalog(perm("b.view", ["a.view"]), perm("a.view")),
  );

  it("global (0) perde para team (1)", () => {
    const snap = snapshot([
      grant("a.view", "allow", "global"),
      grant("a.view", "deny", "team"),
    ]);
    expect(can(snap, implied, "a.view", target)).toBe(false);
  });

  it("team (1) perde para notebook (2)", () => {
    const snap = snapshot([
      grant("a.view", "deny", "team"),
      grant("a.view", "allow", "notebook", { targetId: NOTEBOOK }),
    ]);
    expect(can(snap, implied, "a.view", target)).toBe(true);
  });

  it("notebook (2) perde para block_type (3)", () => {
    const snap = snapshot([
      grant("a.view", "allow", "notebook", { targetId: NOTEBOOK }),
      grant("a.view", "deny", "block_type", { targetValue: "rust" }),
    ]);
    expect(
      can(snap, implied, "a.view", { notebookId: NOTEBOOK, blockType: "rust" }),
    ).toBe(false);
  });

  it("block_type (3) perde para block (4)", () => {
    const snap = snapshot([
      grant("a.view", "deny", "block_type", { targetValue: "rust" }),
      grant("a.view", "allow", "block", { targetId: BLOCK }),
    ]);
    expect(
      can(snap, implied, "a.view", {
        notebookId: NOTEBOOK,
        blockType: "rust",
        blockId: BLOCK,
      }),
    ).toBe(true);
  });

  it("the order of grants in the list does not change the result", () => {
    const grants = [
      grant("a.view", "allow", "notebook", { targetId: NOTEBOOK }),
      grant("a.view", "deny", "team"),
    ];
    const direta = can(snapshot(grants), implied, "a.view", target);
    const inversa = can(
      snapshot([...grants].reverse()),
      implied,
      "a.view",
      target,
    );

    expect(direta).toBe(true);
    expect(inversa).toBe(true);
  });
});

describe("can — deny beats allow at the same level", () => {
  const implied = buildImpliedIndex(catalog(perm("a.view")));

  it("nega com allow e deny ambos em team", () => {
    const snap = snapshot([
      grant("a.view", "allow", "team"),
      grant("a.view", "deny", "team"),
    ]);
    expect(can(snap, implied, "a.view", target)).toBe(false);
  });

  it("nega independente da ordem", () => {
    const snap = snapshot([
      grant("a.view", "deny", "team"),
      grant("a.view", "allow", "team"),
    ]);
    expect(can(snap, implied, "a.view", target)).toBe(false);
  });

  it("denies when the deny comes from the general key and the allow from the granular one, at the same level", () => {
    const idx = buildImpliedIndex(
      catalog(perm("a.rust.view", ["a.view"]), perm("a.view")),
    );
    const snap = snapshot([
      grant("a.view", "deny", "team"),
      grant("a.rust.view", "allow", "team"),
    ]);
    expect(can(snap, idx, "a.rust.view", target)).toBe(false);
  });
});

describe("can — implied_by", () => {
  it("resolves a three-level transitive chain", () => {
    const implied = buildImpliedIndex(
      catalog(perm("c", ["b"]), perm("b", ["a"]), perm("a")),
    );
    const snap = snapshot([grant("a", "allow", "team")]);

    expect(can(snap, implied, "c", target)).toBe(true);
  });

  it("does not walk the opposite direction: a granular grant does not grant the general one", () => {
    const implied = buildImpliedIndex(catalog(perm("c", ["b"]), perm("b")));
    const snap = snapshot([grant("c", "allow", "team")]);

    expect(can(snap, implied, "b", target)).toBe(false);
  });

  it("termina em ciclo direto a → b → a", () => {
    const implied = buildImpliedIndex(
      catalog(perm("a", ["b"]), perm("b", ["a"])),
    );
    const snap = snapshot([grant("b", "allow", "team")]);

    expect(can(snap, implied, "a", target)).toBe(true);
  });

  it("terminates on a three-cycle and still denies what wasn't granted", () => {
    const implied = buildImpliedIndex(
      catalog(perm("a", ["b"]), perm("b", ["c"]), perm("c", ["a"])),
    );
    const snap = snapshot([grant("z", "allow", "team")]);

    expect(can(snap, implied, "a", target)).toBe(false);
  });

  it("terminates when the permission implies itself", () => {
    const implied = buildImpliedIndex(catalog(perm("a", ["a"])));
    const snap = snapshot([grant("a", "allow", "team")]);

    expect(can(snap, implied, "a", target)).toBe(true);
  });

  it("ignores a parent missing from the catalog", () => {
    const implied = buildImpliedIndex(catalog(perm("a", ["fantasma"])));
    const snap = snapshot([grant("fantasma", "allow", "team")]);

    expect(can(snap, implied, "a", target)).toBe(true);
  });
});

describe("can — alvo tem de casar", () => {
  const implied = buildImpliedIndex(catalog(perm("a.view")));

  it("ignora grant de notebook de outro notebook", () => {
    const snap = snapshot([
      grant("a.view", "allow", "notebook", { targetId: OTHER_NOTEBOOK }),
    ]);
    expect(can(snap, implied, "a.view", target)).toBe(false);
  });

  it("ignora grant de notebook sem target_id", () => {
    const snap = snapshot([grant("a.view", "allow", "notebook")]);
    expect(can(snap, implied, "a.view", target)).toBe(false);
  });

  it("ignores a block_type grant when the target does not declare blockType", () => {
    const snap = snapshot([
      grant("a.view", "allow", "block_type", { targetValue: "rust" }),
    ]);
    expect(can(snap, implied, "a.view", target)).toBe(false);
  });

  it("ignora grant de block_type de outro tipo", () => {
    const snap = snapshot([
      grant("a.view", "allow", "block_type", { targetValue: "go" }),
    ]);
    expect(
      can(snap, implied, "a.view", { notebookId: NOTEBOOK, blockType: "rust" }),
    ).toBe(false);
  });

  it("ignora grant de block de outro bloco", () => {
    const snap = snapshot([
      grant("a.view", "allow", "block", { targetId: OTHER_BLOCK }),
    ]);
    expect(
      can(snap, implied, "a.view", { notebookId: NOTEBOOK, blockId: BLOCK }),
    ).toBe(false);
  });

  it("ignores a chat-kind grant, which has no level", () => {
    const snap = snapshot([grant("a.view", "allow", "chat")]);
    expect(can(snap, implied, "a.view", target)).toBe(false);
  });

  it("a chat-kind deny does not block a team allow", () => {
    const snap = snapshot([
      grant("a.view", "deny", "chat"),
      grant("a.view", "allow", "team"),
    ]);
    expect(can(snap, implied, "a.view", target)).toBe(true);
  });
});
