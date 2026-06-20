import { describe, expect, it } from "vitest";
import { buildEditableFieldList, summarizeEditableFields } from "./document";
import type { RuntimeDocument } from "./types";

function makeDoc(parts: Partial<RuntimeDocument> = {}): RuntimeDocument {
  return {
    quickEdit: [],
    simpleSettings: { groups: [] },
    advanced: { fields: [], defaults: {}, effectiveValues: {} },
    overrides: {},
    ...parts,
  } as unknown as RuntimeDocument;
}

describe("buildEditableFieldList (Phase 3 Task 5)", () => {
  it("returns empty list for empty document", () => {
    const list = buildEditableFieldList(makeDoc());
    expect(list).toEqual([]);
  });

  it("includes quick edits with provenance=quick and uses `setting` as label", () => {
    const doc = makeDoc({
      quickEdit: [
        { setting: "Damage", category: "core", path: "config.damage", editable: true, value: 100, valueType: "number" },
      ],
    });
    const list = buildEditableFieldList(doc);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      path: "config.damage",
      label: "Damage",
      provenance: "quick",
      currentValue: 100,
      hasOverride: false,
    });
  });

  it("includes simple settings entries with provenance=simple and uses `name` as label", () => {
    const doc = makeDoc({
      simpleSettings: {
        groups: [
          {
            category: "Combat",
            entries: [
              { name: "Cooldown", path: "config.cd", editable: true, currentValue: 3, valueType: "number", description: "Seconds" },
            ],
          },
        ],
      },
    });
    const list = buildEditableFieldList(doc);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      path: "config.cd",
      label: "Cooldown",
      helpText: "Seconds",
      provenance: "simple",
      currentValue: 3,
    });
  });

  it("includes advanced fields with provenance=advanced", () => {
    const doc = makeDoc({
      advanced: {
        fields: [
          { path: "internal.shield", label: "Shield Charges", valueType: "number", effectiveValue: 1 },
        ],
        defaults: { "internal.shield": 1 },
        effectiveValues: { "internal.shield": 1 },
      },
    });
    const list = buildEditableFieldList(doc);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      path: "internal.shield",
      label: "Shield Charges",
      provenance: "advanced",
    });
  });

  it("merges all three sources in order: quick → simple → advanced", () => {
    const doc = makeDoc({
      quickEdit: [
        { setting: "Damage", category: "core", path: "config.damage", editable: true, value: 100 },
      ],
      simpleSettings: {
        groups: [
          {
            category: "Combat",
            entries: [{ name: "Cooldown", path: "config.cd", editable: true, currentValue: 3 }],
          },
        ],
      },
      advanced: {
        fields: [{ path: "internal.shield", label: "Shield", effectiveValue: 1 }],
      },
    });
    const list = buildEditableFieldList(doc);
    expect(list.map((f) => f.path)).toEqual(["config.damage", "config.cd", "internal.shield"]);
    expect(list.map((f) => f.provenance)).toEqual(["quick", "simple", "advanced"]);
  });

  it("dedupes by path — first occurrence wins (quick beats simple beats advanced)", () => {
    const doc = makeDoc({
      quickEdit: [
        { setting: "Damage", category: "core", path: "shared.path", editable: true, value: 100 },
      ],
      simpleSettings: {
        groups: [
          {
            category: "Combat",
            entries: [{ name: "Damage Simple", path: "shared.path", editable: true, currentValue: 999 }],
          },
        ],
      },
      advanced: {
        fields: [{ path: "shared.path", label: "Shared Adv", effectiveValue: 0 }],
      },
    });
    const list = buildEditableFieldList(doc);
    expect(list).toHaveLength(1);
    expect(list[0].provenance).toBe("quick");
    expect(list[0].label).toBe("Damage");
  });

  it("respects excludeIconPath option", () => {
    const doc = makeDoc({
      quickEdit: [
        { setting: "Damage", category: "core", path: "config.damage", editable: true, value: 100 },
        { setting: "Icon", category: "art", path: "config.icon", editable: true, value: "default" },
      ],
    });
    const list = buildEditableFieldList(doc, { excludeIconPath: "config.icon" });
    expect(list).toHaveLength(1);
    expect(list[0].path).toBe("config.damage");
  });

  it("flags hasOverride for paths present in overrides", () => {
    const doc = makeDoc({
      quickEdit: [
        { setting: "Damage", category: "core", path: "config.damage", editable: true, value: 100 },
        { setting: "Health", category: "core", path: "config.hp", editable: true, value: 200 },
      ],
      overrides: { "config.damage": 150 },
    });
    const list = buildEditableFieldList(doc);
    expect(list[0].hasOverride).toBe(true);
    expect(list[0].currentValue).toBe(150);
    expect(list[1].hasOverride).toBe(false);
  });

  it("uses draftOverrides when provided instead of saved overrides", () => {
    const doc = makeDoc({
      quickEdit: [
        { setting: "Damage", category: "core", path: "config.damage", editable: true, value: 100 },
      ],
      overrides: { "config.damage": 150 },
    });
    const list = buildEditableFieldList(doc, { draftOverrides: { "config.damage": 200 } });
    expect(list[0].currentValue).toBe(200);
    expect(list[0].hasOverride).toBe(true);
  });

  it("ignores entries without a path", () => {
    const doc = makeDoc({
      quickEdit: [
        { setting: "Damage", category: "core", path: "", editable: true, value: 100 } as never,
        { setting: "Health", category: "core", path: "config.hp", editable: true, value: 200 },
      ],
    });
    const list = buildEditableFieldList(doc);
    expect(list).toHaveLength(1);
    expect(list[0].path).toBe("config.hp");
  });
});

describe("summarizeEditableFields (Phase 3 Task 5)", () => {
  it("counts each provenance and overrides correctly", () => {
    const doc = makeDoc({
      quickEdit: [
        { setting: "A", category: "core", path: "a", editable: true, value: 1 },
        { setting: "B", category: "core", path: "b", editable: true, value: 2 },
      ],
      simpleSettings: {
        groups: [
          {
            category: "Group",
            entries: [
              { name: "C", path: "c", editable: true, currentValue: 3 },
              { name: "D", path: "d", editable: true, currentValue: 4 },
              { name: "E", path: "e", editable: true, currentValue: 5 },
            ],
          },
        ],
      },
      advanced: {
        fields: [{ path: "f", label: "F", effectiveValue: 6 }],
      },
      overrides: { a: 10, c: 30 },
    });
    const summary = summarizeEditableFields(doc);
    expect(summary).toEqual({
      total: 6,
      quick: 2,
      simple: 3,
      advanced: 1,
      withOverrides: 2,
    });
  });
});
