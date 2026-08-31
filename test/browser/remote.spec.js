import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const REMOTE = "/test/fixtures/remote.html";

function control(id) {
  return `#${id} + .cb-control .cb-input`;
}

const MODERN = "Modern Popover + Anchor support is required";

test.beforeEach(async ({ page }) => {
  await setup(page, REMOTE);
});

test("minChars and shouldLoad gate the load call", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const calls = [];
    const combo = Combobox.getOrCreateInstance(document.getElementById("remote"), {
      debounce: 0,
      minChars: 2,
      shouldLoad: (query) => query !== "blocked",
      load: async (query) => {
        calls.push(query);
        return [{ value: `r${query}`, label: `Remote ${query}` }];
      },
    });
    const input = combo.input;
    input.focus();
    const fire = async (value) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
    };
    await fire("x"); // below minChars
    await fire("blocked"); // vetoed by shouldLoad
    await fire("xy"); // loads
    return {
      calls,
      rows: Array.from(combo.listbox.querySelectorAll(".cb-option")).map((row) => row.textContent.trim()),
    };
  });
  expect(state.calls).toEqual(["xy"]);
  expect(state.rows).toEqual(["Remote xy"]);
});

test("debounce coalesces rapid input into a single load", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const calls = [];
    const combo = Combobox.getOrCreateInstance(document.getElementById("remote"), {
      debounce: 120,
      load: async (query) => {
        calls.push(query);
        return [{ value: query, label: query }];
      },
    });
    const input = combo.input;
    input.focus();
    input.value = "a";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 40));
    input.value = "ab";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    return {
      calls,
      rows: Array.from(combo.listbox.querySelectorAll(".cb-option")).map((row) => row.textContent.trim()),
    };
  });
  expect(state.calls).toEqual(["ab"]);
  expect(state.rows).toEqual(["ab"]);
});

test("a newer query aborts in-flight load; stale results never render and abort emits no events", async ({
  page,
}) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const pending = {};
    const calls = [];
    let loads = 0;
    let loadErrors = 0;
    const select = document.getElementById("remote");
    select.addEventListener("combobox:load", () => loads++);
    select.addEventListener("combobox:loaderror", () => loadErrors++);

    const combo = Combobox.getOrCreateInstance(select, {
      debounce: 0,
      // Real-world loaders may ignore the signal and resolve late anyway; the
      // engine must not let the stale resolution win.
      load: (query) =>
        new Promise((resolve) => {
          calls.push(query);
          pending[query] = resolve;
        }),
    });
    const input = combo.input;
    input.focus();
    input.value = "a";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    input.value = "ab";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    pending.ab([{ value: "ab", label: "Fresh AB" }]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    pending.a([{ value: "a", label: "Stale A" }]); // late, must lose
    await new Promise((resolve) => setTimeout(resolve, 30));

    return {
      calls,
      loads,
      loadErrors,
      query: combo.query,
      rows: Array.from(combo.listbox.querySelectorAll(".cb-option")).map((row) => row.textContent.trim()),
    };
  });
  expect(state.calls).toEqual(["a", "ab"]);
  expect(state.query).toBe("ab");
  expect(state.rows).toEqual(["Fresh AB"]);
  expect(state.loads).toBe(1); // only the winning query fired combobox:load
  expect(state.loadErrors).toBe(0); // the aborted "a" neither rendered nor errored
});

test("loading row appears without flashing no-results, then results render", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("remote"), {
      debounce: 0,
      messages: { loading: "Chargement…" },
      load: (query, { signal }) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve([{ value: query, label: `Result ${query}` }]), 100);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        }),
    });
    const input = combo.input;
    input.focus();
    input.value = "br";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 15));
    const during = {
      open: combo.isOpen(),
      loading: !!combo.listbox.querySelector(".cb-loading"),
      noResultsFlash: !!combo.listbox.querySelector(".cb-empty:not(.cb-loading)"),
      status: combo.status.textContent,
    };
    await new Promise((resolve) => setTimeout(resolve, 150));
    return {
      during,
      after: {
        loading: !!combo.listbox.querySelector(".cb-loading"),
        rows: Array.from(combo.listbox.querySelectorAll(".cb-option")).map((row) => row.textContent.trim()),
      },
    };
  });
  expect(state.during.open).toBe(true);
  expect(state.during.loading).toBe(true);
  expect(state.during.noResultsFlash).toBe(false);
  expect(state.during.status).toBe("Chargement…");
  expect(state.after.loading).toBe(false);
  expect(state.after.rows).toEqual(["Result br"]);
});

test("transient results stay out of the catalogue; selecting materializes only the chosen one", async ({
  page,
}) => {
  test.skip(!(await modernSupported(page)), MODERN);
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("remote"), {
      debounce: 0,
      minChars: 1,
      load: async () => [
        { value: "r9", label: "Remote Nine" },
        { value: "r10", label: "Remote Ten" },
      ],
    });
  });

  const input = page.locator(control("remote"));
  await input.click();
  // Clicking the filter focuses it; the load triggers on the first keystroke.
  await input.pressSequentially("nine");

  await page.locator(".cb-popover:visible .cb-option", { hasText: "Remote Nine" }).click();
  await page.waitForTimeout(20);

  const afterSelect = await page.evaluate(() => {
    const select = document.getElementById("remote");
    return {
      selected: select.value,
      catalogue: Array.from(select.options, (option) => option.value),
    };
  });
  expect(afterSelect.selected).toBe("r9");
  expect(afterSelect.catalogue).toContain("r9");
  expect(afterSelect.catalogue).not.toContain("r10"); // never materialized

  // A local query drops the transient store but keeps the materialized option.
  await page.evaluate(async () => {
    const combo = Combobox.getInstance(document.getElementById("remote"));
    combo.input.value = "";
    combo.input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 40));
    return null;
  });

  const afterClear = await page.evaluate(() => {
    const combo = Combobox.getInstance(document.getElementById("remote"));
    return {
      rows: Array.from(combo.listbox.querySelectorAll(".cb-option")).map((row) => row.textContent.trim()),
      resultsStore: combo.results === null,
    };
  });
  expect(afterClear.resultsStore).toBe(true);
  expect(afterClear.rows).toContain("Remote Nine"); // materialized option is durable
  expect(afterClear.rows).not.toContain("Remote Ten"); // transient result was dropped
});

test("cancelling beforeselect does not materialize a transient result", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  await page.evaluate(() => {
    const select = document.getElementById("remote");
    select.addEventListener("combobox:beforeselect", (event) => event.preventDefault());
    Combobox.getOrCreateInstance(select, {
      debounce: 0,
      minChars: 1,
      load: async () => [{ value: "action", label: "Run action", type: "action" }],
    });
  });

  const input = page.locator(control("remote"));
  await input.fill("run");
  await page.locator(".cb-popover:visible .cb-option", { hasText: "Run action" }).click();

  const state = await page.evaluate(() => {
    const select = document.getElementById("remote");
    return {
      value: select.value,
      catalogue: Array.from(select.options, (option) => option.value),
    };
  });
  expect(state.value).toBe("");
  expect(state.catalogue).not.toContain("action");
});

test("setQuery and clearQuery keep visible text and search state synchronized", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const combo = Combobox.getOrCreateInstance(document.getElementById("remote-input"));
    await combo.setQuery("Alpha", { show: true });
    const set = {
      input: combo.input.value,
      query: combo.query,
      open: combo.isOpen(),
      rows: Array.from(combo.listbox.querySelectorAll(".cb-option"), (row) => row.textContent.trim()),
    };
    combo.hide();
    await combo.clearQuery();
    return {
      set,
      cleared: { input: combo.input.value, query: combo.query, open: combo.isOpen() },
    };
  });

  expect(state.set).toEqual({ input: "Alpha", query: "Alpha", open: true, rows: ["Local Alpha"] });
  expect(state.cleared).toEqual({ input: "", query: "", open: false });
});

test("a consumer anchor is the positioning and internal-interaction region", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const input = document.getElementById("remote-input");
    const shell = document.createElement("div");
    shell.setAttribute("style", "color: red");
    input.before(shell);
    shell.append(input);
    const button = document.createElement("button");
    button.type = "button";
    shell.append(button);

    const combo = Combobox.getOrCreateInstance(input, { anchor: shell });
    await combo.setQuery("Alpha", { show: true });
    button.focus();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const whileEnhanced = {
      open: combo.isOpen(),
      anchorName: shell.style.getPropertyValue("anchor-name"),
      positionAnchor: combo.popover.style.getPropertyValue("position-anchor"),
    };
    combo.dispose();
    return { whileEnhanced, restoredStyle: shell.getAttribute("style") };
  });

  expect(state.whileEnhanced.open).toBe(true);
  expect(state.whileEnhanced.anchorName).toBe(state.whileEnhanced.positionAnchor);
  expect(state.restoredStyle).toBe("color: red");
});

test("selecting a remote result materializes the native option and chip on a multiple", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  await page.evaluate(() => {
    Combobox.getOrCreateInstance(document.getElementById("remote-multi"), {
      debounce: 0,
      minChars: 1,
      load: async () => [{ value: "kiwi", label: "Kiwi" }],
    });
  });

  const input = page.locator(control("remote-multi"));
  await input.click();
  await input.press("k");
  await page.locator(".cb-popover:visible .cb-option", { hasText: "Kiwi" }).click();
  await page.waitForTimeout(30);

  const state = await page.evaluate(() => {
    const select = document.getElementById("remote-multi");
    const option = select.querySelector('option[value="kiwi"]');
    return {
      exists: option !== null,
      selected: option?.selected ?? false,
      chip: !!document.querySelector('.cb-chip[data-value="kiwi"]'),
    };
  });
  expect(state.exists).toBe(true);
  expect(state.selected).toBe(true);
  expect(state.chip).toBe(true);
});

test("load error shows a cb-error row, preserves selection, and clears on next load or local query", async ({
  page,
}) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const select = document.getElementById("remote");
    const errors = [];
    select.addEventListener("combobox:loaderror", (event) => errors.push(event.detail.error.message));
    let attempts = 0;
    const combo = Combobox.getOrCreateInstance(select, {
      debounce: 0,
      minChars: 1,
      load: async (query) => {
        attempts++;
        if (attempts === 1) throw new Error("boom");
        return [{ value: "ok", label: `${query} recovered` }];
      },
    });
    const input = combo.input;
    input.focus();
    const fire = async (value, wait = 40) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, wait));
    };

    await fire("a");
    const errored = {
      rows: Array.from(combo.listbox.querySelectorAll(".cb-option")).map((row) => row.textContent.trim()),
      errorRow: combo.listbox.querySelector(".cb-error")?.textContent.trim() ?? null,
      status: combo.status.textContent,
      selection: select.value,
    };
    const activeDescendant = combo.input.getAttribute("aria-activedescendant");

    await fire(""); // below minChars clears the stale error via clearResults()
    const clearedLocal = {
      errorRow: !!combo.listbox.querySelector(".cb-error"),
      rows: Array.from(combo.listbox.querySelectorAll(".cb-option")).map((row) => row.textContent.trim()),
    };

    await fire("ab");
    const recovered = {
      errorRow: !!combo.listbox.querySelector(".cb-error"),
      rows: Array.from(combo.listbox.querySelectorAll(".cb-option")).map((row) => row.textContent.trim()),
    };

    return { errors, attempts, errored, activeDescendant, clearedLocal, recovered };
  });

  expect(state.errors).toEqual(["boom"]);
  expect(state.attempts).toBe(2);
  expect(state.errored.errorRow).toBe("Failed to load results");
  expect(state.errored.status).toBe("Failed to load results");
  expect(state.errored.rows).toEqual([]);
  expect(state.errored.selection).toBe(""); // untouched by the failed load
  expect(state.activeDescendant).toBeNull(); // error state has no stale active row
  expect(state.clearedLocal.errorRow).toBe(false);
  expect(state.clearedLocal.rows).toContain("Local One");
  expect(state.recovered.errorRow).toBe(false);
  expect(state.recovered.rows).toEqual(["ab recovered"]);
});

test("messages override the generated state text without touching render", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    let attempts = 0;
    const combo = Combobox.getOrCreateInstance(document.getElementById("remote"), {
      debounce: 0,
      minChars: 1,
      create: true,
      messages: {
        noResults: "Rien",
        loading: "Chargement…",
        loadError: "Aucune donnée",
        create: (query) => `Créer « ${query} »`,
      },
      load: async () => {
        attempts++;
        if (attempts === 1) throw new Error("x");
        return [];
      },
    });
    const input = combo.input;
    input.focus();
    const fire = async (value) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 40));
    };

    await fire("a");
    const errored = {
      errorRow: combo.listbox.querySelector(".cb-error")?.textContent.trim() ?? null,
      status: combo.status.textContent,
    };

    await fire("ab");
    const created = {
      row: combo.listbox.querySelector(".cb-create")?.textContent.trim() ?? null,
    };

    return { errored, created, attempts };
  });

  expect(state.errored.errorRow).toBe("Aucune donnée");
  expect(state.errored.status).toBe("Aucune donnée");
  expect(state.created.row).toBe("Créer « ab »");
  expect(state.attempts).toBe(2);
});

test("{items,cursor} feeds loadMore: cursor passed, appended, maxOptions never bypassed", async ({
  page,
}) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const pages = [
      [
        { value: "p1", label: "Alpha One" },
        { value: "p2", label: "Alpha Two" },
      ],
      [
        { value: "p3", label: "Alpha Three" },
        { value: "p4", label: "Alpha Four" },
      ],
    ];
    let pageIndex = 0;
    const cursors = [];
    const combo = Combobox.getOrCreateInstance(document.getElementById("remote"), {
      debounce: 0,
      maxOptions: 2,
      load: async (_query, { cursor }) => {
        cursors.push(cursor ?? null);
        const items = pages[pageIndex];
        pageIndex++;
        return cursor ? { items } : { items, cursor: "c2" };
      },
    });
    const input = combo.input;
    input.focus();
    input.value = "a";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 40));

    const first = {
      rows: Array.from(combo.listbox.querySelectorAll(".cb-option")).map((row) => row.textContent.trim()),
      nextCursor: combo.nextCursor,
      resultsLength: combo.results.length,
      visibleLength: combo.visibleItems.length,
    };

    const more = await combo.loadMore();
    await new Promise((resolve) => setTimeout(resolve, 40));
    const second = {
      cursors,
      rows: Array.from(combo.listbox.querySelectorAll(".cb-option")).map((row) => row.textContent.trim()),
      nextCursor: combo.nextCursor,
      resultsLength: combo.results.length,
      visibleLength: combo.visibleItems.length,
    };

    const halted = await combo.loadMore(); // null cursor after last page

    return { first, second, more, halted };
  });

  expect(state.first.nextCursor).toBe("c2");
  expect(state.first.resultsLength).toBe(2);
  expect(state.first.visibleLength).toBe(2);
  expect(state.first.rows).toEqual(["Alpha One", "Alpha Two"]);

  expect(state.more).toBe(true);
  expect(state.second.cursors).toEqual([null, "c2"]); // loadMore passed the cursor
  expect(state.second.resultsLength).toBe(4); // store enriched
  expect(state.second.visibleLength).toBe(2); // maxOptions is a rendering cap
  expect(state.second.nextCursor).toBeNull(); // last page returned no cursor
  expect(state.second.rows).toEqual(["Alpha One", "Alpha Two"]); // window stays capped

  expect(state.halted).toBe(false); // no cursor => no further page
});

test("dependent loader reads a live field and refreshes when the dependency changes", async ({ page }) => {
  test.skip(!(await modernSupported(page)), MODERN);
  const state = await page.evaluate(async () => {
    const calls = [];
    const context = [];
    const combo = Combobox.getOrCreateInstance(document.getElementById("dep-city"), {
      debounce: 0,
      minChars: 1,
      shouldLoad: () => document.getElementById("dep-country").value !== "",
      load: async (query, ctx) => {
        calls.push(query);
        context.push({
          sourceIsSelect: ctx.source === document.getElementById("dep-city"),
          input: ctx.input,
        });
        const country = document.getElementById("dep-country").value;
        const cities = { be: ["Brussels", "Antwerp"], fr: ["Paris", "Lyon"] }[country] ?? [];
        return cities
          .filter((city) => city.toLowerCase().includes(query.toLowerCase()))
          .map((city) => ({ value: city.toLowerCase(), label: city }));
      },
    });
    const input = combo.input;
    input.focus();
    const fire = async (value, wait = 40) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, wait));
    };
    const rows = () =>
      Array.from(combo.listbox.querySelectorAll(".cb-option")).map((row) => row.textContent.trim());

    await fire("b"); // country empty => shouldLoad vetoes
    const gatedCalls = calls.length;
    const gatedRows = rows();

    document.getElementById("dep-country").value = "be";
    await fire("b");
    const belgiumRows = rows();

    document.getElementById("dep-country").value = "fr";
    await fire("p");
    const franceRows = rows();

    return {
      gatedCalls,
      gatedRows,
      belgiumRows,
      franceRows,
      calls,
      context,
    };
  });

  expect(state.gatedCalls).toBe(0);
  expect(state.context[0]?.sourceIsSelect).toBe(true);
  expect(state.belgiumRows).toEqual(["Brussels"]);
  expect(state.franceRows).toEqual(["Paris"]);
  expect(state.calls).toEqual(["b", "p"]); // the "b" for fr was repurposed; stale be results must not persist
});
