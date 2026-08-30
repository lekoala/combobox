import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

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

test("defineCombobox registers default and custom names and is idempotent", async ({ page }) => {
  await setup(page, "/");

  const state = await page.evaluate(() => {
    const defaultClass = defineCombobox("combo-box");
    const again = defineCombobox("combo-box");
    const customClass = defineCombobox("app-combobox");
    return {
      sameClass: defaultClass === again,
      registeredDefault: customElements.get("combo-box") === defaultClass,
      registeredCustom: customElements.get("app-combobox") === customClass,
    };
  });

  expect(state.sameClass).toBe(true);
  expect(state.registeredDefault).toBe(true);
  expect(state.registeredCustom).toBe(true);
});

test("existing markup upgrades and attributes map to engine options", async ({ page }) => {
  await setup(page, "/");

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
  await setup(page, "/");
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");

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

test("combobox:ready fires and whenReady() resolves after dynamic insertion", async ({ page }) => {
  await setup(page, "/");

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

test("dispose on removal restores the detached datalist source", async ({ page }) => {
  await setup(page, "/");
  test.skip(!(await modernSupported(page)), "Modern Popover + Anchor support is required");

  const state = await page.evaluate(async () => {
    const wrap = document.createElement("combo-box");
    wrap.innerHTML =
      `<input id="dispose-city" name="dispose-city" list="dispose-cities">` +
      `<datalist id="dispose-cities"><option value="Brussels"></option></datalist>`;
    document.body.append(wrap);
    await wrap.whenReady();
    const enhanced = {
      datalistDetached: wrap.querySelector("#dispose-cities") === null,
      listRemoved: !wrap.querySelector("#dispose-city").hasAttribute("list"),
    };
    wrap.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The wrapper subtree is detached, but dispose() must have restored the
    // datalist linkage inside it before dropping the engine instance.
    return {
      enhanced,
      datalistRestored: wrap.querySelector("#dispose-cities") !== null,
      listRestored: wrap.querySelector("#dispose-city").getAttribute("list") === "dispose-cities",
      instanceRemoved: Combobox.getInstance(wrap.querySelector("#dispose-city")) === null,
    };
  });

  expect(state.enhanced.datalistDetached).toBe(true);
  expect(state.enhanced.listRemoved).toBe(true);
  expect(state.datalistRestored).toBe(true);
  expect(state.listRestored).toBe(true);
  expect(state.instanceRemoved).toBe(true);
});

test("wrapper can be forced into native fallback", async ({ page }) => {
  await setup(page, "/?native=1");

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
