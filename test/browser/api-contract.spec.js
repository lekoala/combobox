import { expect, test } from "@playwright/test";
import { modernSupported, setup } from "./helpers.js";

test.describe("Public instance surface", () => {
  const IDENTITY_HTML = "/test/fixtures/identity.html";
  const MODERN = "Modern Popover + floating placement support is required";

  test.beforeEach(async ({ page }) => {
    await setup(page, IDENTITY_HTML);
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
});
