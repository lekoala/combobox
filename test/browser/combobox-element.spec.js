import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

// The element specs exercise the ESM engine, so they run against the dedicated
// ESM fixture rather than the demo (which loads the dist bundle).
const ELEMENTS_HTML = "/test/fixtures/elements.html";

test("loading the engine exports never auto-registers nor leaks globals", async ({ page }) => {
  // No exposeEsm here: this test asserts the page itself stays global-free.
  await page.goto("/test/fixtures/scripts-only.html");

  const state = await page.evaluate(async () => {
    const mod = await import("/src/index.js");
    return {
      engineExport: typeof mod.Combobox,
      defineExport: typeof mod.defineCombobox,
      elementClassExport: typeof mod.ComboBoxElement,
      windowCombobox: typeof window.Combobox,
      windowDefine: typeof window.defineCombobox,
      windowElement: typeof window.ComboBoxElement,
      registered: customElements.get("combo-box"),
      registeredCustom: customElements.get("app-combobox"),
    };
  });

  expect(state.engineExport).toBe("function");
  expect(state.defineExport).toBe("function");
  expect(state.elementClassExport).toBe("function");
  expect(state.windowCombobox).toBe("undefined");
  expect(state.windowDefine).toBe("undefined");
  expect(state.windowElement).toBe("undefined");
  expect(state.registered).toBeUndefined();
  expect(state.registeredCustom).toBeUndefined();
});

test("defineCombobox registers combo-box once and is idempotent", async ({ page }) => {
  await setup(page, ELEMENTS_HTML);

  const state = await page.evaluate(() => {
    const first = defineCombobox();
    const again = defineCombobox();
    return {
      sameClass: first === again,
      registered: customElements.get("combo-box") === first,
      isBaseClass: first === window.ComboBoxElement,
    };
  });

  expect(state.sameClass).toBe(true);
  expect(state.registered).toBe(true);
  expect(state.isBaseClass).toBe(true);
});

test("a custom tag name is an app-level subclass of the exported ComboBoxElement", async ({ page }) => {
  await setup(page, ELEMENTS_HTML);

  const state = await page.evaluate(() => {
    const CustomCombo = class extends window.ComboBoxElement {};
    customElements.define("my-combobox", CustomCombo);
    const wrap = document.createElement("my-combobox");
    wrap.innerHTML = `<select><option value="1">One</option></select>`;
    document.body.append(wrap);
    return wrap.whenReady().then((combobox) => ({
      registered: customElements.get("my-combobox") === CustomCombo,
      upgraded: combobox !== null && combobox === wrap.combobox,
      isInstance: wrap instanceof window.ComboBoxElement,
    }));
  });

  expect(state.registered).toBe(true);
  expect(state.upgraded).toBe(true);
  expect(state.isInstance).toBe(true);
});

test("existing markup upgrades and attributes map to engine options", async ({ page }) => {
  await setup(page, ELEMENTS_HTML);

  const state = await page.evaluate(() => {
    const wrap = document.querySelector("#frameworks").parentElement;
    const combo = wrap.combobox;
    const viaGetInstance = Combobox.getInstance(document.querySelector("#frameworks"));
    return {
      upgraded: combo !== null && combo === viaGetInstance,
      create: combo.options.create,
      placeholder: combo.options.placeholder,
      isSelect: combo.isSelect,
      isMultiple: combo.isMultiple,
      name: document.querySelector("#frameworks").getAttribute("name"),
    };
  });

  expect(state.upgraded).toBe(true);
  expect(state.create).toBe(true);
  expect(state.placeholder).toBe("Search or create a framework…");
  expect(state.isSelect).toBe(true);
  expect(state.isMultiple).toBe(true);
  expect(state.name).toBe("frameworks[]");
});

test("custom element name + configure() wires JS-only options", async ({ page }) => {
  await setup(page, ELEMENTS_HTML);
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

  const config = await page.evaluate(() => {
    const combo = document.querySelector("#languages-widget").combobox;
    return {
      hasLoad: typeof combo.options.load === "function",
      minChars: combo.options.minChars,
      debounce: combo.options.debounce,
    };
  });
  expect(config.hasLoad).toBe(true);
  expect(config.minChars).toBe(1);
  expect(config.debounce).toBe(120);

  const filter = page.locator("#languages-widget .cb-input");
  await filter.fill("fran");
  const listboxId = await filter.getAttribute("aria-controls");
  const result = page.locator(`#${listboxId} [role="option"]`, { hasText: "Français" });
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.locator("#languages")).toHaveValue("fr");
});

test("configure() rebuilds the engine and invalidates prior references", async ({ page }) => {
  await setup(page, ELEMENTS_HTML);
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

  const state = await page.evaluate(async () => {
    const wrap = document.querySelector("#languages-widget");
    const before = wrap.combobox;
    const readyCombos = [];
    wrap.addEventListener("combobox:ready", (event) => readyCombos.push(event.detail.combobox));
    wrap.configure({ minChars: 3 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const after = wrap.combobox;
    return {
      rebuilt: before !== after,
      minChars: after.options.minChars,
      loadKept: typeof after.options.load === "function",
      currentInstance: Combobox.getInstance(document.getElementById("languages")) === after,
      readySawCurrent: readyCombos[readyCombos.length - 1] === after,
    };
  });

  expect(state.rebuilt).toBe(true);
  expect(state.minChars).toBe(3);
  expect(state.loadKept).toBe(true);
  expect(state.currentInstance).toBe(true);
  expect(state.readySawCurrent).toBe(true);
});

test("combobox:ready fires and whenReady() resolves after dynamic insertion", async ({ page }) => {
  await setup(page, ELEMENTS_HTML);

  const state = await page.evaluate(() => {
    const wrap = document.createElement("combo-box");
    wrap.innerHTML = `<select><option value="1">One</option></select>`;
    const resolved = wrap.whenReady().then((combobox) => combobox === wrap.combobox);
    const eventFired = new Promise((resolve) => {
      wrap.addEventListener("combobox:ready", (event) => resolve(event.detail.combobox === wrap.combobox));
    });
    document.body.append(wrap);
    return Promise.all([resolved, eventFired]);
  });

  expect(state).toEqual([true, true]);
});

test("dispose on removal restores the datalist liaison inside a detached wrapper", async ({ page }) => {
  await setup(page, ELEMENTS_HTML);
  test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

  const state = await page.evaluate(async () => {
    const wrap = document.createElement("combo-box");
    wrap.innerHTML =
      `<input id="dispose-city" name="dispose-city" list="dispose-cities">` +
      `<datalist id="dispose-cities"><option value="Brussels"></option></datalist>`;
    document.body.append(wrap);
    await wrap.whenReady();
    const enhanced = {
      datalistPresent: wrap.querySelector("#dispose-cities") !== null,
      listRemoved: !wrap.querySelector("#dispose-city").hasAttribute("list"),
    };
    wrap.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The wrapper subtree is detached, but dispose() must still restore the
    // input-to-datalist liaison before dropping the engine instance.
    return {
      enhanced,
      datalistRestored: wrap.querySelector("#dispose-cities") !== null,
      listRestored: wrap.querySelector("#dispose-city").getAttribute("list") === "dispose-cities",
      instanceRemoved: Combobox.getInstance(wrap.querySelector("#dispose-city")) === null,
    };
  });

  expect(state.enhanced.datalistPresent).toBe(true);
  expect(state.enhanced.listRemoved).toBe(true);
  expect(state.datalistRestored).toBe(true);
  expect(state.listRestored).toBe(true);
  expect(state.instanceRemoved).toBe(true);
});

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

test("fallback create/createFilter/guards receive the real Add input on their context", async ({ page }) => {
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
