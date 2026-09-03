import { setDefaultMessages } from "../messages.js";

/**
 * English UI messages — canonical catalog: keys and default values match the
 * engine defaults, so `en` is the reference every other locale mirrors.
 * @type {import("../messages.js").Messages}
 */
const messages = {
  add: "Add",
  noResults: "No results",
  loading: "Loading…",
  loadError: "Failed to load results",
  create: (query) => `Create “${query}”`,
  remove: (label) => `Remove ${label}`,
  position: (label, position, total) => `${label} position ${position} of ${total}`,
};

setDefaultMessages(messages);

export default messages;
