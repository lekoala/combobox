import { expect, test } from "bun:test";
import { toItem } from "../../src/helpers.js";

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
