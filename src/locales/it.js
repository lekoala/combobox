import { setDefaultMessages } from "../messages.js";

/**
 * Italian UI messages.
 * @type {import("../messages.js").Messages}
 */
const messages = {
  noResults: "Nessun risultato",
  loading: "Caricamento…",
  loadError: "Impossibile caricare i risultati",
  create: (query) => `Crea “${query}”`,
  position: (label, position, total) => `${label}, posizione ${position} di ${total}`,
};

setDefaultMessages(messages);

export default messages;
