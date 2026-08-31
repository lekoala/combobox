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
    expect(typeof mod.default.position).toBe("function");
    for (const key of ["noResults", "loading", "loadError"]) {
      expect(mod.default[key]).toBeTypeOf("string");
      expect(mod.default[key].length).toBeGreaterThan(0);
    }
  }
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
