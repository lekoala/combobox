import { setDefaultMessages } from "../messages.js";

/**
 * French UI messages.
 * @type {import("../messages.js").Messages}
 */
const messages = {
  noResults: "Aucun résultat",
  loading: "Chargement…",
  loadError: "Échec du chargement des résultats",
  create: (query) => `Créer « ${query} »`,
  position: (label, position, total) => `${label}, position ${position} sur ${total}`,
};

setDefaultMessages(messages);

export default messages;
