import { setDefaultMessages } from "../messages.js";

/**
 * Portuguese (European) UI messages.
 * @type {import("../messages.js").Messages}
 */
const messages = {
  noResults: "Sem resultados",
  loading: "A carregar…",
  loadError: "Falha ao carregar os resultados",
  create: (query) => `Criar “${query}”`,
  position: (label, position, total) => `${label}, posição ${position} de ${total}`,
};

setDefaultMessages(messages);

export default messages;
