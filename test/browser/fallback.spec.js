import { expect, test } from "@playwright/test";
import { setup } from "./helpers.js";

test("fallback creation with an empty placeholder keeps a nonempty accessible name", async ({ page }) => {
  await setup(page, "/test/fixtures/features.html");
  await page.evaluate(
    () =>
      new Combobox(document.getElementById("tags"), {
        mode: "fallback",
        create: true,
        placeholder: "",
        messages: { add: "Ajouter" },
      }),
  );
  await expect(page.locator("#tags + .cb-fallback-create input")).toHaveAccessibleName("Ajouter");
  await expect(page.locator("#tags + .cb-fallback-create input")).not.toHaveAttribute("name");
  await expect(page.locator("#tags option:checked")).toHaveAttribute("value", "1");
});

test.describe("Native selection gates", () => {
  const IDENTITY_HTML = "/test/fixtures/identity.html";

  test.beforeEach(async ({ page }) => {
    await setup(page, IDENTITY_HTML);
  });

  test("fallback select() runs beforeselect, combobox:select and maxItems", async ({ page }) => {
    const state = await page.evaluate(() => {
      const make = (html) => {
        const form = document.createElement("form");
        form.innerHTML = html;
        document.body.append(form);
        return form;
      };
      const forms = [];

      // A beforeselect veto covers additions on the fallback path too.
      const vetoForm = make(`<select multiple><option value="a">A</option></select>`);
      forms.push(vetoForm);
      const vetoed = vetoForm.querySelector("select");
      const vetoEvents = [];
      vetoed.addEventListener("combobox:beforeselect", (event) => {
        vetoEvents.push("beforeselect");
        event.preventDefault();
      });
      vetoed.addEventListener("combobox:select", () => vetoEvents.push("select"));
      const vetoCombo = Combobox.getOrCreateInstance(vetoed, { mode: "fallback" });
      const vetoResult = vetoCombo.select("a");

      // maxItems caps additions through select() as well.
      const capForm = make(
        `<select multiple><option value="a" selected>A</option><option value="b">B</option></select>`,
      );
      forms.push(capForm);
      const capped = capForm.querySelector("select");
      const cappedCombo = Combobox.getOrCreateInstance(capped, { mode: "fallback", maxItems: 1 });
      const capResult = cappedCombo.select("b");

      // The happy path emits the same events as the enhanced picker.
      const plainForm = make(`<select><option value="a">A</option><option value="b">B</option></select>`);
      forms.push(plainForm);
      const plain = plainForm.querySelector("select");
      const plainEvents = [];
      plain.addEventListener("combobox:beforeselect", () => plainEvents.push("beforeselect"));
      plain.addEventListener("combobox:select", () => plainEvents.push("select"));
      const plainCombo = Combobox.getOrCreateInstance(plain, { mode: "fallback" });
      const ok = plainCombo.select("b");

      const result = {
        vetoResult,
        vetoEvents,
        vetoSelected: vetoed.selectedOptions.length,
        capResult,
        capSelected: Array.from(capped.selectedOptions, (o) => o.value),
        ok,
        plainEvents,
        plainValue: plain.value,
      };
      for (const form of forms) form.remove();
      return result;
    });

    expect(state.vetoResult).toBe(false);
    expect(state.vetoEvents).toEqual(["beforeselect"]);
    expect(state.vetoSelected).toBe(0);
    expect(state.capResult).toBe(false);
    expect(state.capSelected).toEqual(["a"]);
    expect(state.ok).toBe(true);
    expect(state.plainEvents).toEqual(["beforeselect", "select"]);
    expect(state.plainValue).toBe("b");
  });
});

test.describe("Declarative fallback and creation parity", () => {
  // The element specs exercise the ESM engine, so they run against the dedicated
  // ESM fixture rather than the demo (which loads the dist bundle).
  const ELEMENTS_HTML = "/test/fixtures/elements.html";

  test("wrapper can be forced into native fallback", async ({ page }) => {
    await setup(page, `${ELEMENTS_HTML}?native=1`);

    const state = await page.evaluate(() => {
      const wrap = document.querySelector("#frameworks").parentElement;
      const combo = wrap.combobox;
      const select = document.getElementById("frameworks");
      return {
        mode: combo.mode,
        optionsMode: combo.options.mode,
        selectVisible: getComputedStyle(select).display !== "none",
        hasControl: wrap.querySelector(".cb-control") !== null,
        hasFallbackCreate: wrap.querySelector(".cb-fallback-create") !== null,
        popoverCount: document.querySelectorAll(".cb-popover").length,
      };
    });

    expect(state.mode).toBe("fallback");
    expect(state.optionsMode).toBe("fallback");
    expect(state.selectVisible).toBe(true);
    expect(state.hasControl).toBe(false);
    expect(state.hasFallbackCreate).toBe(true);
    expect(state.popoverCount).toBe(0);
  });

  test("fallback create runs guards.add, beforecreate and createerror like the enhanced picker", async ({
    page,
  }) => {
    await setup(page, ELEMENTS_HTML);

    const state = await page.evaluate(async () => {
      const make = () => {
        const select = document.createElement("select");
        select.multiple = true;
        select.innerHTML = `<option value="1" selected>One</option>`;
        document.body.append(select);
        return select;
      };
      const add = async (select, label) => {
        const input = select.nextElementSibling.querySelector(".cb-fallback-input");
        input.value = label;
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 30));
      };

      // guards.add false refuses silently.
      const refused = make();
      Combobox.getOrCreateInstance(refused, {
        mode: "fallback",
        create: true,
        guards: { add: () => false },
      });
      await add(refused, "plum");
      const refusedState = { hasPlum: Array.from(refused.options, (o) => o.value).includes("plum") };

      // guards.add rejection surfaces guarderror, zero unhandled rejections.
      const rejected = make();
      const guardErrors = [];
      const unhandled = [];
      window.addEventListener("unhandledrejection", (event) =>
        unhandled.push(event.reason?.message ?? String(event.reason)),
      );
      rejected.addEventListener("combobox:guarderror", (event) =>
        guardErrors.push({ guard: event.detail.guard, message: event.detail.error.message }),
      );
      Combobox.getOrCreateInstance(rejected, {
        mode: "fallback",
        create: true,
        guards: { add: async () => Promise.reject(new Error("app boom")) },
      });
      await add(rejected, "plum");
      const rejectedState = {
        guardErrors,
        unhandled,
        hasPlum: Array.from(rejected.options, (o) => o.value).includes("plum"),
      };

      // beforecreate preventDefault blocks.
      const blocked = make();
      blocked.addEventListener("combobox:beforecreate", (event) => event.preventDefault());
      Combobox.getOrCreateInstance(blocked, { mode: "fallback", create: true });
      await add(blocked, "plum");
      const blockedState = { hasPlum: Array.from(blocked.options, (o) => o.value).includes("plum") };

      // Success: option created, selected, unnamed input, native events once.
      const success = make();
      const successEvents = [];
      success.addEventListener("combobox:create", (event) =>
        successEvents.push(`create:${event.detail.item.value}`),
      );
      success.addEventListener("input", () => successEvents.push("input"));
      success.addEventListener("change", () => successEvents.push("change"));
      Combobox.getOrCreateInstance(success, { mode: "fallback", create: true });
      await add(success, "plum");
      const successState = {
        events: successEvents,
        selected: Array.from(success.selectedOptions, (o) => o.value),
        hasPlum: Array.from(success.options, (o) => o.value).includes("plum"),
        inputName: success.nextElementSibling.querySelector(".cb-fallback-input").getAttribute("name"),
      };

      // create rejection -> createerror, nothing added.
      const errored = make();
      const createErrors = [];
      errored.addEventListener("combobox:createerror", (event) =>
        createErrors.push(event.detail.error.message),
      );
      Combobox.getOrCreateInstance(errored, {
        mode: "fallback",
        create: async () => {
          throw new Error("boom");
        },
      });
      await add(errored, "plum");
      const erroredState = {
        createErrors,
        hasPlum: Array.from(errored.options, (o) => o.value).includes("plum"),
      };

      return { refusedState, rejectedState, blockedState, successState, erroredState };
    });

    expect(state.refusedState).toEqual({ hasPlum: false });
    expect(state.rejectedState).toEqual({
      guardErrors: [{ guard: "add", message: "app boom" }],
      unhandled: [],
      hasPlum: false,
    });
    expect(state.blockedState).toEqual({ hasPlum: false });
    expect(state.successState.events).toEqual(["input", "change", "create:plum"]);
    expect(state.successState.selected).toContain("plum");
    expect(state.successState.hasPlum).toBe(true);
    expect(state.successState.inputName).toBeNull();
    expect(state.erroredState).toEqual({ createErrors: ["boom"], hasPlum: false });
  });

  test("fallback create matches an existing native option by label before creating", async ({ page }) => {
    await setup(page, ELEMENTS_HTML);

    const state = await page.evaluate(async () => {
      const select = document.createElement("select");
      select.multiple = true;
      select.innerHTML = `<option value="be">Belgium</option>`;
      document.body.append(select);

      const creates = [];
      const guards = [];
      const inputEvents = [];
      select.addEventListener("combobox:create", (event) => creates.push(event.detail.item.value));
      Combobox.getOrCreateInstance(select, {
        mode: "fallback",
        create: true,
        guards: {
          add: (payload) => {
            guards.push(payload.label);
            return true;
          },
        },
      });
      select.addEventListener("input", () => inputEvents.push("input"));
      select.addEventListener("change", () => inputEvents.push("change"));

      const input = select.nextElementSibling.querySelector(".cb-fallback-input");
      input.value = "Belgium";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));

      return {
        creates,
        guards,
        inputEvents,
        selected: Array.from(select.selectedOptions, (o) => o.value),
        values: Array.from(select.options, (o) => o.value),
        inputCleared: input.value === "",
      };
    });

    // Passing the label must resolve to the existing <option value="be"> instead
    // of materializing a duplicate value="Belgium" — the same value-or-label
    // match the enhanced picker runs.
    expect(state.creates).toEqual([]);
    expect(state.guards).toEqual([]);
    expect(state.inputEvents).toEqual(["input", "change"]);
    expect(state.selected).toEqual(["be"]);
    expect(state.values).toEqual(["be"]);
    expect(state.inputCleared).toBe(true);
  });

  test("fallback existing match selects natively, clears aria-invalid and no-ops silently", async ({
    page,
  }) => {
    await setup(page, ELEMENTS_HTML);

    const state = await page.evaluate(async () => {
      const select = document.createElement("select");
      select.multiple = true;
      select.innerHTML = `<option value="be">Belgium</option>`;
      document.body.append(select);

      let creates = 0;
      let guards = 0;
      Combobox.getOrCreateInstance(select, {
        mode: "fallback",
        create: () => {
          creates++;
          return { value: "created", label: "Created" };
        },
        guards: {
          add: () => {
            guards++;
            return true;
          },
        },
      });

      const events = [];
      for (const type of ["input", "change", "combobox:select", "combobox:create"]) {
        select.addEventListener(type, () => events.push(type));
      }
      const input = select.nextElementSibling.querySelector(".cb-fallback-input");
      const add = async (label) => {
        input.value = label;
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 30));
      };

      select.setAttribute("aria-invalid", "true");
      await add("Belgium");
      const selected = {
        events: [...events],
        ariaInvalid: select.getAttribute("aria-invalid"),
        selected: Array.from(select.selectedOptions, (o) => o.value),
        inputCleared: input.value === "",
      };

      // Same already-selected match: idempotent, no value event, text consumed.
      events.length = 0;
      await add("Belgium");
      return {
        selected,
        noop: {
          events: [...events],
          ariaInvalid: select.getAttribute("aria-invalid"),
          selected: Array.from(select.selectedOptions, (o) => o.value),
          inputCleared: input.value === "",
        },
        creates,
        guards,
        options: Array.from(select.options, (o) => o.value),
      };
    });

    // Selecting an existing match goes through the shared selection commit:
    // one native event pair plus combobox:select, aria-invalid cleared, no
    // creation, no guard.
    expect(state.selected).toEqual({
      events: ["input", "change", "combobox:select"],
      ariaInvalid: null,
      selected: ["be"],
      inputCleared: true,
    });
    expect(state.noop).toEqual({
      events: [],
      ariaInvalid: null,
      selected: ["be"],
      inputCleared: true,
    });
    expect(state.creates).toBe(0);
    expect(state.guards).toBe(0);
    expect(state.options).toEqual(["be"]);
  });

  test("fallback create/createFilter/guards receive the real Add input on their context", async ({
    page,
  }) => {
    await setup(page, ELEMENTS_HTML);

    const state = await page.evaluate(async () => {
      const select = document.createElement("select");
      select.multiple = true;
      select.innerHTML = `<option value="1">One</option>`;
      document.body.append(select);

      const combo = Combobox.getOrCreateInstance(select, {
        mode: "fallback",
        create: (_label, _ctx) => {
          return { value: "placeholder", label: "placeholder" };
        },
        createFilter: () => true,
        guards: { add: () => true },
      });
      const input = select.nextElementSibling.querySelector(".cb-fallback-input");

      const observed = {};
      combo.options.create = (label, ctx) => {
        observed.create = { isInput: ctx.input instanceof HTMLInputElement, same: ctx.input === input };
        return { value: label, label };
      };
      combo.options.createFilter = (_value, ctx) => {
        observed.createFilter = { isInput: ctx.input instanceof HTMLInputElement, same: ctx.input === input };
        return true;
      };
      combo.options.guards = {
        add: (_payload, ctx) => {
          observed.guard = { isInput: ctx.input instanceof HTMLInputElement, same: ctx.input === input };
          return true;
        },
      };

      input.value = "plum";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));

      // The create callback also flags the fallback mode for applications.
      return { observed, fallbackFlag: Object.keys(observed).every((key) => observed[key] !== undefined) };
    });

    // The guards/createFilter contract promises an HTMLInputElement; the fallback
    // path must hand them the live Add control, never a null input.
    expect(state.observed.create).toEqual({ isInput: true, same: true });
    expect(state.observed.createFilter).toEqual({ isInput: true, same: true });
    expect(state.observed.guard).toEqual({ isInput: true, same: true });
  });

  test("fallback guards/createFilter receive the Add input on a refused create too", async ({ page }) => {
    await setup(page, ELEMENTS_HTML);

    const state = await page.evaluate(async () => {
      const select = document.createElement("select");
      select.multiple = true;
      document.body.append(select);
      const combo = Combobox.getOrCreateInstance(select, {
        mode: "fallback",
        create: true,
        createFilter: () => true,
        guards: { add: () => false },
      });
      const input = select.nextElementSibling.querySelector(".cb-fallback-input");

      const observed = { createFilter: null, guard: null };
      combo.options.createFilter = (_value, ctx) => {
        observed.createFilter = ctx.input === input;
        return true;
      };
      combo.options.guards = {
        add: (_payload, ctx) => {
          observed.guard = ctx.input === input;
          return false;
        },
      };

      input.value = "plum";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));

      return {
        observed,
        hasPlum: Array.from(select.options, (o) => o.value).includes("plum"),
        // A refusal leaves the typed text editable rather than clearing it.
        inputKept: input.value === "plum",
      };
    });

    expect(state.observed).toEqual({ createFilter: true, guard: true });
    expect(state.hasPlum).toBe(false);
    expect(state.inputKept).toBe(true);
  });

  test("fallback keeps disabled matches editable and selects the first available duplicate", async ({
    page,
  }) => {
    await setup(page, ELEMENTS_HTML);
    const state = await page.evaluate(async () => {
      const run = async (markup) => {
        const select = document.createElement("select");
        select.multiple = true;
        select.name = "country";
        select.innerHTML = markup;
        const form = document.createElement("form");
        form.append(select);
        document.body.append(form);
        const events = [];
        for (const type of ["input", "change", "combobox:create"]) {
          select.addEventListener(type, () => events.push(type));
        }
        const combo = new Combobox(select, { mode: "fallback", create: true });
        const input = select.nextElementSibling.querySelector("input");
        input.value = "Belgium";
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 20));
        const result = {
          text: input.value,
          selected: Array.from(select.options, (option) => option.selected),
          values: new FormData(form).getAll("country"),
          count: select.options.length,
          events,
        };
        combo.dispose();
        form.remove();
        return result;
      };
      return {
        disabled: await run('<optgroup disabled><option value="be">Belgium</option></optgroup>'),
        available: await run(
          '<option value="be" disabled>Belgium</option><option value="be">Belgium</option>',
        ),
        selected: await run(
          '<option value="be" selected>Belgium</option><option value="be">Belgium</option>',
        ),
      };
    });
    expect(state.disabled).toEqual({ text: "Belgium", selected: [false], values: [], count: 1, events: [] });
    expect(state.available).toEqual({
      text: "",
      selected: [false, true],
      values: ["be"],
      count: 2,
      events: ["input", "change"],
    });
    expect(state.selected).toEqual({
      text: "",
      selected: [true, true],
      values: ["be", "be"],
      count: 2,
      events: ["input", "change"],
    });
  });
});

test.describe("Progressive enhancement and native fallback", () => {
  const FEATURES = "/test/fixtures/features.html";

  test("auto mode selects enhanced when Popover is supported and native fallback otherwise", async ({
    page,
  }) => {
    await setup(page, FEATURES);

    const state = await page.evaluate(() => {
      const select = document.getElementById("tags");
      const combo = Combobox.getOrCreateInstance(select);
      const sibling = select.nextElementSibling;
      return {
        supported: Combobox.supported,
        mode: combo.mode,
        hasControl: sibling?.classList?.contains("cb-control") ?? false,
        popoverCount: document.querySelectorAll(".cb-popover").length,
      };
    });

    expect(state.supported === (state.mode === "enhanced")).toBe(true);
    if (state.supported) {
      expect(state.hasControl).toBe(true);
      expect(state.popoverCount).toBe(1);
    } else {
      expect(state.hasControl).toBe(false);
      expect(state.popoverCount).toBe(0);
    }
  });

  test("forced fallback keeps the native control and the unnamed creatable input", async ({ page }) => {
    await setup(page, FEATURES);

    const state = await page.evaluate(() => {
      const select = document.getElementById("tags");
      const combo = Combobox.getOrCreateInstance(select, { mode: "fallback", create: true });
      const control = select.nextElementSibling;
      return {
        mode: combo.mode,
        visible: getComputedStyle(select).display !== "none",
        popoverCount: document.querySelectorAll(".cb-popover").length,
        fallbackCreate: control?.classList.contains("cb-fallback-create") ?? false,
        unnamed: control?.querySelector("input")?.hasAttribute("name") ?? true,
      };
    });

    expect(state.mode).toBe("fallback");
    expect(state.visible).toBe(true);
    expect(state.popoverCount).toBe(0);
    expect(state.fallbackCreate).toBe(true);
    expect(state.unnamed).toBe(false);
  });
});

test.describe("Fallback Add control state", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, "/test/fixtures/identity.html");
  });

  test("a disabled select locks the Add control; refresh() mirrors later changes", async ({ page }) => {
    await page.evaluate(() => {
      const source = document.createElement("select");
      source.id = "locked";
      source.multiple = true;
      source.disabled = true;
      document.body.append(source);
      new Combobox(source, { mode: "fallback", create: true });
    });
    const input = page.locator("#locked + .cb-fallback-create input");
    const button = page.locator("#locked + .cb-fallback-create button");
    await expect(input).toBeDisabled();
    await expect(button).toBeDisabled();

    const state = await page.evaluate(async () => {
      const source = document.getElementById("locked");
      const combo = Combobox.getInstance(source);
      const control = source.nextElementSibling;
      // A stale enabled control is still refused by the interaction check.
      control.querySelector("input").disabled = false;
      control.querySelector("input").value = "new";
      control.querySelector("button").disabled = false;
      control.querySelector("button").click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const blocked = source.options.length;
      source.disabled = false;
      combo.refresh();
      return { blocked, enabled: !control.querySelector("input").disabled };
    });
    expect(state).toEqual({ blocked: 0, enabled: true });

    await input.fill("new");
    await button.click();
    await expect(page.locator("#locked option:checked")).toHaveAttribute("value", "new");
  });

  test("a repeated Add while create() is pending creates one option", async ({ page }) => {
    const state = await page.evaluate(async () => {
      const source = document.createElement("select");
      source.multiple = true;
      document.body.append(source);
      const finishes = [];
      const combo = new Combobox(source, {
        mode: "fallback",
        create: (label) => new Promise((resolve) => finishes.push(() => resolve({ value: label, label }))),
      });
      combo.fallbackControl.querySelector("input").value = "new";
      combo.fallbackControl.querySelector("button").click();
      combo.fallbackControl.querySelector("button").click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const calls = finishes.length;
      for (const finish of finishes) finish();
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { calls, values: [...source.selectedOptions].map((option) => option.value) };
    });
    expect(state).toEqual({ calls: 1, values: ["new"] });
  });

  test("remove and clear guards receive the fallback Add input", async ({ page }) => {
    const state = await page.evaluate(async () => {
      const source = document.createElement("select");
      source.multiple = true;
      source.add(new Option("A", "a", true, true));
      source.add(new Option("B", "b", true, true));
      document.body.append(source);
      const inputs = [];
      const combo = new Combobox(source, {
        mode: "fallback",
        create: true,
        guards: {
          remove: (_payload, context) => inputs.push(context.input),
          clear: (_payload, context) => inputs.push(context.input),
        },
      });
      await combo.remove("a");
      await combo.clear();
      const input = combo.fallbackControl.querySelector("input");
      return inputs.map((candidate) => candidate === input);
    });
    expect(state).toEqual([true, true]);
  });

  test("guards receive null when native fallback has no interaction input", async ({ page }) => {
    const state = await page.evaluate(async () => {
      const source = document.createElement("select");
      source.multiple = true;
      source.add(new Option("A", "a", true, true));
      source.add(new Option("B", "b", true, true));
      document.body.append(source);
      const inputs = [];
      const combo = new Combobox(source, {
        mode: "fallback",
        guards: {
          remove: (_payload, context) => inputs.push(context.input),
          clear: (_payload, context) => inputs.push(context.input),
        },
      });
      await combo.remove("a");
      await combo.clear();
      return inputs;
    });
    expect(state).toEqual([null, null]);
  });
});
