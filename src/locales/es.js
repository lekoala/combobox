import { setDefaultMessages } from "../messages.js";

/**
 * Spanish UI messages.
 * @type {import("../messages.js").Messages}
 */
const messages = {
  add: "Añadir",
  noResults: "Sin resultados",
  loading: "Cargando…",
  loadError: "No se pudieron cargar los resultados",
  create: (query) => `Crear « ${query} »`,
  remove: (label) => `Eliminar ${label}`,
  position: (label, position, total) => `${label}, posición ${position} de ${total}`,
};

setDefaultMessages(messages);

export default messages;
