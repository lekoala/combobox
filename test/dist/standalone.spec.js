import { expect, test } from "@playwright/test";

const STANDALONE_HTML = "/demo/dist-standalone.html";

test("standalone registers, styles and injects its nonce exactly once", async ({ page }) => {
  await page.goto(STANDALONE_HTML);

  const initial = await page.evaluate(() => {
    const wrapper = document.querySelector("combo-box");
    const definition = customElements.get("combo-box");
    const style = document.getElementById("lekoala-combobox-style");
    const control = document.querySelector(".cb-control");
    return {
      defined: typeof customElements.get("combo-box"),
      instanceOfDefinition: definition ? wrapper instanceof definition : false,
      upgraded: wrapper?.combobox != null,
      mode: wrapper?.combobox?.mode,
      popoverSupported: typeof HTMLElement.prototype.showPopover === "function",
      styleCount: document.querySelectorAll("#lekoala-combobox-style").length,
      styleNonce: style?.nonce,
      controlDisplay: control ? getComputedStyle(control).display : null,
      windowCombobox: typeof window.Combobox,
      windowHelpers: typeof window.ComboboxHelpers,
    };
  });

  expect(initial).toEqual({
    defined: "function",
    instanceOfDefinition: true,
    upgraded: true,
    mode: "enhanced",
    popoverSupported: true,
    styleCount: 1,
    styleNonce: "standalone-demo",
    controlDisplay: "flex",
    windowCombobox: "undefined",
    windowHelpers: "undefined",
  });

  await page.evaluate(async () => {
    const script = document.createElement("script");
    script.src = "/dist/combobox.standalone.min.js";
    await new Promise((resolve, reject) => {
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.head.append(script);
    });
  });

  await expect(page.locator("#lekoala-combobox-style")).toHaveCount(1);
  expect(await page.evaluate(() => typeof customElements.get("combo-box"))).toBe("function");
});
