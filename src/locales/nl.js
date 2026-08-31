import { setDefaultMessages } from "../messages.js";

/**
 * Dutch UI messages.
 * @type {import("../messages.js").Messages}
 */
const messages = {
  noResults: "Geen resultaten",
  loading: "Laden…",
  loadError: "Resultaten laden mislukt",
  create: (query) => `Maak “${query}” aan`,
  position: (label, position, total) => `${label}, positie ${position} van ${total}`,
};

setDefaultMessages(messages);

export default messages;
