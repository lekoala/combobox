import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const ORDER_HTML = "/test/fixtures/order.html";

function control(id) {
  return `#${id} + .cb-control`;
}

test.beforeEach(async ({ page }) => {
  await setup(page, ORDER_HTML);
});

test("default source order keeps chips, move() and FormData in native selected order", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("sourceordered"));
  });

  const input = page.locator(`${control("sourceordered")} .cb-input`);
  await input.fill("Four");
  await page.locator(".cb-popover:visible .cb-option", { hasText: "Four" }).click();
  await page.waitForTimeout(40);

  const state = await page.evaluate(() => {
    const select = document.getElementById("sourceordered");
    const combo = Combobox.getInstance(select);
    return {
      chips: Array.from(document.querySelectorAll("#sourceordered + .cb-control .cb-chip")).map(
        (chip) => chip.dataset.value,
      ),
      values: combo.getSelectedValues(),
      moved: combo.move("1", 0),
      catalogue: Array.from(select.options, (o) => o.value),
      formData: new FormData(document.getElementById("source-form")).getAll("sourceordered[]"),
    };
  });

  expect(state.chips).toEqual(["1", "2", "3", "4"]);
  expect(state.values).toEqual(["1", "2", "3", "4"]);
  expect(state.moved).toBe(false);
  expect(state.catalogue).toEqual(["1", "2", "3", "4"]);
  expect(state.formData).toEqual(["1", "2", "3", "4"]);
});

test("ordered mode records the click sequence; catalogue and result order stay distinct", async ({
  page,
}) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("ordered"), {
      selectionOrder: "selected",
      sort: (a, b) => (a.value === "c" ? -1 : b.value === "c" ? 1 : 0),
    });
  });

  const input = page.locator(`${control("ordered")} .cb-input`);
  for (const label of ["Beta", "Gamma"]) {
    await input.fill(label);
    await page.locator(".cb-popover:visible .cb-option", { hasText: label }).click();
    await page.waitForTimeout(30);
  }

  const state = await page.evaluate(() => {
    const select = document.getElementById("ordered");
    const combo = Combobox.getInstance(select);
    return {
      chips: Array.from(document.querySelectorAll("#ordered + .cb-control .cb-chip")).map(
        (chip) => chip.dataset.value,
      ),
      values: combo.getSelectedValues(),
      catalogue: Array.from(select.options, (o) => o.value),
    };
  });

  expect(state.chips).toEqual(["a", "b", "c"]);
  expect(state.values).toEqual(["a", "b", "c"]);
  expect(state.catalogue).toEqual(["a", "b", "c", "d"]);
});

test("move() reorders chips and fires beforereorder/reorder; a canceled beforedefreorder pins the order", async ({
  page,
}) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  const state = await page.evaluate(() => {
    const select = document.getElementById("ordered");
    const reorders = [];
    select.addEventListener("combobox:reorder", (event) =>
      reorders.push({
        value: event.detail.value,
        from: event.detail.from,
        to: event.detail.to,
        values: event.detail.values,
      }),
    );
    const combo = Combobox.getOrCreateInstance(select, { selectionOrder: "selected" });
    combo.select("b");

    const moved = combo.move("b", 0);
    const catalogueAfterMove = Array.from(select.options, (o) => o.value);

    select.addEventListener("combobox:beforereorder", (event) => event.preventDefault());
    const canceled = combo.move("b", 1);

    return {
      moved,
      valuesAfterMove: combo.getSelectedValues(),
      catalogueAfterMove,
      reorders,
      canceled,
      valuesAfterCancel: combo.getSelectedValues(),
    };
  });

  expect(state.moved).toBe(true);
  expect(state.valuesAfterMove).toEqual(["b", "a"]);
  expect(state.catalogueAfterMove).toEqual(["a", "b", "c", "d"]);
  expect(state.reorders).toEqual([{ value: "b", from: 1, to: 0, values: ["b", "a"] }]);
  expect(state.canceled).toBe(false);
  expect(state.valuesAfterCancel).toEqual(["b", "a"]);
});

test("move() no-ops return false and emit nothing", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  const state = await page.evaluate(() => {
    const select = document.getElementById("ordered");
    const reorders = [];
    select.addEventListener("combobox:reorder", () => reorders.push(1));
    const combo = Combobox.getOrCreateInstance(select, { selectionOrder: "selected" });
    combo.select("b"); // order: a, b
    return {
      unknown: combo.move("zzz", 0),
      unselected: combo.move("d", 0),
      noopStart: combo.move("a", 0),
      noopCurrent: combo.move("b", 1),
      reorders,
    };
  });

  expect(state.unknown).toBe(false);
  expect(state.unselected).toBe(false);
  expect(state.noopStart).toBe(false);
  expect(state.noopCurrent).toBe(false);
  expect(state.reorders).toEqual([]);
});

test("Alt+Arrow and Alt+Home/End reorder a focused chip, keep focus and announce position", async ({
  page,
}) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  const state = await page.evaluate(() => {
    const select = document.getElementById("ordered");
    const reorders = [];
    select.addEventListener("combobox:reorder", (event) => reorders.push(event.detail.values.join("")));
    const combo = Combobox.getOrCreateInstance(select, { selectionOrder: "selected" });
    combo.select("b");
    combo.select("c"); // order: a, b, c

    const chip = (value) =>
      Array.from(document.querySelectorAll("#ordered + .cb-control .cb-chip")).find(
        (candidate) => candidate.dataset.value === value,
      );
    const press = (key, value) => {
      const target = chip(value);
      target.focus();
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key, altKey: true, bubbles: true, cancelable: true }),
      );
      return {
        values: combo.getSelectedValues(),
        focused: document.activeElement?.dataset?.value ?? null,
        status: document.querySelector(".cb-status")?.textContent ?? "",
      };
    };

    const results = [
      { key: "ArrowLeft", value: "c" },
      { key: "Home", value: "c" },
      { key: "End", value: "c" },
      { key: "ArrowRight", value: "a" },
    ].map(({ key, value }) => ({ key, ...press(key, value) }));

    return {
      results,
      reorders,
      catalogue: Array.from(select.options, (o) => o.value),
    };
  });

  const [left, home, end, right] = state.results;
  expect(left.values).toEqual(["a", "c", "b"]);
  expect(left.focused).toBe("c");
  expect(left.status).toBe("Gamma position 2 of 3");

  expect(home.values).toEqual(["c", "a", "b"]);
  expect(home.focused).toBe("c");
  expect(home.status).toBe("Gamma position 1 of 3");

  expect(end.values).toEqual(["a", "b", "c"]);
  expect(end.focused).toBe("c");
  expect(end.status).toBe("Gamma position 3 of 3");

  expect(right.values).toEqual(["b", "a", "c"]);
  expect(right.focused).toBe("a");
  expect(right.status).toBe("Alpha position 2 of 3");

  expect(state.reorders).toEqual(["acb", "cab", "abc", "bac"]);
  expect(state.catalogue).toEqual(["a", "b", "c", "d"]);
});

test("reorder gesture consumes only real moves and leaves source mode native", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  const state = await page.evaluate(() => {
    const ordered = document.getElementById("ordered");
    const reorders = [];
    ordered.addEventListener("combobox:reorder", () => reorders.push(1));
    const combo = Combobox.getOrCreateInstance(ordered, { selectionOrder: "selected" });
    combo.select("b"); // order: a, b

    const chip = (value) =>
      Array.from(document.querySelectorAll("#ordered + .cb-control .cb-chip")).find(
        (candidate) => candidate.dataset.value === value,
      );
    // Alt+ArrowLeft on the first chip cannot move: no reorder, focus kept.
    chip("a").focus();
    chip("a").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true, bubbles: true, cancelable: true }),
    );
    const orderedFocused = document.activeElement?.dataset?.value ?? null;

    const src = document.getElementById("sourceordered");
    const srcCombo = Combobox.getOrCreateInstance(src);
    const srcChip = Array.from(document.querySelectorAll("#sourceordered + .cb-control .cb-chip"))[0];
    srcChip.focus();
    srcChip.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true, cancelable: true }),
    );

    return {
      values: combo.getSelectedValues(),
      focused: orderedFocused,
      status: document.querySelector(".cb-status")?.textContent ?? "",
      reorders,
      srcValues: srcCombo.getSelectedValues(),
    };
  });

  expect(state.values).toEqual(["a", "b"]);
  expect(state.focused).toBe("a");
  expect(state.status).toBe("");
  expect(state.reorders).toEqual([]);
  expect(state.srcValues).toEqual(["1", "2", "3"]);
});

test("ordered FormData repeats values in explicit selection order", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  const state = await page.evaluate(() => {
    const select = document.getElementById("ordered");
    const combo = Combobox.getOrCreateInstance(select, { selectionOrder: "selected" });
    combo.select("b");
    combo.move("b", 0);
    return {
      selected: combo.getSelectedValues(),
      formData: new FormData(document.getElementById("order-form")).getAll("ordered[]"),
    };
  });

  expect(state.selected).toEqual(["b", "a"]);
  expect(state.formData).toEqual(["b", "a"]);
});

test("remove then re-add appends at the end of the selection sequence", async ({ page }) => {
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");
  const state = await page.evaluate(async () => {
    const select = document.getElementById("ordered");
    const combo = Combobox.getOrCreateInstance(select, { selectionOrder: "selected" });
    combo.select("b");
    combo.select("c"); // a, b, c
    await combo.remove("b"); // a, c
    combo.select("b"); // a, c, b
    return {
      values: combo.getSelectedValues(),
      chips: Array.from(document.querySelectorAll("#ordered + .cb-control .cb-chip")).map(
        (chip) => chip.dataset.value,
      ),
      catalogue: Array.from(select.options, (o) => o.value),
    };
  });

  expect(state.values).toEqual(["a", "c", "b"]);
  expect(state.chips).toEqual(["a", "c", "b"]);
  expect(state.catalogue).toEqual(["a", "b", "c", "d"]);
});
