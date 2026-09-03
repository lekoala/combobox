import { setDefaultMessages } from "../messages.js";

/**
 * Russian UI messages.
 * @type {import("../messages.js").Messages}
 */
const messages = {
  add: "Добавить",
  noResults: "Ничего не найдено",
  loading: "Загрузка…",
  loadError: "Не удалось загрузить результаты",
  create: (query) => `Создать « ${query} »`,
  remove: (label) => `Удалить ${label}`,
  position: (label, position, total) => `${label}: позиция ${position} из ${total}`,
};

setDefaultMessages(messages);

export default messages;
