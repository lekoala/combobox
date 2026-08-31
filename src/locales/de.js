import { setDefaultMessages } from "../messages.js";

/**
 * German UI messages.
 * @type {import("../messages.js").Messages}
 */
const messages = {
  noResults: "Keine Ergebnisse",
  loading: "Lädt…",
  loadError: "Ergebnisse konnten nicht geladen werden",
  create: (query) => `“${query}” erstellen`,
  position: (label, position, total) => `${label}, Position ${position} von ${total}`,
};

setDefaultMessages(messages);

export default messages;
