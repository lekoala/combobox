import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Native value events", () => {
  const FEATURES = "/test/fixtures/features.html";
  const IDENTITY = "/test/fixtures/identity.html";
  const MODERN = "Modern Popover + floating placement support is required";

  test("single reselect of the exact current option emits no native events", async ({ page }) => {
    await setup(page, FEATURES);
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(() => {
      const select = document.getElementById("capped");
      const events = [];
      select.addEventListener("input", () => events.push("input"));
      select.addEventListener("change", () => events.push("change"));
      const combo = Combobox.getOrCreateInstance(select);
      const first = combo.select(select.options[1]);
      const afterFirst = [...events];
      const again = combo.select(select.options[1]);
      const afterReselect = [...events];
      const comboboxEvents = [];
      select.addEventListener("combobox:select", () => comboboxEvents.push("select"));
      const bare = combo.select(select.value);
      return {
        first,
        afterFirst,
        again,
        afterReselect,
        bare,
        comboboxEvents,
        value: select.value,
      };
    });
    expect(state.first).toBe(true);
    expect(state.afterFirst).toEqual(["input", "change"]);
    expect(state.again).toBe(false);
    expect(state.afterReselect).toEqual(["input", "change"]);
    expect(state.bare).toBe(false);
    expect(state.comboboxEvents).toEqual([]);
    expect(state.value).toBe("1");
  });

  test("no-op remove() of an unselected value fires nothing", async ({ page }) => {
    await setup(page, IDENTITY);
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const select = document.getElementById("sequenced");
      const events = [];
      select.addEventListener("input", () => events.push("input"));
      select.addEventListener("change", () => events.push("change"));
      const combo = Combobox.getOrCreateInstance(select);
      const result = await combo.remove("2");
      return {
        result,
        events,
        selected: Array.from(select.selectedOptions, (o) => o.value),
      };
    });
    expect(state.result).toBe(false);
    expect(state.events).toEqual([]);
    expect(state.selected).toEqual([]);
  });

  test("clear() on an already-empty combobox fires nothing", async ({ page }) => {
    await setup(page, IDENTITY);
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const select = document.getElementById("sequenced");
      const events = [];
      select.addEventListener("input", () => events.push("input"));
      select.addEventListener("change", () => events.push("change"));
      const combo = Combobox.getOrCreateInstance(select);
      const result = await combo.clear();
      return { result, events };
    });
    expect(state.result).toBe(false);
    expect(state.events).toEqual([]);
  });

  test("programmatic select/remove/clear each emit exactly one input then one change", async ({ page }) => {
    await setup(page, FEATURES);
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const select = document.getElementById("tags");
      const combo = Combobox.getOrCreateInstance(select);
      const record = () => {
        const events = [];
        const onInput = () => events.push("input");
        const onChange = () => events.push("change");
        select.addEventListener("input", onInput);
        select.addEventListener("change", onChange);
        return () => {
          select.removeEventListener("input", onInput);
          select.removeEventListener("change", onChange);
          return [...events];
        };
      };

      const option = select.querySelector('option[value="2"]');

      const selectRecord = record();
      combo.select(option);
      const selectEvents = selectRecord();

      const removeRecord = record();
      await combo.remove(option);
      const removeEvents = removeRecord();

      const clearRecord = record();
      await combo.clear();
      const clearEvents = clearRecord();

      return { selectEvents, removeEvents, clearEvents };
    });
    expect(state.selectEvents).toEqual(["input", "change"]);
    expect(state.removeEvents).toEqual(["input", "change"]);
    expect(state.clearEvents).toEqual(["input", "change"]);
  });

  test.describe("single-select clear semantics", () => {
    test("clear() on a single select: measured native state, with and without an empty option", async ({
      page,
    }) => {
      await setup(page, FEATURES);
      test.skip(!(await modernSupported(page)), MODERN);
      const state = await page.evaluate(async () => {
        const make = (html) => {
          const form = document.createElement("form");
          const select = document.createElement("select");
          select.name = "s";
          select.innerHTML = html;
          form.append(select);
          document.body.append(form);
          return { form, select };
        };
        const withEmpty = make(
          `<option value="">Choose</option><option value="1">One</option><option value="2">Two</option>`,
        );
        const noEmpty = make(`<option value="a">A</option><option value="b">B</option>`);

        const comboA = Combobox.getOrCreateInstance(withEmpty.select);
        const comboB = Combobox.getOrCreateInstance(noEmpty.select);
        comboA.select("1");
        comboB.select("b");

        const read = (form, select) => ({
          value: select.value,
          index: select.selectedIndex,
          selectedCount: select.selectedOptions.length,
          label: select.nextElementSibling?.querySelector(".cb-input")?.value ?? null,
          formData: new FormData(form).get("s") ?? null,
        });

        const beforeA = read(withEmpty.form, withEmpty.select);
        const beforeB = read(noEmpty.form, noEmpty.select);
        const resultA = await comboA.clear();
        const resultB = await comboB.clear();
        return {
          resultA,
          resultB,
          withEmpty: { before: beforeA, after: read(withEmpty.form, withEmpty.select) },
          noEmpty: { before: beforeB, after: read(noEmpty.form, noEmpty.select) },
        };
      });
      expect(state.resultA).toBe(true);
      expect(state.resultB).toBe(true);
      // Measured contract (2026-09): after clear() the browser collapses a single
      // select to its first option — the blank placeholder stays blank, but a
      // select without a value="" placeholder re-selects its first real option,
      // so clear() is value-preserving there (b -> a). selectedIndex is never -1.
      expect(state.withEmpty.after).toEqual({
        value: "",
        index: 0,
        selectedCount: 1,
        label: "",
        formData: "",
      });
      expect(state.noEmpty.after).toEqual({
        value: "a",
        index: 0,
        selectedCount: 1,
        label: "A",
        formData: "a",
      });
    });
  });
});

test.describe("Cancellable value events", () => {
  const FEATURES = "/test/fixtures/features.html";

  test.beforeEach(async ({ page }) => {
    await setup(page, FEATURES);
  });

  test("combobox:beforeremove cancel keeps the chip and skips combobox:remove", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    const state = await page.evaluate(async () => {
      const select = document.getElementById("tags");
      const events = [];
      select.addEventListener("combobox:beforeremove", (event) => event.preventDefault());
      select.addEventListener("combobox:remove", () => events.push("remove"));
      select.addEventListener("input", () => events.push("input"));
      select.addEventListener("change", () => events.push("change"));
      const combo = Combobox.getOrCreateInstance(select);
      const result = await combo.remove("1");
      return {
        result,
        events,
        selected: Array.from(select.selectedOptions, (o) => o.value),
        chips: Array.from(document.querySelectorAll("#tags + .cb-control .cb-chip")).map((chip) =>
          chip.getAttribute("data-value"),
        ),
      };
    });
    expect(state.result).toBe(false);
    expect(state.events).toEqual([]);
    expect(state.selected).toEqual(["1"]);
    expect(state.chips).toEqual(["1"]);
  });

  test("combobox:beforeclear cancel keeps the selection and skips combobox:clear", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    const state = await page.evaluate(async () => {
      const select = document.getElementById("tags");
      const events = [];
      select.addEventListener("combobox:beforeclear", (event) => event.preventDefault());
      select.addEventListener("combobox:clear", () => events.push("clear"));
      select.addEventListener("input", () => events.push("input"));
      select.addEventListener("change", () => events.push("change"));
      const combo = Combobox.getOrCreateInstance(select);
      const result = await combo.clear();
      return {
        result,
        events,
        selected: Array.from(select.selectedOptions, (o) => o.value),
      };
    });
    expect(state.result).toBe(false);
    expect(state.events).toEqual([]);
    expect(state.selected).toEqual(["1"]);
  });
});

test.describe("Disposal during native value events", () => {
  const MODERN = "Modern Popover + floating placement support is required";

  test("disposing from a native change handler suppresses combobox:select on every source mode", async ({
    page,
  }) => {
    await setup(page, "/test/fixtures/identity.html");
    test.skip(!(await modernSupported(page)), MODERN);

    const state = await page.evaluate(() => {
      const run = (source, options) => {
        const events = [];
        source.addEventListener("input", () => events.push("input"));
        source.addEventListener("change", () => events.push("change"));
        source.addEventListener("combobox:select", () => events.push("select"));
        const combo = new Combobox(source, options);
        source.addEventListener(
          "change",
          () => {
            combo.dispose();
          },
          { once: true },
        );
        const result = combo.select("b");
        return {
          result,
          events,
          disposed: Combobox.getInstance(source) === null,
          selected: source.value,
          generatedControlRemoved: !source.nextElementSibling?.classList.contains("cb-control"),
        };
      };

      const select = document.createElement("select");
      select.innerHTML = `<option value="a" selected>A</option><option value="b">B</option>`;
      document.body.append(select);
      const enhanced = run(select);

      const fallbackSelect = document.createElement("select");
      fallbackSelect.innerHTML = `<option value="a" selected>A</option><option value="b">B</option>`;
      document.body.append(fallbackSelect);
      const fallback = run(fallbackSelect, { mode: "fallback" });

      const input = document.createElement("input");
      input.id = "dl-input";
      input.setAttribute("list", "dl");
      const datalist = document.createElement("datalist");
      datalist.id = "dl";
      datalist.innerHTML = '<option value="a">A</option><option value="b">B</option>';
      document.body.append(input, datalist);
      const text = run(input);

      return { enhanced, fallback, text };
    });

    for (const scenario of [state.enhanced, state.fallback, state.text]) {
      // The native commit happened (and reported success), then the listener
      // disposed before the engine's own event could fire.
      expect(scenario).toEqual({
        result: true,
        events: ["input", "change"],
        disposed: true,
        selected: "b",
        generatedControlRemoved: true,
      });
    }
  });

  test("disposing from a native change handler during creation suppresses combobox:create", async ({
    page,
  }) => {
    await setup(page, "/test/fixtures/identity.html");
    test.skip(!(await modernSupported(page)), MODERN);

    const state = await page.evaluate(async () => {
      const tick = () => new Promise((resolve) => setTimeout(resolve, 30));

      const runEnhanced = async () => {
        const select = document.createElement("select");
        select.multiple = true;
        select.innerHTML = `<option value="a" selected>A</option>`;
        document.body.append(select);
        const events = [];
        select.addEventListener("input", () => events.push("input"));
        select.addEventListener("change", () => events.push("change"));
        select.addEventListener("combobox:create", () => events.push("create"));
        select.addEventListener("combobox:createerror", () => events.push("createerror"));
        const combo = new Combobox(select, { create: true });
        select.addEventListener("change", () => combo.dispose(), { once: true });
        const input = combo.input;
        input.focus();
        input.value = "plum";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        await tick();
        return {
          events,
          disposed: Combobox.getInstance(select) === null,
          created: Array.from(select.options, (option) => option.value),
          selected: Array.from(select.selectedOptions, (option) => option.value),
        };
      };

      const runFallback = async () => {
        const select = document.createElement("select");
        select.multiple = true;
        select.innerHTML = `<option value="a" selected>A</option>`;
        document.body.append(select);
        const events = [];
        select.addEventListener("input", () => events.push("input"));
        select.addEventListener("change", () => events.push("change"));
        select.addEventListener("combobox:create", () => events.push("create"));
        const combo = new Combobox(select, { mode: "fallback", create: true });
        select.addEventListener("change", () => combo.dispose(), { once: true });
        const input = select.nextElementSibling.querySelector("input");
        input.value = "plum";
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        await tick();
        return {
          events,
          disposed: Combobox.getInstance(select) === null,
          created: Array.from(select.options, (option) => option.value),
          selected: Array.from(select.selectedOptions, (option) => option.value),
        };
      };

      return { enhanced: await runEnhanced(), fallback: await runFallback() };
    });

    for (const scenario of [state.enhanced, state.fallback]) {
      expect(scenario).toEqual({
        events: ["input", "change"],
        disposed: true,
        created: ["a", "plum"],
        selected: ["a", "plum"],
      });
    }
  });
  test("disposing from a native change handler suppresses remove, clear and reorder events", async ({
    page,
  }) => {
    await setup(page, "/test/fixtures/identity.html");
    test.skip(!(await modernSupported(page)), MODERN);

    const state = await page.evaluate(async () => {
      const make = (values, options = {}) => {
        const select = document.createElement("select");
        select.multiple = true;
        for (const value of values) select.add(new Option(value.toUpperCase(), value, true, true));
        document.body.append(select);
        return new Combobox(select, options);
      };
      const disposer = (select, combo, events, name) => {
        select.addEventListener(name, () => events.push(name));
        select.addEventListener("change", () => combo.dispose(), { once: true });
      };

      const removed = make(["a"]);
      const removeEvents = [];
      disposer(removed.source, removed, removeEvents, "combobox:remove");
      const removeResult = await removed.remove("a");

      const cleared = make(["a", "b"]);
      const clearEvents = [];
      disposer(cleared.source, cleared, clearEvents, "combobox:clear");
      const clearResult = await cleared.clear();

      const moved = make(["a", "b"], { selectionOrder: "selected" });
      const reorderEvents = [];
      disposer(moved.source, moved, reorderEvents, "combobox:reorder");
      const moveResult = moved.move(moved.source.options[1], 0);

      return {
        removed: {
          result: removeResult,
          events: removeEvents,
          disposed: Combobox.getInstance(removed.source) === null,
        },
        cleared: {
          result: clearResult,
          events: clearEvents,
          disposed: Combobox.getInstance(cleared.source) === null,
        },
        moved: {
          result: moveResult,
          events: reorderEvents,
          disposed: Combobox.getInstance(moved.source) === null,
        },
      };
    });

    // The native mutation and FormData change happened before dispose; only
    // the engine's own lifecycle event is suppressed.
    expect(state.removed).toEqual({ result: true, events: [], disposed: true });
    expect(state.cleared).toEqual({ result: true, events: [], disposed: true });
    expect(state.moved).toEqual({ result: true, events: [], disposed: true });
  });
});

test.describe("Concurrent removals", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, "/test/fixtures/identity.html");
  });

  test("two remove() calls for one selection emit a single input/change", async ({ page }) => {
    const state = await page.evaluate(async () => {
      const source = document.createElement("select");
      source.multiple = true;
      source.add(new Option("A", "a", true, true));
      document.body.append(source);
      const events = [];
      source.addEventListener("input", () => events.push("input"));
      source.addEventListener("change", () => events.push("change"));
      const combo = new Combobox(source);
      const results = await Promise.all([combo.remove("a"), combo.remove(source.options[0])]);
      return { results, events, selected: source.selectedOptions.length };
    });
    expect(state).toEqual({ results: [true, false], events: ["input", "change"], selected: 0 });
  });
});
