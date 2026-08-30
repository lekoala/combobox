import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../src/helpers.js", import.meta.url), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const { normalize, toItem, parseSeparators, splitTokens } = sandbox.window.ComboboxHelpers;

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
