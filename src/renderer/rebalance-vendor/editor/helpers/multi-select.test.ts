// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { multiSelectReducer, useMultiSelect } from "./multi-select";

describe("multiSelectReducer (Phase 3 Task 13)", () => {
  it("returns a fresh Set on add (referential change)", () => {
    const prev = new Set<string>();
    const next = multiSelectReducer<string>(prev, { type: "add", payload: "a" });
    expect(next).not.toBe(prev);
    expect(next.has("a")).toBe(true);
  });

  it("remove drops the id but keeps others", () => {
    const prev = new Set(["a", "b"]);
    const next = multiSelectReducer<string>(prev, { type: "remove", payload: "a" });
    expect(next.has("a")).toBe(false);
    expect(next.has("b")).toBe(true);
  });

  it("toggle adds when missing and removes when present", () => {
    let state = new Set<string>();
    state = multiSelectReducer<string>(state, { type: "toggle", payload: "x" });
    expect(state.has("x")).toBe(true);
    state = multiSelectReducer<string>(state, { type: "toggle", payload: "x" });
    expect(state.has("x")).toBe(false);
  });

  it("addMany unions ids", () => {
    const next = multiSelectReducer<string>(new Set(["a"]), {
      type: "addMany",
      payload: ["b", "c"],
    });
    expect([...next].sort()).toEqual(["a", "b", "c"]);
  });

  it("removeMany subtracts ids", () => {
    const next = multiSelectReducer<string>(new Set(["a", "b", "c"]), {
      type: "removeMany",
      payload: ["a", "c"],
    });
    expect([...next]).toEqual(["b"]);
  });

  it("clear empties the set", () => {
    const next = multiSelectReducer<string>(new Set(["a", "b"]), { type: "clear" });
    expect(next.size).toBe(0);
  });

  it("selectAll replaces the set", () => {
    const next = multiSelectReducer<string>(new Set(["a"]), {
      type: "selectAll",
      payload: ["x", "y", "z"],
    });
    expect([...next].sort()).toEqual(["x", "y", "z"]);
  });
});

describe("useMultiSelect (Phase 3 Task 13)", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useMultiSelect<string>());
    expect(result.current.count).toBe(0);
    expect(result.current.hasSelection).toBe(false);
  });

  it("add toggles isSelected and updates count", () => {
    const { result } = renderHook(() => useMultiSelect<string>());
    act(() => {
      result.current.add("a");
    });
    expect(result.current.isSelected("a")).toBe(true);
    expect(result.current.count).toBe(1);
    expect(result.current.hasSelection).toBe(true);
  });

  it("remove drops from selection", () => {
    const { result } = renderHook(() => useMultiSelect<string>());
    act(() => {
      result.current.add("a");
      result.current.add("b");
      result.current.remove("a");
    });
    expect(result.current.count).toBe(1);
    expect(result.current.isSelected("a")).toBe(false);
    expect(result.current.isSelected("b")).toBe(true);
  });

  it("toggle flips state", () => {
    const { result } = renderHook(() => useMultiSelect<string>());
    act(() => {
      result.current.toggle("x");
    });
    expect(result.current.isSelected("x")).toBe(true);
    act(() => {
      result.current.toggle("x");
    });
    expect(result.current.isSelected("x")).toBe(false);
  });

  it("clear resets the set", () => {
    const { result } = renderHook(() => useMultiSelect<string>());
    act(() => {
      result.current.add("a");
      result.current.add("b");
      result.current.clear();
    });
    expect(result.current.count).toBe(0);
  });

  it("selectAll replaces the set", () => {
    const { result } = renderHook(() => useMultiSelect<string>());
    act(() => {
      result.current.selectAll(["x", "y", "z"]);
    });
    expect(result.current.count).toBe(3);
  });

  it("isAllSelected matches when all candidates are selected", () => {
    const { result } = renderHook(() => useMultiSelect<string>());
    act(() => {
      result.current.selectAll(["x", "y"]);
    });
    expect(result.current.isAllSelected(["x", "y"])).toBe(true);
    expect(result.current.isAllSelected(["x", "y", "z"])).toBe(false);
  });
});
