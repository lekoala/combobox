import { expect, test } from "bun:test";
import { getDefaultMessages, setDefaultMessages } from "../../src/messages.js";

const LOCALES = ["en", "fr", "nl", "de", "es", "it", "pt", "ru", "zh-CN"];

const load = (lang) => import(`../../src/locales/${lang}.js`);

test("every locale mirrors the canonical key set with non-empty strings and functions", async () => {
  // `en` is the canonical catalog; every other locale must match its keys.
  const en = await load("en");
  const expected = Object.keys(en.default).sort();

  for (const lang of LOCALES) {
    const mod = await load(lang);
    expect(Object.keys(mod.default).sort()).toEqual(expected);
    expect(typeof mod.default.create).toBe("function");
    expect(typeof mod.default.remove).toBe("function");
    expect(typeof mod.default.position).toBe("function");
    for (const key of ["add", "noResults", "loading", "loadError"]) {
      expect(mod.default[key]).toBeTypeOf("string");
      expect(mod.default[key].length).toBeGreaterThan(0);
    }
  }
});

test("the documented extensionless locale subpath resolves through exports", async () => {
  // Regression: `"./locales/*"` must map to a real `*.js` target, or the
  // documented `@lekoala/combobox/locales/<lang>` import fails to resolve
  // entirely (the module never loads, so its setDefaultMessages side effect is
  // silently lost). Compare against the relative import to prove both
  // specifiers point at the same module.
  const viaSubpath = await import("@lekoala/combobox/locales/fr");
  const viaRelative = await import("../../src/locales/fr.js");
  expect(viaSubpath.default).toBe(viaRelative.default);
  expect(viaSubpath.default.noResults).toBe("Aucun résultat");
});

test("setDefaultMessages merges and getDefaultMessages returns a detached copy", () => {
  setDefaultMessages({ noResults: "Aucun résultat" });

  // The partial merge updates only the provided key and never removes the
  // producer functions.
  expect(getDefaultMessages().noResults).toBe("Aucun résultat");
  expect(typeof getDefaultMessages().create).toBe("function");

  // Mutating the returned snapshot never leaks into the engine.
  getDefaultMessages().noResults = "mutated";
  expect(getDefaultMessages().noResults).toBe("Aucun résultat");

  // Restore so this worker ends in a known state.
  setDefaultMessages({ noResults: "No results" });
  expect(getDefaultMessages().noResults).toBe("No results");
});
