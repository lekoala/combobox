import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../src/helpers.js", import.meta.url), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const { normalize, toItem, parseSeparators, splitTokens, rankByScore, reconcileSelected, moveValueInOrder } =
  sandbox.window.ComboboxHelpers;

test("normalize strips accents and lowercases", () => {
  expect(normalize("Liège")).toBe("liege");
  expect(normalize("  ÉéÀà  ")).toBe("  eeaa  ");
  expect(normalize(null)).toBe("");
});

test("toItem accepts strings, numbers and id/text objects", () => {
  expect(toItem("x")).toEqual({ value: "x", label: "x" });
  expect(toItem(5)).toEqual({ value: "5", label: "5" });
  expect(toItem({ id: "1", text: "One" })).toEqual({ value: "1", label: "One", id: "1", text: "One" });
  expect(toItem(null)).toBeNull();
});

test("toItem maps data objects through labelField/valueField", () => {
  const fields = { labelField: "QIP_NAME", valueField: "QIP_NO" };
  const item = toItem({ QIP_NO: "0001", QIP_NAME: "Alice", QIP_Product: "X" }, fields);
  expect(item.value).toBe("0001");
  expect(item.label).toBe("Alice");
  expect(item.QIP_Product).toBe("X");
});

test("toItem never reinterprets canonical value/label objects", () => {
  const mapped = toItem(
    { value: "1", label: "Apple", name: "Wrong" },
    { labelField: "name", valueField: "value" },
  );
  expect(mapped).toEqual({ value: "1", label: "Apple", name: "Wrong" });
});

test("parseSeparators rejects empty entries and keeps multi-char separators", () => {
  expect(parseSeparators(",|;")).toEqual([",", ";"]);
  expect(parseSeparators(" |,|  ")).toEqual([" ", ",", "  "]);
  expect(parseSeparators("|,|")).toEqual([","]);
  expect(parseSeparators(null)).toEqual([]);
  expect(parseSeparators(["", ",", " | "])).toEqual([",", " | "]);
});

test("splitTokens consumes separator-terminated tokens and keeps the rest", () => {
  expect(splitTokens("alpha,beta,gamma", [","])).toEqual({
    done: [
      { text: "alpha", sep: "," },
      { text: "beta", sep: "," },
    ],
    rest: "gamma",
  });
  expect(splitTokens("alpha,", [","])).toEqual({ done: [{ text: "alpha", sep: "," }], rest: "" });
  expect(splitTokens("alpha,beta", [","])).toEqual({
    done: [{ text: "alpha", sep: "," }],
    rest: "beta",
  });
});

test("splitTokens prefers the longest overlapping separator", () => {
  const result = splitTokens("a~~b~c", ["~~", "~"]);
  expect(result).toEqual({
    done: [
      { text: "a", sep: "~~" },
      { text: "b", sep: "~" },
    ],
    rest: "c",
  });
});

test("splitTokens escapes regex metacharacters in separators", () => {
  expect(splitTokens("a.b,c", [".", ","])).toEqual({
    done: [
      { text: "a", sep: "." },
      { text: "b", sep: "," },
    ],
    rest: "c",
  });
});

test("splitTokens works with empty and whitespace-only separators", () => {
  expect(splitTokens("a  b c", [" ", "  "])).toEqual({
    done: [
      { text: "a", sep: "  " },
      { text: "b", sep: " " },
    ],
    rest: "c",
  });
  expect(splitTokens("alpha", [])).toEqual({ done: [], rest: "alpha" });
  expect(splitTokens("", [","])).toEqual({ done: [], rest: "" });
});

test("rankByScore sorts by descending score and excludes false/null", () => {
  const items = ["a", "b", "c", "d"];
  const score = (item) => ({ a: 3, b: 1, c: false, d: null })[item];
  expect(rankByScore(items, score)).toEqual(["a", "b"]);
});

test("rankByScore keeps 0 as a valid score and preserves relative order on ties", () => {
  const items = [{ v: "x" }, { v: "y" }, { v: "z" }];
  // All zero: every item survives and stays in input order (0 is not falsy here).
  expect(rankByScore(items, () => 0)).toEqual(items);
});

test("rankByScore passes the input index to the scorer and is tie-stable", () => {
  const items = ["a", "b", "c", "d", "e"];
  const seen = [];
  const result = rankByScore(items, (item, index) => {
    seen.push(index);
    // Equal scores for a/b; c wins; later items excluded.
    if (item === "c") return 2;
    if (item === "d" || item === "e") return false;
    return 1;
  });
  expect(result).toEqual(["c", "a", "b"]);
  expect(seen).toEqual([0, 1, 2, 3, 4]);
});

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
