import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

const REMOTE = "/test/fixtures/remote.html";
const MODERN = "Modern Popover + Anchor support is required";

test.beforeEach(async ({ page }) => {
  await setup(page, REMOTE);
  test.skip(!(await modernSupported(page)), MODERN);
});

test("a transient result group renders a header and materializes a native optgroup on select", async ({
  page,
}) => {
  const state = await page.evaluate(async () => {
    const select = document.getElementById("remote-multi");
    const combo = Combobox.getOrCreateInstance(select);
    combo.setResults([{ value: "g1", label: "Grape", group: "Gruppe" }]);
    combo.applyFilter("gra", { show: true });

    const during = {
      headers: Array.from(combo.listbox.querySelectorAll(".cb-group"), (node) => node.textContent.trim()),
      nativeOptgroups: Array.from(select.querySelectorAll("optgroup"), (group) => group.label),
      rowVisible: !!Array.from(combo.listbox.querySelectorAll(".cb-option")).find((node) =>
        node.textContent.includes("Grape"),
      ),
    };

    const row = Array.from(combo.listbox.querySelectorAll(".cb-option")).find((node) =>
      node.textContent.includes("Grape"),
    );
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 40));

    const grapeOption = select.querySelector('option[value="g1"]');
    return {
      during,
      after: {
        selected: Array.from(select.selectedOptions, (o) => o.value),
        nativeOptgroups: Array.from(select.querySelectorAll("optgroup"), (group) => group.label),
        grapeInsideGroup: grapeOption?.parentElement instanceof HTMLOptGroupElement,
        grapeGroup: grapeOption?.closest("optgroup")?.label ?? null,
      },
    };
  });

  expect(state.during.rowVisible).toBe(true);
  expect(state.during.headers).toEqual(["Gruppe"]);
  expect(state.during.nativeOptgroups).toEqual([]);
  expect(state.after.selected).toEqual(["mlocal", "g1"]);
  expect(state.after.nativeOptgroups).toEqual(["Gruppe"]);
  expect(state.after.grapeInsideGroup).toBe(true);
  expect(state.after.grapeGroup).toBe("Gruppe");
});

test("render.group returns a Node for rich headers and a string stays text", async ({ page }) => {
  const state = await page.evaluate(() => {
    const select = document.getElementById("remote-multi");
    const nodeCombo = Combobox.getOrCreateInstance(select, {
      render: {
        group: (group) => {
          const node = document.createElement("b");
          node.textContent = `${group} (rich)`;
          return node;
        },
      },
    });
    nodeCombo.setResults([
      { value: "n1", label: "Nut", group: "Nuts" },
      { value: "s1", label: "Seed", group: "Seeds" },
    ]);
    nodeCombo.applyFilter("", { show: true });
    const nodeHeaders = Array.from(nodeCombo.listbox.querySelectorAll(".cb-group"), (header) => ({
      node: header.firstElementChild?.tagName ?? null,
      text: header.textContent.trim(),
    }));

    nodeCombo.dispose();
    const stringCombo = Combobox.getOrCreateInstance(select, {
      render: { group: (group) => `<i>${group}</i>` },
    });
    stringCombo.setResults([{ value: "p1", label: "Pear", group: "Pomes" }]);
    stringCombo.applyFilter("", { show: true });
    const header = stringCombo.listbox.querySelector(".cb-group");
    const stringHeader = {
      node: header?.firstElementChild?.tagName ?? null,
      text: header?.textContent ?? "",
    };
    return { nodeHeaders, stringHeader };
  });

  expect(state.nodeHeaders).toEqual([
    { node: "B", text: "Nuts (rich)" },
    { node: "B", text: "Seeds (rich)" },
  ]);
  expect(state.stringHeader).toEqual({ node: null, text: "<i>Pomes</i>" });
});
