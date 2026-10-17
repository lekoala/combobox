import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Creation lifecycle and restored state", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, "/test/fixtures/features.html");
    test.skip(!(await modernSupported(page)), "Modern Popover support is required");
  });

  for (const separators of [[], [";"]]) {
    test(`blur creation settling after dispose leaves restored options and detached UI untouched (${separators.length ? "tokens" : "plain"})`, async ({
      page,
    }) => {
      const state = await page.evaluate(async (separators) => {
        const source = document.getElementById("tags");
        source.options[0].setAttribute("data-filtered", "authored");
        source.options[0].setAttribute("data-active-option", "original");
        let release;
        let started;
        const pending = new Promise((resolve) => {
          release = resolve;
        });
        const ready = new Promise((resolve) => {
          started = resolve;
        });
        const combo = new Combobox(source, {
          createOnBlur: true,
          separators,
          create: async (label) => {
            started();
            await pending;
            return { value: label, label };
          },
        });
        combo.input.focus();
        combo.input.value = "New tag";
        const outside = document.createElement("button");
        document.body.append(outside);
        outside.focus();
        await ready;
        combo.dispose();
        const html = source.outerHTML;
        const changes = [];
        const observer = new MutationObserver((records) => changes.push(...records));
        observer.observe(source, { attributes: true, subtree: true, childList: true });
        observer.observe(combo.listbox, { attributes: true, subtree: true, childList: true });
        release();
        await new Promise((resolve) => setTimeout(resolve, 30));
        observer.disconnect();
        return {
          unchanged: html === source.outerHTML,
          changes: changes.length,
          values: [...source.selectedOptions].map((option) => option.value),
        };
      }, separators);
      expect(state).toEqual({ unchanged: true, changes: 0, values: ["1"] });
    });
  }

  test("dispose preserves authored markers on excluded empty options and untouched late additions", async ({
    page,
  }) => {
    const state = await page.evaluate(() => {
      const source = document.getElementById("tags");
      const empty = new Option("Empty", "");
      empty.setAttribute("data-filtered", "authored");
      empty.setAttribute("data-active-option", "original");
      source.prepend(empty);
      const combo = new Combobox(source);
      const late = empty.cloneNode(true);
      late.value = "late";
      source.append(late);
      combo.dispose();
      return [empty, late].map((option) => [
        option.getAttribute("data-filtered"),
        option.getAttribute("data-active-option"),
      ]);
    });
    expect(state).toEqual([
      ["authored", "original"],
      ["authored", "original"],
    ]);
  });

  for (const hook of ["beforefilter", "combobox:beforeload"]) {
    test(`disposing synchronously from ${hook} stops the search without loading or writing`, async ({
      page,
    }) => {
      const state = await page.evaluate(async (hook) => {
        const source = document.getElementById("tags");
        let calls = 0;
        let restored;
        const combo = new Combobox(source, {
          load: async () => {
            calls++;
            return [];
          },
        });
        const target = hook === "beforefilter" ? combo.input : source;
        target.addEventListener(
          hook,
          () => {
            combo.dispose();
            restored = source.outerHTML;
          },
          { once: true },
        );
        await combo.search("remote", { show: true });
        return { calls, restored: restored === source.outerHTML };
      }, hook);
      expect(state).toEqual({ calls: 0, restored: true });
    });
  }
});

test.describe("Pending operations and attribute restoration", () => {
  const IDENTITY_HTML = "/test/fixtures/identity.html";
  const MODERN = "Modern Popover + floating placement support is required";

  test.beforeEach(async ({ page }) => {
    await setup(page, IDENTITY_HTML);
  });

  test("a guard resolving after dispose mutates nothing", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const form = document.createElement("form");
      form.innerHTML = `<select name="choice" multiple><option value="a" selected>A</option></select>`;
      document.body.append(form);
      const select = form.querySelector("select");
      let release;
      const combo = Combobox.getOrCreateInstance(select, {
        guards: { remove: () => new Promise((resolve) => (release = resolve)) },
      });
      const pending = combo.remove("a");
      combo.dispose();
      release(true);
      const result = {
        settled: await pending,
        selected: Array.from(select.selectedOptions, (o) => o.value),
      };
      form.remove();
      return result;
    });

    expect(state.settled).toBe(false);
    expect(state.selected).toEqual(["a"]);
  });

  test("dispose restores authored filter and source attributes", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(() => {
      const form = document.createElement("form");
      form.innerHTML =
        '<select id="audit-restore" multiple aria-invalid="true"><option value="a">A</option></select><input data-filter-for="audit-restore" disabled readonly>';
      document.body.append(form);
      const select = form.querySelector("select");
      const input = form.querySelector("input");
      const combo = Combobox.getOrCreateInstance(select);
      combo.select("a");
      combo.dispose();
      const result = {
        disabled: input.disabled,
        readOnly: input.readOnly,
        ariaInvalid: select.getAttribute("aria-invalid"),
      };
      form.remove();
      return result;
    });

    expect(state.disabled).toBe(true);
    expect(state.readOnly).toBe(true);
    expect(state.ariaInvalid).toBe("true");
  });

  test("dispose restores markers authored post-init and on datalist options", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      // Select: an option added after init with authored markers keeps them.
      const form = document.createElement("form");
      form.innerHTML = `<select name="choice" multiple><option value="a">A</option></select>`;
      document.body.append(form);
      const select = form.querySelector("select");
      const combo = Combobox.getOrCreateInstance(select);
      const late = new Option("Late", "l");
      late.setAttribute("data-filtered", "keep");
      late.setAttribute("data-active-option", "keep");
      select.add(late);
      await combo.search("zzz");
      combo.dispose();
      const selectState = {
        filtered: late.getAttribute("data-filtered"),
        active: late.getAttribute("data-active-option"),
        plainFiltered: select.options[0].hasAttribute("data-filtered"),
        plainActive: select.options[0].hasAttribute("data-active-option"),
      };
      form.remove();

      // Input+datalist: authored markers on datalist options survive dispose.
      const wrap = document.createElement("div");
      wrap.innerHTML = `<input id="dl-input" list="dl"><datalist id="dl"><option value="a" data-filtered="keep" data-active-option="keep">A</option><option value="b">B</option></datalist>`;
      document.body.append(wrap);
      const input = wrap.querySelector("input");
      const dlCombo = Combobox.getOrCreateInstance(input);
      await dlCombo.search("zzz");
      dlCombo.dispose();
      const dlOptions = wrap.querySelectorAll("option");
      const datalistState = {
        filtered: dlOptions[0].getAttribute("data-filtered"),
        active: dlOptions[0].getAttribute("data-active-option"),
        plainFiltered: dlOptions[1].hasAttribute("data-filtered"),
        plainActive: dlOptions[1].hasAttribute("data-active-option"),
      };
      wrap.remove();
      return { selectState, datalistState };
    });

    expect(state.selectState).toEqual({
      filtered: "keep",
      active: "keep",
      plainFiltered: false,
      plainActive: false,
    });
    expect(state.datalistState).toEqual({
      filtered: "keep",
      active: "keep",
      plainFiltered: false,
      plainActive: false,
    });
  });
});

test.describe("Native source restoration", () => {
  const FEATURES = "/test/fixtures/sources.html";

  function init(page, id, options) {
    return page.evaluate(
      ([id, options]) => Combobox.getOrCreateInstance(document.getElementById(id), options),
      [id, options],
    );
  }

  test.beforeEach(async ({ page }) => {
    await setup(page, FEATURES);
  });

  test("input without a datalist fails clearly", async ({ page }) => {
    const message = await page.evaluate(() => {
      try {
        new Combobox(document.getElementById("nolist"));
        return null;
      } catch (error) {
        return error.message;
      }
    });
    expect(message).toContain("datalist");
  });

  test("dispose restores the select, the explicit filter input and source attributes", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "explicit");

    const before = await page.evaluate(() => {
      const select = document.getElementById("explicit");
      const input = document.getElementById("explicit-filter");
      return {
        controlMoved: input.parentElement?.classList.contains("cb-control"),
        unnamed: !input.hasAttribute("name"),
        visible: !input.hasAttribute("hidden"),
        sourceHidden: select.classList.contains("cb-source-hidden"),
        sourceAriaHidden: select.getAttribute("aria-hidden"),
      };
    });
    expect(before.controlMoved).toBe(true);
    expect(before.unnamed).toBe(true);
    expect(before.visible).toBe(true);
    expect(before.sourceHidden).toBe(true);
    expect(before.sourceAriaHidden).toBe("true");

    await page.evaluate(() => Combobox.getInstance(document.getElementById("explicit")).dispose());

    const after = await page.evaluate(() => {
      const select = document.getElementById("explicit");
      const input = document.getElementById("explicit-filter");
      return {
        backInForm: input.parentElement === document.querySelector("#source-form"),
        hiddenAgain: input.hasAttribute("hidden"),
        controlGone: select.nextElementSibling?.classList.contains("cb-control") === false,
        sourceVisible: !select.classList.contains("cb-source-hidden"),
        ariaHiddenGone: !select.hasAttribute("aria-hidden"),
        tabindexGone: !select.hasAttribute("tabindex"),
        popoverGone: document.querySelectorAll(".cb-popover").length === 0,
      };
    });
    expect(after.backInForm).toBe(true);
    expect(after.hiddenAgain).toBe(true);
    expect(after.controlGone).toBe(true);
    expect(after.sourceVisible).toBe(true);
    expect(after.ariaHiddenGone).toBe(true);
    expect(after.tabindexGone).toBe(true);
    expect(after.popoverGone).toBe(true);
  });

  test("dispose is idempotent and safe on a detached subtree", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const state = await page.evaluate(async () => {
      const source = document.getElementById("wrapped");
      const combo = Combobox.getOrCreateInstance(source, { observeSource: true });
      const holder = document.createElement("div");
      holder.append(source);
      combo.dispose();
      const second = await (async () => {
        try {
          combo.dispose();
          return "ok";
        } catch (error) {
          return error.message;
        }
      })();
      return {
        second,
        instanceGone: Combobox.getInstance(source) === null,
        controlGone: document.querySelectorAll(".cb-control").length === 0,
        popoverGone: document.querySelectorAll(".cb-popover").length === 0,
        observerGone: combo._sourceObserver === null,
        sourceRestored: !source.hasAttribute("aria-hidden"),
      };
    });
    expect(state.second).toBe("ok");
    expect(state.instanceGone).toBe(true);
    expect(state.controlGone).toBe(true);
    expect(state.popoverGone).toBe(true);
    expect(state.observerGone).toBe(true);
    expect(state.sourceRestored).toBe(true);
  });

  test("a generated filter input is removed with the wrapper on dispose", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    await init(page, "wrapped");
    expect(await page.locator("#wrapped + .cb-control .cb-input").count()).toBe(1);

    await page.evaluate(() => Combobox.getInstance(document.getElementById("wrapped")).dispose());
    await expect(page.locator("#wrapped + .cb-control .cb-input")).toHaveCount(0);
  });

  test("input+datalist receives the configured placeholder and dispose restores the native input", async ({
    page,
  }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const state = await page.evaluate(() => {
      const source = document.getElementById("city2");
      const combo = Combobox.getOrCreateInstance(source, { placeholder: "Find a city…" });
      const enhanced = source.placeholder;
      combo.dispose();
      return { enhanced, restored: source.getAttribute("placeholder") };
    });

    expect(state).toEqual({ enhanced: "Find a city…", restored: null });
  });

  test("an authored input+datalist placeholder takes precedence over configuration", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const state = await page.evaluate(() => {
      const source = document.getElementById("city2");
      source.placeholder = "Authored hint";
      const combo = Combobox.getOrCreateInstance(source, { placeholder: "Configured hint" });
      const enhanced = source.placeholder;
      combo.dispose();
      return { enhanced, restored: source.placeholder };
    });

    expect(state).toEqual({ enhanced: "Authored hint", restored: "Authored hint" });
  });
});
