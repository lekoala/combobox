import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const IDENTITY_HTML = "/test/fixtures/identity.html";
const MODERN = "Modern Popover + floating placement support is required";

test.beforeEach(async ({ page }) => {
  await setup(page, IDENTITY_HTML);
});

test("setOptions preserves selected node identity, metadata and reset baseline", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
    const form = document.createElement("form");
    form.innerHTML = `<select name="choice" multiple><option value="a" data-meta="keep">Alpha</option></select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    const combo = Combobox.getOrCreateInstance(select);
    combo.select("a");
    const original = select.options[0];
    combo.setOptions([{ value: "b", label: "Beta" }]);
    const kept = select.options[0];
    const result = {
      sameNode: original === kept,
      metadata: kept.dataset.meta ?? null,
      defaultSelected: kept.defaultSelected,
      values: combo.getSelectedValues(),
    };
    form.reset();
    await tick();
    result.afterReset = combo.getSelectedValues();
    combo.dispose();
    form.remove();
    return result;
  });

  expect(state.sameNode).toBe(true);
  expect(state.metadata).toBe("keep");
  expect(state.defaultSelected).toBe(false);
  expect(state.values).toEqual(["a"]);
  expect(state.afterReset).toEqual([]);
});

test("selectionOrder formdata keeps sibling fields and respects disabled", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(() => {
    const form = document.createElement("form");
    form.innerHTML = `<select name="choice" multiple><option value="a">Alpha</option></select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    const combo = Combobox.getOrCreateInstance(select, { selectionOrder: "selected" });
    combo.select("a");
    const input = document.createElement("input");
    input.name = "choice";
    input.value = "sibling";
    form.append(input);
    const shared = new FormData(form).getAll("choice");
    select.disabled = true;
    const disabled = new FormData(form).getAll("choice");
    combo.dispose();
    form.remove();
    return { shared, disabled };
  });

  expect(state.shared).toEqual(["a", "sibling"]);
  expect(state.disabled).toEqual(["sibling"]);
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

test("a local search aborts the pending remote load", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    let release;
    const form = document.createElement("form");
    form.innerHTML = `<select name="choice" multiple><option value="local">Local</option></select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    const combo = Combobox.getOrCreateInstance(select, {
      load: () => new Promise((resolve) => (release = resolve)),
      minChars: 2,
      debounce: 0,
    });
    const pending = combo.search("abc");
    await combo.search("");
    const loadingAfterLocal = combo.loading;
    release([{ value: "old", label: "Old response" }]);
    await pending;
    const result = {
      loadingAfterLocal,
      results: combo.results,
      loading: combo.loading,
      visible: combo.listbox.textContent,
    };
    combo.dispose();
    form.remove();
    return result;
  });

  expect(state.loadingAfterLocal).toBe(false);
  expect(state.results).toBeNull();
  expect(state.loading).toBe(false);
  expect(state.visible).not.toContain("Old response");
});

test("creation runs the beforeselect gate", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
    const form = document.createElement("form");
    form.innerHTML = `<select name="choice"></select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    const combo = Combobox.getOrCreateInstance(select, { create: true });
    let beforeSelect = 0;
    select.addEventListener("combobox:beforeselect", (event) => {
      beforeSelect++;
      event.preventDefault();
    });
    await combo.setQuery("New");
    combo.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await tick();
    await tick();
    const result = { beforeSelect, selected: combo.getSelectedValues() };
    combo.dispose();
    form.remove();
    return result;
  });

  expect(state.beforeSelect).toBeGreaterThanOrEqual(1);
  expect(state.selected).toEqual([]);
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

test("a rejected guard rejects the programmatic caller", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const form = document.createElement("form");
    form.innerHTML = `<select name="choice" multiple><option value="a" selected>A</option></select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    const combo = Combobox.getOrCreateInstance(select, {
      guards: {
        remove: async () => {
          throw new Error("broken guard");
        },
      },
    });
    let emitted = 0;
    select.addEventListener("combobox:guarderror", () => emitted++);
    let resolved;
    try {
      resolved = await combo.remove("a");
    } catch (error) {
      resolved = `rejected: ${error.message}`;
    }
    const result = { resolved, emitted, selected: Array.from(select.selectedOptions, (o) => o.value) };
    combo.dispose();
    form.remove();
    return result;
  });

  expect(state.resolved).toBe("rejected: broken guard");
  expect(state.emitted).toBe(1);
  expect(state.selected).toEqual(["a"]);
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

test("select(value) refuses options in a disabled optgroup", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(() => {
    const form = document.createElement("form");
    form.innerHTML = `<select name="choice" multiple><optgroup label="Locked" disabled><option value="a">A</option></optgroup></select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    const combo = Combobox.getOrCreateInstance(select);
    const result = {
      selectedByValue: combo.select("a"),
      selected: combo.getSelectedValues(),
    };
    combo.dispose();
    form.remove();
    return result;
  });

  expect(state.selectedByValue).toBe(false);
  expect(state.selected).toEqual([]);
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

test("optgroup-disabled selections cannot be removed and get no chip remove button", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const form = document.createElement("form");
    form.innerHTML = `<select name="choice" multiple>
      <optgroup label="Locked" disabled><option value="a" selected>A</option></optgroup>
      <option value="b" selected>B</option>
    </select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    const combo = Combobox.getOrCreateInstance(select);
    const locked = select.options[0];
    const chipButtons = Array.from(
      form.querySelectorAll(".cb-chip"),
      (chip) => chip.querySelector(".cb-chip-remove") !== null,
    );
    const removedLocked = await combo.remove(locked);
    const cleared = await combo.clear();
    const result = {
      chipButtons,
      removedLocked,
      cleared,
      selected: Array.from(select.selectedOptions, (o) => o.value),
    };
    combo.dispose();
    form.remove();
    return result;
  });

  expect(state.chipButtons).toEqual([false, true]);
  expect(state.removedLocked).toBe(false);
  expect(state.cleared).toBe(true);
  expect(state.selected).toEqual(["a"]);
});

test("addOption/select adopt a detached or foreign option node for real", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(() => {
    const form = document.createElement("form");
    form.innerHTML = `<select name="choice" multiple><option value="a">A</option></select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    // multiple: a plain <select>'s first option is auto-selected by the
    // platform, and adoption must preserve the node's own state.
    const other = document.createElement("select");
    other.multiple = true;
    other.innerHTML = `<option value="f">Foreign</option>`;
    document.body.append(other);
    const combo = Combobox.getOrCreateInstance(select);

    const detached = new Option("Detached", "d");
    combo.addOption({ value: "d", label: "Detached", option: detached });
    const detachedInSelect = detached.closest("select") === select;

    const foreign = other.options[0];
    combo.addOption({ value: "f", label: "Foreign", option: foreign });
    const foreignMoved = foreign.closest("select") === select && other.options.length === 0;

    const viaSelect = new Option("ViaSelect", "v");
    const selectedViaSelect = combo.select({ value: "v", label: "ViaSelect", option: viaSelect });
    const viaSelectLanded = viaSelect.closest("select") === select && viaSelect.selected;

    const result = {
      detachedInSelect,
      foreignMoved,
      selectedViaSelect,
      viaSelectLanded,
      values: combo.getSelectedValues(),
    };
    combo.dispose();
    form.remove();
    other.remove();
    return result;
  });

  expect(state.detachedInSelect).toBe(true);
  expect(state.foreignMoved).toBe(true);
  expect(state.selectedViaSelect).toBe(true);
  expect(state.viaSelectLanded).toBe(true);
  expect(state.values).toEqual(["v"]);
});

test("createOnBlur keeps the typed text when creation is refused", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
    const form = document.createElement("form");
    form.innerHTML = `<select name="choice" multiple></select><button type="button">Away</button>`;
    document.body.append(form);
    const select = form.querySelector("select");
    const combo = Combobox.getOrCreateInstance(select, {
      create: true,
      createOnBlur: true,
      guards: { add: () => false },
    });
    combo.input.value = "keepme";
    combo.input.focus();
    await tick();
    form.querySelector("button").focus();
    await tick();
    await tick();
    const result = { text: combo.input.value, selected: combo.getSelectedValues() };
    combo.dispose();
    form.remove();
    return result;
  });

  expect(state.text).toBe("keepme");
  expect(state.selected).toEqual([]);
});

test("select({ value: '' }) refuses instead of throwing", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(() => {
    const form = document.createElement("form");
    form.innerHTML = `<select name="choice"><option value="a">A</option></select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    const combo = Combobox.getOrCreateInstance(select);
    let threw = null;
    let returned = null;
    try {
      returned = combo.select({ value: "", label: "Empty" });
    } catch (error) {
      threw = error.message;
    }
    const result = { threw, returned, options: select.options.length };
    combo.dispose();
    form.remove();
    return result;
  });

  expect(state.threw).toBeNull();
  expect(state.returned).toBe(false);
  expect(state.options).toBe(1);
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

test("resolved coordinate space and the token queue are not public surface", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(() => {
    const form = document.createElement("form");
    form.innerHTML = `<select name="choice"><option value="a">A</option></select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    const combo = Combobox.getOrCreateInstance(select);
    const result = {
      coordinateSpace: combo.coordinateSpace,
      tokenQueue: combo.tokenQueue,
    };
    combo.dispose();
    form.remove();
    return result;
  });

  expect(state.coordinateSpace).toBeUndefined();
  expect(state.tokenQueue).toBeUndefined();
});

test("native option label wins over text content", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(() => {
    const form = document.createElement("form");
    form.innerHTML = `<select name="choice"><option value="a" label="Display label">Text content</option></select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    const combo = Combobox.getOrCreateInstance(select);
    const result = { native: select.options[0].label, display: combo.input.value };
    combo.dispose();
    form.remove();
    return result;
  });

  expect(state.native).toBe("Display label");
  expect(state.display).toBe("Display label");
});

test("input+datalist selection does not self-trigger a reload or reopen", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const wrap = document.createElement("div");
    wrap.innerHTML = '<input id="dl-load" list="dl-load-list"><datalist id="dl-load-list"></datalist>';
    document.body.append(wrap);
    const input = wrap.querySelector("input");
    const loads = [];
    const combo = Combobox.getOrCreateInstance(input, {
      load: (query) => {
        loads.push(query);
        return [{ value: "Paris", label: "Paris" }];
      },
      minChars: 0,
      debounce: 0,
    });
    input.focus();
    input.value = "Par";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await tick(60);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await tick(20);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await tick(60);
    const loadsAfterSelect = loads.length;
    await tick(400);
    const result = {
      value: input.value,
      open: combo.isOpen(),
      loadsAfterSelect,
      loads: loads.slice(),
      grew: loads.length > loadsAfterSelect,
    };
    combo.dispose();
    wrap.remove();
    return result;
  });

  expect(state.value).toBe("Paris");
  expect(state.open).toBe(false);
  expect(state.grew).toBe(false);
  expect(state.loads).toEqual(["Par"]);
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

test("move(value, NaN) refuses instead of moving to the head", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(() => {
    const form = document.createElement("form");
    form.innerHTML = `<select name="order" multiple>
      <option value="a" selected>A</option>
      <option value="b" selected>B</option>
      <option value="c" selected>C</option>
    </select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    const combo = Combobox.getOrCreateInstance(select, { selectionOrder: "selected" });
    let reorderEvents = 0;
    select.addEventListener("combobox:reorder", () => reorderEvents++);
    const moved = combo.move("c", Number("x"));
    const result = { moved, values: combo.getSelectedValues(), reorderEvents };
    combo.dispose();
    form.remove();
    return result;
  });

  expect(state.moved).toBe(false);
  expect(state.values).toEqual(["a", "b", "c"]);
  expect(state.reorderEvents).toBe(0);
});

test("form validation focuses the first invalid combobox, not the last", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(() => {
    const form = document.createElement("form");
    form.innerHTML = `
      <select id="inv-a" name="a" required><option value="">Choose</option><option value="1">One</option></select>
      <select id="inv-b" name="b" required><option value="">Choose</option><option value="1">One</option></select>`;
    document.body.append(form);
    const a = form.querySelector("#inv-a");
    const b = form.querySelector("#inv-b");
    Combobox.getOrCreateInstance(a);
    Combobox.getOrCreateInstance(b);
    const inputOf = (select) => select.nextElementSibling.querySelector(".cb-input");
    form.requestSubmit();
    const result = {
      focusedFirst: document.activeElement === inputOf(a),
      focusedSecond: document.activeElement === inputOf(b),
    };
    for (const select of [a, b]) Combobox.getInstance(select).dispose();
    form.remove();
    return result;
  });

  expect(state.focusedFirst).toBe(true);
  expect(state.focusedSecond).toBe(false);
});

test("form validation still focuses the first invalid combobox inside a fieldset", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(() => {
    const form = document.createElement("form");
    // The <fieldset> is listed before its child and matches :invalid as soon
    // as the child is invalid, without being a validation candidate itself.
    form.innerHTML = `
      <fieldset>
        <select id="inv-fs" name="a" required><option value="">Choose</option><option value="1">One</option></select>
      </fieldset>`;
    document.body.append(form);
    const select = form.querySelector("#inv-fs");
    const combo = Combobox.getOrCreateInstance(select);
    form.requestSubmit();
    const result = {
      focused: document.activeElement === select.nextElementSibling.querySelector(".cb-input"),
      ariaInvalid: combo.input.getAttribute("aria-invalid"),
    };
    combo.dispose();
    form.remove();
    return result;
  });

  expect(state.focused).toBe(true);
  expect(state.ariaInvalid).toBe("true");
});

test("a readonly select locks interaction but keeps the programmatic API", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const form = document.createElement("form");
    form.innerHTML = `<select id="ro-multi" name="ro" multiple readonly>
      <option value="a" selected>A</option>
      <option value="b" selected>B</option>
    </select>`;
    document.body.append(form);
    const select = form.querySelector("select");
    const combo = Combobox.getOrCreateInstance(select);

    const removeButtons = form.querySelectorAll(".cb-chip-remove").length;

    combo.input.focus();
    await tick(30);
    const openOnFocus = combo.isOpen();

    // Backspace in the empty input must not remove the last selection either.
    combo.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    await tick(30);
    const afterInputBackspace = Array.from(select.selectedOptions, (o) => o.value);

    const chip = form.querySelector(".cb-chip");
    chip.focus();
    chip.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    await tick(30);
    const afterChipBackspace = Array.from(select.selectedOptions, (o) => o.value);

    const removed = await combo.remove("a");
    const result = {
      removeButtons,
      openOnFocus,
      afterInputBackspace,
      afterChipBackspace,
      removed,
      afterRemove: Array.from(select.selectedOptions, (o) => o.value),
    };
    combo.dispose();
    form.remove();
    return result;
  });

  expect(state.removeButtons).toBe(0);
  expect(state.openOnFocus).toBe(false);
  expect(state.afterInputBackspace).toEqual(["a", "b"]);
  expect(state.afterChipBackspace).toEqual(["a", "b"]);
  expect(state.removed).toBe(true);
  expect(state.afterRemove).toEqual(["b"]);
});
