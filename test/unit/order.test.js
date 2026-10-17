import { expect, test } from "bun:test";
import { moveValueInOrder, reconcileSelected } from "../../src/helpers.js";

test("reconcileSelected merges remembered order with native selected values", () => {
  expect(reconcileSelected(["a", "b", "c"], ["c", "a"])).toEqual(["c", "a", "b"]);
});

test("reconcileSelected never keeps a remembered value that is no longer selected", () => {
  // "a" was remembered but is no longer selected: source of truth is values.
  expect(reconcileSelected(["b", "c"], ["a", "b"])).toEqual(["b", "c"]);
});

test("reconcileSelected appends unknown selected values in native order", () => {
  expect(reconcileSelected(["x", "y", "z"], [])).toEqual(["x", "y", "z"]);
  expect(reconcileSelected(["x", "y", "z"], ["z"])).toEqual(["z", "x", "y"]);
  expect(reconcileSelected([], ["a", "b"])).toEqual([]);
});

test("moveValueInOrder returns a fresh reordered array with from/to", () => {
  const order = ["a", "b", "c", "d"];
  const moved = moveValueInOrder(order, "c", 0);
  expect(moved).toEqual({ order: ["c", "a", "b", "d"], from: 2, to: 0 });
  // Input must never be mutated.
  expect(order).toEqual(["a", "b", "c", "d"]);

  const right = moveValueInOrder(order, "a", 3);
  expect(right).toEqual({ order: ["b", "c", "d", "a"], from: 0, to: 3 });
  expect(order).toEqual(["a", "b", "c", "d"]);
});

test("moveValueInOrder clamps to bounds and returns null for no-ops/unknown values", () => {
  // Clamping produces a real move from a non-last position to a bound.
  expect(moveValueInOrder(["a", "b", "c", "d"], "b", 99)).toEqual({
    order: ["a", "c", "d", "b"],
    from: 1,
    to: 3,
  });
  expect(moveValueInOrder(["a", "b", "c", "d"], "d", -5)).toEqual({
    order: ["d", "a", "b", "c"],
    from: 3,
    to: 0,
  });

  // Clamped to its own position (or explicitly same position) is a no-op.
  expect(moveValueInOrder(["a", "b", "c"], "c", 99)).toBeNull();
  expect(moveValueInOrder(["a", "b", "c"], "a", -5)).toBeNull();
  expect(moveValueInOrder(["a", "b", "c"], "a", 0)).toBeNull();
  expect(moveValueInOrder(["a", "b", "c"], "zz", 1)).toBeNull();
  expect(moveValueInOrder([], "a", 1)).toBeNull();
});

test("moveValueInOrder rejects a non-finite index instead of moving to the head", () => {
  // `splice(NaN)` would silently coerce to 0; a non-position must be refused.
  expect(moveValueInOrder(["a", "b", "c"], "c", Number.NaN)).toBeNull();
  expect(moveValueInOrder(["a", "b", "c"], "c", Number("x"))).toBeNull();
  expect(moveValueInOrder(["a", "b", "c"], "c", Number.POSITIVE_INFINITY)).toBeNull();
  expect(moveValueInOrder(["a", "b", "c"], "c", Number.NEGATIVE_INFINITY)).toBeNull();
});
