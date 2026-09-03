import { setDefaultMessages } from "../messages.js";

/**
 * Simplified Chinese UI messages.
 * @type {import("../messages.js").Messages}
 */
const messages = {
  add: "添加",
  noResults: "没有结果",
  loading: "加载中…",
  loadError: "加载结果失败",
  create: (query) => `创建“ ${query} ”`,
  remove: (label) => `删除${label}`,
  position: (label, position, total) => `${label}，第 ${position} 项，共 ${total} 项`,
};

setDefaultMessages(messages);

export default messages;
