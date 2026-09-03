import { setDefaultMessages } from "../messages.js";

/**
 * German UI messages.
 * @type {import("../messages.js").Messages}
 */
const messages = {
  add: "Hinzufügen",
  noResults: "Keine Ergebnisse",
  loading: "Lädt…",
  loadError: "Ergebnisse konnten nicht geladen werden",
  create: (query) => `“${query}” erstellen`,
  remove: (label) => `${label} entfernen`,
  position: (label, position, total) => `${label}, Position ${position} von ${total}`,
};

setDefaultMessages(messages);

export default messages;
