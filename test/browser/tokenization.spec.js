import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Empty separator segments", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, "/test/fixtures/features.html");
    test.skip(!(await modernSupported(page)), "Modern Popover support is required");
  });

  for (const refusal of ["maxItems", "guard", "veto", "none"]) {
    test(`empty segments preserve exact remaining text on ${refusal}`, async ({ page }) => {
      const state = await page.evaluate(async (refusal) => {
        const source = document.getElementById("tags");
        for (const option of source.options) option.selected = false;
        if (refusal === "veto")
          source.addEventListener("combobox:beforeselect", (event) => {
            if (event.detail.item.value === "beta") event.preventDefault();
          });
        const combo = new Combobox(source, {
          create: true,
          separators: [","],
          maxItems: refusal === "maxItems" || refusal === "none" ? 1 : 0,
          guards: { add: ({ label }) => refusal !== "guard" || label !== "beta" },
        });
        combo.input.value = refusal === "none" ? ",,alpha,,," : ",,alpha,,beta,";
        combo.input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
        return {
          input: combo.input.value,
          values: [...source.selectedOptions].map((option) => option.value),
          beta: [...source.options].some((option) => option.value === "beta"),
        };
      }, refusal);
      expect(state).toEqual({ input: refusal === "none" ? "" : "beta,", values: ["alpha"], beta: false });
    });
  }
});

test.describe("Custom tokens and queued commits", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, "/test/fixtures/features.html");
    test.skip(!(await modernSupported(page)), "Modern Popover support is required");
  });

  for (const refusal of ["guard", "maxItems"]) {
    test(`a transforming custom tokenizer retains original input on partial ${refusal} refusal`, async ({
      page,
    }) => {
      const state = await page.evaluate(async (refusal) => {
        const source = document.createElement("select");
        source.multiple = true;
        document.body.append(source);
        const combo = new Combobox(source, {
          create: true,
          separators: [";"],
          maxItems: refusal === "maxItems" ? 1 : 0,
          guards: { add: ({ label }) => label !== "beta" },
          tokenize: () => ({ tokens: ["alpha", "beta"], rest: "draft" }),
        });
        const original = '"ALPHA"; "BETA"; draft';
        combo.input.value = original;
        combo.input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 30));
        return {
          text: combo.input.value,
          original,
          values: [...source.selectedOptions].map((option) => option.value),
          count: source.options.length,
        };
      }, refusal);
      expect(state.text).toBe(state.original);
      expect(state.values).toEqual(["alpha"]);
      expect(state.count).toBe(1);
    });
  }

  for (const action of ["Enter", "blur"]) {
    test(`custom tokenizer rest survives ${action} finalization`, async ({ page }) => {
      const state = await page.evaluate(async (action) => {
        const source = document.createElement("select");
        source.multiple = true;
        document.body.append(source);
        const combo = new Combobox(source, {
          create: true,
          createOnBlur: true,
          separators: [";"],
          tokenize: () => ({ tokens: ["alpha"], rest: "unfinished" }),
        });
        combo.input.focus();
        combo.input.value = '"ALPHA"; unfinished';
        combo.show();
        if (action === "Enter")
          combo.input.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
          );
        else {
          const outside = document.createElement("button");
          document.body.append(outside);
          outside.focus();
        }
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { text: combo.input.value, values: [...source.selectedOptions].map((option) => option.value) };
      }, action);
      expect(state).toEqual({ text: "unfinished", values: ["alpha"] });
    });
  }

  test("queued Enter uses the input snapshot for its pre-resolved tokens and preserves refused tail", async ({
    page,
  }) => {
    const state = await page.evaluate(async () => {
      const source = document.createElement("select");
      source.multiple = true;
      document.body.append(source);
      let release;
      let started;
      const pending = new Promise((resolve) => {
        release = resolve;
      });
      const ready = new Promise((resolve) => {
        started = resolve;
      });
      const combo = new Combobox(source, {
        separators: [";"],
        guards: { add: ({ label }) => label !== "blocked" },
        create: async (label) => {
          if (label === "first") {
            started();
            await pending;
          }
          return { value: label, label };
        },
      });
      combo.input.value = "first;";
      combo.input.dispatchEvent(new Event("input", { bubbles: true }));
      await ready;
      combo.input.value = "second;blocked;tail";
      combo.show();
      combo.input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
      release();
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        text: combo.input.value,
        values: [...source.selectedOptions].map((option) => option.value),
        count: source.options.length,
      };
    });
    expect(state).toEqual({ text: "blocked;tail", values: ["first", "second"], count: 2 });
  });
});

test.describe("Separator and custom tokenizer input", () => {
  const FEATURES = "/test/fixtures/features.html";

  function control(id) {
    return `#${id} + .cb-control .cb-input`;
  }

  test.beforeEach(async ({ page }) => {
    await setup(page, FEATURES);
  });

  test("separator input consumes tokens and keeps the incomplete token", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      Combobox.getOrCreateInstance(document.getElementById("tags"), {
        create: true,
        separators: [","],
      });
    });

    const input = page.locator(control("tags"));
    await input.fill("nutmeg,cinna");
    await page.waitForTimeout(60);

    const state = await page.evaluate(() => ({
      selected: Array.from(document.getElementById("tags").selectedOptions, (o) => o.value),
      input: document.getElementById("tags").nextElementSibling.querySelector(".cb-input").value,
      options: Array.from(document.getElementById("tags").options, (o) => o.value),
    }));
    expect(state.selected).toContain("nutmeg");
    expect(state.input).toBe("cinna");
    expect(state.options).toContain("nutmeg");
  });

  test("separator paste is sequential and respects maxItems between tokens", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      Combobox.getOrCreateInstance(document.getElementById("overlimit"), {
        create: true,
        maxItems: 4,
        separators: [","],
      });
    });

    const input = page.locator(control("overlimit"));
    await input.fill("x,y");
    await page.waitForTimeout(80);

    const state = await page.evaluate(() => ({
      selected: Array.from(document.getElementById("overlimit").selectedOptions, (o) => o.value),
      input: document.getElementById("overlimit").nextElementSibling.querySelector(".cb-input").value,
      options: Array.from(document.getElementById("overlimit").options, (o) => o.value),
    }));
    expect(state.selected).toContain("x");
    expect(state.selected).not.toContain("y");
    expect(state.input).toBe("y");
    expect(state.options).not.toContain("y");
  });

  test("separator paste preserves explicit selection order", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      Combobox.getOrCreateInstance(document.getElementById("tags"), {
        create: true,
        selectionOrder: "selected",
        separators: [","],
      });
    });

    const input = page.locator(control("tags"));
    await input.fill("zap,zip,");
    await page.waitForTimeout(80);

    const order = await page.evaluate(() =>
      Combobox.getInstance(document.getElementById("tags")).getSelectedValues(),
    );
    expect(order).toEqual(["1", "zap", "zip"]);
  });

  test("separator tokenize custom seam is honored", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      Combobox.getOrCreateInstance(document.getElementById("tags"), {
        create: true,
        separators: [","],
        tokenize: (value) => ({ tokens: value.split("+").filter(Boolean), rest: "" }),
      });
    });

    const input = page.locator(control("tags"));
    await input.fill("alpha+beta");
    await page.waitForTimeout(80);

    const state = await page.evaluate(() => ({
      selected: Array.from(document.getElementById("tags").selectedOptions, (o) => o.value),
    }));
    expect(state.selected).toContain("alpha");
    expect(state.selected).toContain("beta");
  });

  test("custom tokenize keeps the declared rest in the input", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    await page.evaluate(() => {
      Combobox.getOrCreateInstance(document.getElementById("tags"), {
        create: true,
        separators: [","],
        tokenize: (value) => {
          const parts = value.split("+");
          return { tokens: parts.slice(0, 1), rest: parts.slice(1).join("+") };
        },
      });
    });

    const input = page.locator(control("tags"));
    await input.fill("alpha+beta");
    await page.waitForTimeout(80);

    const state = await page.evaluate(() => ({
      selected: Array.from(document.getElementById("tags").selectedOptions, (o) => o.value),
      inputValue: document.querySelector("#tags + .cb-control .cb-input").value,
    }));
    expect(state.selected).toContain("alpha");
    expect(state.selected).not.toContain("beta");
    expect(state.inputValue).toBe("beta");
  });

  test("Enter resolves a custom tokenizer exactly once before committing", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");

    const state = await page.evaluate(async () => {
      let calls = 0;
      const select = document.getElementById("tags");
      const combo = Combobox.getOrCreateInstance(select, {
        create: true,
        separators: [","],
        tokenize: (value) => {
          calls++;
          return { tokens: [value], rest: "" };
        },
      });
      combo.input.value = "alpha";
      await combo.search("alpha", { show: true });
      combo.input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
      await new Promise((resolve) => setTimeout(resolve, 40));
      return {
        calls,
        selected: Array.from(select.selectedOptions, (option) => option.value),
      };
    });

    expect(state.calls).toBe(1);
    expect(state.selected).toContain("alpha");
  });

  test("separator paste keeps the remaining term when a middle token is refused", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    const state = await page.evaluate(async () => {
      const select = document.getElementById("tags");
      const combo = Combobox.getOrCreateInstance(select, {
        create: true,
        separators: [","],
        createFilter: (value) => value !== "REFUSED",
      });
      const input = combo.input;
      input.focus();
      input.value = "a,REFUSED,b";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 80));
      return {
        selected: Array.from(select.selectedOptions, (o) => o.value),
        options: Array.from(select.options, (o) => o.value),
        inputValue: input.value,
      };
    });
    // "a" is created; the refused middle token leaves the trailing term intact
    // and "b" is never auto-created.
    expect(state.selected).toContain("a");
    expect(state.selected).not.toContain("b");
    expect(state.options).not.toContain("b");
    expect(state.inputValue).toContain("REFUSED");
    expect(state.inputValue).toContain("b");
  });

  test("a duplicate token is created or selected exactly once", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    const state = await page.evaluate(async () => {
      const select = document.getElementById("tags");
      const combo = Combobox.getOrCreateInstance(select, { create: true, separators: [","] });
      const input = combo.input;
      input.focus();
      input.value = "zap,zap,";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 80));
      return {
        zapCount: Array.from(select.options, (o) => o.value).filter((v) => v === "zap").length,
        selected: Array.from(select.selectedOptions, (o) => o.value),
      };
    });
    expect(state.zapCount).toBe(1);
    expect(state.selected).toEqual(["1", "zap"]);
  });

  test("separated text is not tokenized mid-IME-composition", async ({ page }) => {
    test.skip(!(await modernSupported(page)), "Modern Popover + floating placement support is required");
    const during = await page.evaluate(async () => {
      const select = document.getElementById("tags");
      const combo = Combobox.getOrCreateInstance(select, { create: true, separators: [","] });
      const input = combo.input;
      input.focus();
      input.dispatchEvent(new CompositionEvent("compositionstart"));
      input.value = "한글,한글";
      input.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        hasToken: Array.from(select.options, (o) => o.value).includes("한글"),
        inputValue: input.value,
      };
    });
    expect(during.hasToken).toBe(false);
    expect(during.inputValue).toBe("한글,한글");

    const after = await page.evaluate(async () => {
      const select = document.getElementById("tags");
      const combo = Combobox.getInstance(select);
      const input = combo.input;
      input.dispatchEvent(new CompositionEvent("compositionend"));
      input.value = "한글,한글";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 80));
      return {
        hasToken: Array.from(select.options, (o) => o.value).includes("한글"),
        inputValue: input.value,
      };
    });
    expect(after.hasToken).toBe(true);
  });

  test("unexpected token errors are reported and the next batch still runs", async ({ page }) => {
    await setup(page, "/test/fixtures/features.html");
    const state = await page.evaluate(async () => {
      const select = document.createElement("select");
      select.multiple = true;
      document.body.append(select);
      let fail = true;
      const errors = [];
      select.addEventListener("combobox:tokenerror", (event) => errors.push(event.detail.error.message));
      const combo = new Combobox(select, {
        create: true,
        separators: [";"],
        tokenize: (value) => {
          if (fail) {
            fail = false;
            throw new Error("bad tokenizer");
          }
          return { tokens: [value.replace(/;$/, "")], rest: "" };
        },
      });
      for (const value of ["first;", "second;"]) {
        combo.input.value = value;
        combo.input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      return {
        errors,
        selected: Array.from(select.selectedOptions, (option) => option.value),
        values: Array.from(select.options, (option) => option.value),
      };
    });
    expect(state).toEqual({ errors: ["bad tokenizer"], selected: ["second"], values: ["second"] });
  });
});

test.describe("Queued and vetoed tokens", () => {
  const IDENTITY_HTML = "/test/fixtures/identity.html";
  const MODERN = "Modern Popover + floating placement support is required";

  test.beforeEach(async ({ page }) => {
    await setup(page, IDENTITY_HTML);
  });

  test("concurrent token batches cannot overshoot maxItems", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const tick = () => new Promise((resolve) => setTimeout(resolve, 60));
      const form = document.createElement("form");
      form.innerHTML = `<select name="choice" multiple></select>`;
      document.body.append(form);
      const select = form.querySelector("select");
      const releases = [];
      const combo = Combobox.getOrCreateInstance(select, {
        create: (label) => new Promise((resolve) => releases.push(() => resolve({ value: label, label }))),
        separators: [","],
        maxItems: 1,
      });
      combo.input.value = "a,";
      combo.input.dispatchEvent(new InputEvent("input", { bubbles: true }));
      await tick();
      combo.input.value = "a,b";
      combo.input.dispatchEvent(new InputEvent("input", { bubbles: true }));
      await tick();
      const requests = releases.length;
      for (const release of releases) release();
      await tick();
      await tick();
      const result = {
        requests,
        selected: combo.getSelectedValues(),
        options: select.options.length,
        text: combo.input.value,
      };
      combo.dispose();
      form.remove();
      return result;
    });

    // Serialized batches: a single creation serves both input events (no
    // overshoot past maxItems) and the unprocessed remainder stays editable.
    expect(state.requests).toBe(1);
    expect(state.selected).toEqual(["a"]);
    expect(state.options).toBe(1);
    expect(state.text).toBe("a,b");
  });

  test("a vetoed token keeps its text in the input", async ({ page }) => {
    test.skip(!(await modernSupported(page)), MODERN);
    const state = await page.evaluate(async () => {
      const tick = () => new Promise((resolve) => setTimeout(resolve, 60));
      const form = document.createElement("form");
      form.innerHTML = `<select name="choice" multiple><option value="a">Alpha</option></select>`;
      document.body.append(form);
      const select = form.querySelector("select");
      const combo = Combobox.getOrCreateInstance(select, { create: true, separators: [","] });
      select.addEventListener("combobox:beforeselect", (event) => event.preventDefault());
      combo.input.value = "Alpha,tail";
      combo.input.dispatchEvent(new InputEvent("input", { bubbles: true }));
      await tick();
      await tick();
      const result = { selected: combo.getSelectedValues(), text: combo.input.value };
      combo.dispose();
      form.remove();
      return result;
    });

    expect(state.selected).toEqual([]);
    expect(state.text).toBe("Alpha,tail");
  });
});

test.describe("Disabled token matches", () => {
  const FIXTURE = "/test/fixtures/elements.html";

  test("enhanced token creation skips disabled matches without creating duplicates", async ({ page }) => {
    await setup(page, FIXTURE);
    const state = await page.evaluate(async () => {
      const select = document.createElement("select");
      select.multiple = true;
      select.innerHTML =
        '<option value="be" disabled>Belgium</option><option value="be">Belgium</option><option value="blocked" disabled>Blocked</option>';
      document.body.append(select);
      const combo = new Combobox(select, { create: true, separators: [";"] });
      combo.input.value = "Belgium;Blocked;";
      combo.input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        text: combo.input.value,
        selected: Array.from(select.options, (option) => option.selected),
        count: select.options.length,
      };
    });
    expect(state).toEqual({ text: "Blocked;", selected: [false, true, false], count: 3 });
  });
});
