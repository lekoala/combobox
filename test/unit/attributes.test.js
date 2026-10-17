import { expect, test } from "bun:test";
import { booleanAttribute, parseInteger, parseList } from "../../src/helpers.js";

test("parseList splits on commas, trims and drops empties", () => {
  expect(parseList("label, email, ")).toEqual(["label", "email"]);
  expect(parseList("name,email,company")).toEqual(["name", "email", "company"]);
  expect(parseList("")).toEqual([]);
  expect(parseList(null)).toEqual([]);
  expect(parseList("  ,  ,  ")).toEqual([]);
});

test("booleanAttribute returns undefined when absent and honors =false", () => {
  // Element-like stub keeps the pure helper test DOM-free.
  const make = (attrs) => ({
    hasAttribute: (name) => Object.hasOwn(attrs, name),
    getAttribute: (name) => (Object.hasOwn(attrs, name) ? attrs[name] : null),
  });

  expect(booleanAttribute(make({}), "create")).toBeUndefined();
  expect(booleanAttribute(make({ create: "" }), "create")).toBe(true);
  expect(booleanAttribute(make({ create: "true" }), "create")).toBe(true);
  expect(booleanAttribute(make({ create: "false" }), "create")).toBe(false);
  expect(booleanAttribute(make({ create: "0" }), "create")).toBe(true);
});

test("parseInteger accepts integers and yields undefined for anything else", () => {
  expect(parseInteger("5")).toBe(5);
  expect(parseInteger("0")).toBe(0);
  expect(parseInteger(" 3 ")).toBe(3);
  expect(parseInteger("")).toBe(0);
  expect(parseInteger("banana")).toBeUndefined();
  expect(parseInteger("2.5")).toBeUndefined();
  expect(parseInteger("3e-1")).toBeUndefined();
  expect(parseInteger(null)).toBeUndefined();
});
