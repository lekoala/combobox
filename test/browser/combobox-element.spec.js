import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Element registration and lifecycle", () => {
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
});

test.describe("Recovery after failed upgrade", () => {
  const IDENTITY_HTML = "/test/fixtures/identity.html";
  const MODERN = "Modern Popover + floating placement support is required";

  test.beforeEach(async ({ page }) => {
    await setup(page, IDENTITY_HTML);
  });

  test("upgrade() after a construction failure does not reuse the disposed instance", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(() => {
      const host = document.createElement("combo-box");
      const input = document.createElement("input");
      input.id = "upgrade-stale";
      input.setAttribute("list", "upgrade-stale-list");
      host.append(input);

      // First upgrade: the datalist id does not resolve, so the constructor throws.
      let threw = null;
      try {
        host.upgrade();
      } catch (error) {
        threw = error.message;
      }
      const stale = host.combobox;

      const datalist = document.createElement("datalist");
      datalist.id = "upgrade-stale-list";
      datalist.innerHTML = '<option value="a">A</option>';
      document.body.append(datalist);

      const second = host.upgrade();
      const result = {
        threw,
        staleIsNull: stale === null,
        secondIsEngine: second instanceof Combobox,
        registered: Combobox.getInstance(input) === second,
        engineMatches: host.combobox === second,
      };
      host.dispose();
      datalist.remove();
      return result;
    });

    expect(state.threw).toContain("No datalist found");
    expect(state.staleIsNull).toBe(true);
    expect(state.secondIsEngine).toBe(true);
    expect(state.registered).toBe(true);
    expect(state.engineMatches).toBe(true);
  });
});
