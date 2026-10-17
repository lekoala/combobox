import { expect, test } from "bun:test";
import {
  fuzzyMatch,
  matchesField,
  normalize,
  patternMatch,
  prepareFieldMatcher,
  rankByScore,
  stripDiacritics,
} from "../../src/helpers.js";

test("normalize strips accents and lowercases", () => {
  expect(normalize("Liège")).toBe("liege");
  expect(normalize("  ÉéÀà  ")).toBe("  eeaa  ");
  expect(normalize(null)).toBe("");
});

test("stripDiacritics folds accents but preserves case", () => {
  expect(stripDiacritics("Liège")).toBe("Liege");
  expect(stripDiacritics("ÉÉÉ")).toBe("EEE");
  expect(stripDiacritics("déjà-vu")).toBe("deja-vu");
  expect(stripDiacritics("plain")).toBe("plain");
  expect(stripDiacritics(null)).toBe("");
  // single source of truth: normalize is stripDiacritics + lowercase.
  expect(normalize("Liège")).toBe(stripDiacritics("Liège").toLocaleLowerCase());
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

test("fuzzyMatch matches full substrings and order-preserving subsequences", () => {
  expect(fuzzyMatch("banana", "ban")).toBe(true);
  expect(fuzzyMatch("banana", "bnn")).toBe(true);
  expect(fuzzyMatch("banana", "banana")).toBe(true);
});

test("fuzzyMatch rejects out-of-order characters and the empty target", () => {
  expect(fuzzyMatch("banana", "bnb")).toBe(false);
  expect(fuzzyMatch("banana", "zzz")).toBe(false);
  expect(fuzzyMatch("", "a")).toBe(false);
  expect(fuzzyMatch("", "")).toBe(true);
});

test("fuzzyMatch skips spaces in the lookup (not in position continuity)", () => {
  expect(fuzzyMatch("something", "so me t")).toBe(true);
  expect(fuzzyMatch("something", "s o")).toBe(true);
});

test("fuzzyMatch treats a whitespace-only lookup as a match-everything query", () => {
  expect(fuzzyMatch("anything", "   ")).toBe(true);
  expect(fuzzyMatch("anything", " ")).toBe(true);
});

test("fuzzyMatch advances by full code points, not utf-16 units (surrogate pairs)", () => {
  // "😀" is a surrogate pair; the next lookup char must not match inside it.
  expect(fuzzyMatch("😀 smile", "😀s")).toBe(true);
  expect(fuzzyMatch("😀", "😀")).toBe(true);
});

test("matchesField applies each strategy to a single value only", () => {
  // includes: case/accent-insensitive substring within one field.
  expect(matchesField("Banana", "an", "includes")).toBe(true);
  expect(matchesField("Sómething sour", "something", "includes")).toBe(true);
  expect(matchesField("Banana", "zzz", "includes")).toBe(false);
  // A single value cannot be "across fields" — the engine never joins fields.
  expect(matchesField("AABB", "BBCC", "includes")).toBe(false);
  expect(matchesField("AABB", "BB", "includes")).toBe(true);

  // startswith: prefix only, never a mid-field substring.
  expect(matchesField("Banana", "ba", "startswith")).toBe(true);
  expect(matchesField("Banana", "na", "startswith")).toBe(false);

  // fuzzy: order-preserving subsequence inside one value.
  expect(matchesField("Banana", "bnn", "fuzzy")).toBe(true);
  expect(matchesField("AABB", "BD", "fuzzy")).toBe(false);

  // unknown modes stay includes (same default as before extraction).
  expect(matchesField("Banana", "an", "banana-mode")).toBe(true);
});

test("patternMatch is case- and accent-insensitive across the whole grille", () => {
  // liège / Liège / LIEGE / liege all match each other.
  for (const query of ["liège", "Liège", "LIEGE", "liege"]) {
    for (const value of ["liège", "Liège", "LIEGE", "liege"]) {
      expect(patternMatch(value, query)).toBe(true);
    }
  }
  // Accent folding is additive: regex structure is preserved (diacritics
  // stripped only from the query spelling and the tested value). `/i` keeps
  // it case-insensitive, but character classes still constrain (digits etc).
  expect(patternMatch("Bélgeux", "^belge")).toBe(true);
  expect(patternMatch("ABC", "^[A-Z]{3}$")).toBe(true);
  expect(patternMatch("ab3", "^[A-Z]{3}$")).toBe(false);
  // Invalid queries fail safely, never throw.
  expect(patternMatch("anything", "(")).toBe(false);
  expect(patternMatch("anything", "")).toBe(true);
});

test("matchesField routes the pattern mode through the same accent contract", () => {
  expect(matchesField("Sómething sour", "som", "pattern")).toBe(true);
  expect(matchesField("Sómething sour", "sóm", "pattern")).toBe(true);
  expect(matchesField("anything", "(", "pattern")).toBe(false);
});

test("prepared field matchers preserve accents, regex structure and repeated-call behavior", () => {
  const values = ["Liège", "LIEGE", "banana", null, "Liège"];
  for (const mode of ["includes", "startswith", "pattern"]) {
    expect(values.map(prepareFieldMatcher("liè", mode))).toEqual([true, true, false, false, true]);
  }
  expect(values.map(prepareFieldMatcher("lge", "fuzzy"))).toEqual([true, true, false, false, true]);
  expect(values.map(prepareFieldMatcher("^[A-Z]+$", "pattern"))).toEqual([true, true, true, false, true]);
  expect(values.map(prepareFieldMatcher("[", "pattern"))).toEqual([false, false, false, false, false]);
});
