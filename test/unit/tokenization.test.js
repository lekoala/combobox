import { expect, test } from "bun:test";
import { parseSeparators, prepareTokenSplitter, splitTokens } from "../../src/helpers.js";

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

test("prepared separator splitter handles repeated calls, adjacent separators and literal tokens", () => {
  const split = prepareTokenSplitter([";", ";;", "|", ".*"]);
  expect(split("a;;b;tail")).toEqual({
    done: [
      { text: "a", sep: ";;" },
      { text: "b", sep: ";" },
    ],
    rest: "tail",
  });
  expect(split(";|c.*")).toEqual({
    done: [
      { text: "", sep: ";" },
      { text: "", sep: "|" },
      { text: "c", sep: ".*" },
    ],
    rest: "",
  });
  expect(split("again;")).toEqual({ done: [{ text: "again", sep: ";" }], rest: "" });
  expect(split("rest")).toEqual({ done: [], rest: "rest" });
});

test("empty segments retain every separator and exact consumed offsets", () => {
  const split = prepareTokenSplitter([",", "~~"]);
  const value = ",,alpha~~,beta,,tail";
  const result = split(value);
  expect(result).toEqual({
    done: [
      { text: "", sep: "," },
      { text: "", sep: "," },
      { text: "alpha", sep: "~~" },
      { text: "", sep: "," },
      { text: "beta", sep: "," },
      { text: "", sep: "," },
    ],
    rest: "tail",
  });
  expect(result.done.map(({ text, sep }) => text + sep).join("") + result.rest).toBe(value);
});
