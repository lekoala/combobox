import { setDefaultMessages } from "../messages.js";

/**
 * Portuguese (European) UI messages.
 * @type {import("../messages.js").Messages}
 */
const messages = {
  add: "Adicionar",
  noResults: "Sem resultados",
  loading: "A carregar…",
  loadError: "Falha ao carregar os resultados",
  create: (query) => `Criar “${query}”`,
  remove: (label) => `Remover ${label}`,
  position: (label, position, total) => `${label}, posição ${position} de ${total}`,
};

setDefaultMessages(messages);

export default messages;
