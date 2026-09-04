/*** @lekoala/combobox v0.1.0 - https://github.com/lekoala/combobox ***/
(() => {
  // node_modules/@lekoala/floating/src/floating.js
  function crossAxisFor(side) {
    return side === "top" || side === "bottom" ? "x" : "y";
  }
  function parsePlacement(placement) {
    const [side, align = null] = placement.split("-");
    return { side, align, crossAxis: crossAxisFor(side) };
  }
  function flipSide(side) {
    return { top: "bottom", bottom: "top", left: "right", right: "left" }[side] || side;
  }
  function computeCoords(reference, floating, side, align, rtl, distance) {
    const crossAxis = crossAxisFor(side);
    const commonX = reference.x + reference.width / 2 - floating.width / 2;
    const commonY = reference.y + reference.height / 2 - floating.height / 2;
    const commonAlign = reference[crossAxis === "x" ? "width" : "height"] / 2 - floating[crossAxis === "x" ? "width" : "height"] / 2;
    let coords;
    switch (side) {
      case "top":
        coords = { x: commonX, y: reference.y - floating.height - distance };
        break;
      case "bottom":
        coords = { x: commonX, y: reference.y + reference.height + distance };
        break;
      case "right":
        coords = { x: reference.x + reference.width + distance, y: commonY };
        break;
      case "left":
        coords = { x: reference.x - floating.width - distance, y: commonY };
        break;
      default:
        coords = { x: reference.x, y: reference.y };
    }
    if (align === "start" || align === "end") {
      const direction = (rtl && crossAxis === "x" ? -1 : 1) * (align === "end" ? 1 : -1);
      coords[crossAxis] += commonAlign * direction;
    }
    return coords;
  }
  function getInlineOverflow(coords, floating, minX, maxX) {
    return Math.max(minX - coords.x, 0) + Math.max(coords.x + floating.width - maxX, 0);
  }
  function isRTL(element) {
    const direction = "dir" in element ? element.dir : "";
    if (direction === "rtl")
      return true;
    if (direction === "ltr")
      return false;
    const win = element.ownerDocument?.defaultView;
    if (win?.CSS?.supports?.("selector(:dir(rtl))") && typeof element.matches === "function") {
      return element.matches(":dir(rtl)");
    }
    return Boolean(win?.Element && element instanceof win.Element && win.getComputedStyle(element).direction === "rtl");
  }
  var STABLE_SCROLLBAR_MAX_WIDTH = 25;
  var NARROW_INLINE_FLIP_FALLBACK = 128;
  function getViewportBoundary(doc) {
    const win = doc.defaultView;
    if (!win)
      return null;
    const docEl = doc.documentElement;
    const visualViewport = win.visualViewport;
    const x = visualViewport?.offsetLeft || 0;
    const y = visualViewport?.offsetTop || 0;
    let width = visualViewport?.width || docEl.clientWidth || win.innerWidth;
    const height = visualViewport?.height || docEl.clientHeight || win.innerHeight;
    const reserved = doc.compatMode === "BackCompat" ? width - docEl.clientWidth : docEl.clientWidth - docEl.getBoundingClientRect().width;
    if (reserved > 0 && reserved <= STABLE_SCROLLBAR_MAX_WIDTH) {
      const gutter = win.getComputedStyle?.(docEl).scrollbarGutter;
      if (gutter && gutter !== "auto")
        width -= reserved;
    }
    return { x, y, width, height, right: x + width, bottom: y + height };
  }
  function getBoundary(reference, options) {
    return options.scope ? options.scope.getBoundingClientRect() : getViewportBoundary(reference.ownerDocument);
  }
  function clampToBoundary(position, size, start, end, padding) {
    const paddedMin = start + padding;
    const paddedMax = end - size - padding;
    const fitsPadded = paddedMax >= paddedMin;
    const min = fitsPadded ? paddedMin : start;
    const max = fitsPadded ? paddedMax : end - size;
    return Math.max(min, Math.min(position, max));
  }
  function arrowPercent(referenceCenter, boxStart, size) {
    if (!size)
      return 50;
    const percent = (referenceCenter - boxStart) / size * 100;
    return Math.round(Math.min(100, Math.max(0, percent)) * 1000) / 1000;
  }
  function isOutsideBoundary(rect, boundary) {
    return rect.right < boundary.x || rect.left > boundary.right || rect.bottom < boundary.y || rect.top > boundary.bottom;
  }
  function getAvailableHeight(referenceRect, side, boundary, distance, padding) {
    if (side === "top") {
      return Math.max(0, referenceRect.top - boundary.y - distance - padding);
    }
    if (side === "bottom") {
      return Math.max(0, boundary.bottom - referenceRect.bottom - distance - padding);
    }
    return Math.max(0, boundary.height - padding * 2);
  }
  function isVisible(element) {
    if (element.hidden)
      return false;
    if (typeof element.checkVisibility === "function")
      return element.checkVisibility();
    return element.getClientRects().length > 0;
  }
  function getFloatingSize(floating) {
    const width = floating.offsetWidth;
    const height = floating.offsetHeight;
    if (width && height)
      return { width, height };
    const rect = floating.getBoundingClientRect();
    return { width: width || rect.width, height: height || rect.height };
  }
  var trackers = new WeakMap;
  function createTracker(doc) {
    const win = doc.defaultView;
    if (!win)
      throw new TypeError("floating must belong to a document with a browsing context");
    const subscriptions = new Set;
    const pending = new Map;
    const ResizeObserverCtor = win.ResizeObserver;
    let tick = false;
    let listening = false;
    const visualViewport = win.visualViewport;
    function queue(subscription, type) {
      let types = pending.get(subscription);
      if (!types) {
        types = new Set;
        pending.set(subscription, types);
      }
      types.add(type);
    }
    function scheduleFlush() {
      if (tick)
        return;
      tick = true;
      win.requestAnimationFrame(() => {
        const notifications = [...pending];
        pending.clear();
        tick = false;
        for (const [subscription, types] of notifications) {
          if (!subscriptions.has(subscription) || !subscription.floating.isConnected)
            continue;
          for (const type of types)
            subscription.callback({ type });
        }
      });
    }
    function notifyAll(type) {
      for (const subscription of subscriptions)
        queue(subscription, type);
      scheduleFlush();
    }
    function observeSizes(subscription) {
      if (!ResizeObserverCtor)
        return null;
      const primed = new Set;
      const observer = new ResizeObserverCtor((entries) => {
        let changed = false;
        for (const entry of entries) {
          if (primed.has(entry.target))
            changed = true;
          else
            primed.add(entry.target);
        }
        if (!changed)
          return;
        queue(subscription, "element-resize");
        scheduleFlush();
      });
      const { reference, floating } = subscription;
      if (reference)
        observer.observe(reference);
      if (floating !== reference)
        observer.observe(floating);
      return observer;
    }
    const onScroll = () => notifyAll("scroll");
    const onResize = () => notifyAll("resize");
    function startListening() {
      if (listening)
        return;
      doc.addEventListener("scroll", onScroll, { passive: true, capture: true });
      win.addEventListener("resize", onResize, { passive: true });
      visualViewport?.addEventListener("scroll", onScroll, { passive: true });
      visualViewport?.addEventListener("resize", onResize, { passive: true });
      listening = true;
    }
    function stopListening() {
      if (!listening)
        return;
      doc.removeEventListener("scroll", onScroll, { capture: true });
      win.removeEventListener("resize", onResize);
      visualViewport?.removeEventListener("scroll", onScroll);
      visualViewport?.removeEventListener("resize", onResize);
      listening = false;
    }
    return {
      add(reference, floating, callback) {
        const subscription = { reference, floating, callback };
        subscriptions.add(subscription);
        startListening();
        const observer = observeSizes(subscription);
        let stopped = false;
        return () => {
          if (stopped)
            return;
          stopped = true;
          subscriptions.delete(subscription);
          pending.delete(subscription);
          observer?.disconnect();
          if (subscriptions.size === 0)
            stopListening();
        };
      }
    };
  }
  function trackerFor(element) {
    const doc = element.ownerDocument;
    let tracker = trackers.get(doc);
    if (!tracker) {
      tracker = createTracker(doc);
      trackers.set(doc, tracker);
    }
    return tracker;
  }
  function autoUpdate(reference, floating, callback) {
    if (!floating?.ownerDocument) {
      throw new TypeError("autoUpdate() expects a floating HTMLElement");
    }
    if (reference && reference.ownerDocument !== floating.ownerDocument) {
      throw new TypeError("reference and floating must belong to the same document");
    }
    if (typeof callback !== "function")
      throw new TypeError("callback must be a function");
    return trackerFor(floating).add(reference, floating, callback);
  }
  function reposition(reference, floating, options = {}) {
    if (!isVisible(floating))
      return false;
    const placement = options.placement || "bottom-start";
    const distance = options.distance || 0;
    const flip = options.flip !== false;
    const shift = options.shift !== false;
    const shiftPadding = options.shiftPadding ?? 4;
    let { side, align, crossAxis } = parsePlacement(placement);
    const rtl = align ? isRTL(reference) : false;
    const rects = reference.getClientRects();
    const referenceRect = side === "bottom" ? rects[rects.length - 1] : rects[0];
    if (!referenceRect)
      return false;
    const boundary = getBoundary(reference, options);
    if (!boundary || isOutsideBoundary(referenceRect, boundary))
      return false;
    const floatingRect = getFloatingSize(floating);
    let coords = computeCoords(referenceRect, floatingRect, side, align, rtl, distance);
    if (flip) {
      const x = Math.ceil(coords.x);
      const y = Math.ceil(coords.y);
      if (crossAxis === "x" && (y < boundary.y || y + floatingRect.height >= boundary.bottom) || crossAxis === "y" && (x < boundary.x || x + floatingRect.width >= boundary.right)) {
        side = flipSide(side);
        coords = computeCoords(referenceRect, floatingRect, side, align, rtl, distance);
      }
      if (crossAxis === "y" && (coords.x < boundary.x || coords.x + floatingRect.width > boundary.right) && boundary.width - floatingRect.width < NARROW_INLINE_FLIP_FALLBACK) {
        side = "top";
        crossAxis = "x";
        coords = computeCoords(referenceRect, floatingRect, side, align, rtl, distance);
      }
    }
    if (crossAxis === "x" && shift && align) {
      const minX = boundary.x + shiftPadding;
      const maxX = boundary.right - shiftPadding;
      const currentOverflow = getInlineOverflow(coords, floatingRect, minX, maxX);
      if (currentOverflow > 0) {
        const nextAlign = align === "end" ? "start" : "end";
        const candidate = computeCoords(referenceRect, floatingRect, side, nextAlign, rtl, distance);
        if (getInlineOverflow(candidate, floatingRect, minX, maxX) < currentOverflow) {
          align = nextAlign;
          coords = candidate;
        }
      }
    }
    if (shift) {
      coords.x = clampToBoundary(coords.x, floatingRect.width, boundary.x, boundary.right, shiftPadding);
      if (crossAxis === "y") {
        coords.y = clampToBoundary(coords.y, floatingRect.height, boundary.y, boundary.bottom, shiftPadding);
      }
    }
    const arrowX = arrowPercent(referenceRect.x + referenceRect.width / 2, coords.x, floatingRect.width);
    const arrowY = arrowPercent(referenceRect.y + referenceRect.height / 2, coords.y, floatingRect.height);
    const availableHeight = getAvailableHeight(referenceRect, side, boundary, distance, shiftPadding);
    const { style } = floating;
    style.left = `${coords.x}px`;
    style.top = `${coords.y}px`;
    style.setProperty("--arrow-x", `${arrowX}%`);
    style.setProperty("--arrow-y", `${arrowY}%`);
    style.setProperty("--available-height", `${availableHeight}px`);
    floating.dataset.placement = align ? `${side}-${align}` : side;
    return true;
  }

  // src/helpers.js
  function hasOwn(object, key) {
    return Object.hasOwn(object, key);
  }
  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function stripDiacritics(value) {
    return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function normalize(value) {
    return stripDiacritics(value).toLocaleLowerCase();
  }
  function matchesField(value, query, mode) {
    const normalized = normalize(value);
    const lookup = normalize(query);
    switch (String(mode).toLowerCase()) {
      case "startswith":
        return normalized.startsWith(lookup);
      case "fuzzy":
        return fuzzyMatch(normalized, lookup);
      case "pattern":
        return patternMatch(value, query);
      default:
        return normalized.includes(lookup);
    }
  }
  function patternMatch(value, query) {
    try {
      const raw = String(value ?? "");
      const source = String(query ?? "");
      const pattern = new RegExp(source, "i");
      const foldedQuery = stripDiacritics(source);
      const foldedPattern = foldedQuery === source ? pattern : new RegExp(foldedQuery, "i");
      return pattern.test(raw) || foldedPattern.test(stripDiacritics(raw));
    } catch {
      return false;
    }
  }
  function toItem(raw, fields = null) {
    if (raw == null)
      return null;
    if (typeof raw === "string" || typeof raw === "number") {
      return { value: String(raw), label: String(raw) };
    }
    if (fields && (fields.labelField || fields.valueField) && !hasOwn(raw, "value") && !hasOwn(raw, "label")) {
      const value = (fields.valueField && raw[fields.valueField]) ?? raw.id ?? raw.label ?? "";
      const label = (fields.labelField && raw[fields.labelField]) ?? raw.text ?? raw.value ?? raw.id ?? "";
      return { ...raw, value: String(value ?? ""), label: String(label ?? "") };
    } else {
      const value = raw.value ?? raw.id ?? raw.label ?? "";
      const label = raw.label ?? raw.text ?? raw.value ?? raw.id ?? "";
      return { ...raw, value: String(value ?? ""), label: String(label ?? "") };
    }
  }
  function parseSeparators(raw) {
    if (Array.isArray(raw)) {
      return raw.map(String).filter((separator) => separator.length > 0);
    }
    if (raw == null)
      return [];
    return String(raw).split("|").filter((separator) => separator.length > 0);
  }
  function splitTokens(input, separators) {
    const result = {
      done: [],
      rest: String(input ?? "")
    };
    if (!result.rest)
      return result;
    const kinds = parseSeparators(separators).sort((a, b) => b.length - a.length);
    if (!kinds.length)
      return result;
    const pattern = new RegExp(`(${kinds.map(escapeRegExp).join("|")})`, "g");
    const parts = result.rest.split(pattern);
    let buffer = "";
    const done = [];
    for (const part of parts) {
      if (kinds.includes(part)) {
        if (buffer)
          done.push({ text: buffer, sep: part });
        buffer = "";
      } else {
        buffer += part;
      }
    }
    result.done = done;
    result.rest = buffer;
    return result;
  }
  function rankByScore(items, score) {
    return items.map((item, index) => ({ item, index, score: score(item, index) })).filter((entry) => entry.score !== false && entry.score !== null).sort((a, b) => Number(b.score) - Number(a.score) || a.index - b.index).map((entry) => entry.item);
  }
  function reconcileSelected(values, order) {
    const remaining = new Set(values);
    const result = [];
    for (const value of order) {
      if (remaining.has(value)) {
        result.push(value);
        remaining.delete(value);
      }
    }
    result.push(...remaining);
    return result;
  }
  function moveValueInOrder(list, identity, index) {
    const order = [...list];
    const from = order.indexOf(identity);
    if (from < 0)
      return null;
    const to = Math.max(0, Math.min(Number(index), order.length - 1));
    if (from === to)
      return null;
    order.splice(to, 0, ...order.splice(from, 1));
    return { order, from, to };
  }
  function parseList(raw) {
    if (raw == null)
      return [];
    return String(raw).split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  function booleanAttribute(element, name) {
    if (!element.hasAttribute(name))
      return;
    return element.getAttribute(name) !== "false";
  }
  function parseInteger(raw) {
    if (raw == null)
      return;
    const number = Number(raw);
    return Number.isInteger(number) ? number : undefined;
  }
  function fuzzyMatch(str, lookup) {
    const wanted = String(lookup ?? "");
    if (!wanted.trim())
      return true;
    if (str.includes(wanted))
      return true;
    let pos = 0;
    for (const char of wanted) {
      if (char === " ")
        continue;
      const index = str.indexOf(char, pos);
      if (index === -1)
        return false;
      pos = index + char.length;
    }
    return true;
  }

  // src/messages.js
  var DEFAULT_MESSAGES = {
    add: "Add",
    noResults: "No results",
    loading: "Loading…",
    loadError: "Failed to load results",
    create: (query) => `Create “${query}”`,
    remove: (label) => `Remove ${label}`,
    position: (label, position, total) => `${label} position ${position} of ${total}`
  };
  function getDefaultMessages() {
    return { ...DEFAULT_MESSAGES };
  }
  function setDefaultMessages(messages) {
    Object.assign(DEFAULT_MESSAGES, messages);
  }

  // src/results.js
  function matchesItem(combobox, item, query) {
    if (!query)
      return true;
    const input = combobox.input;
    if (typeof combobox.options.match === "function") {
      return combobox.options.match(item, query, {
        combobox,
        source: combobox.source,
        input
      });
    }
    const fields = Array.isArray(combobox.options.searchFields) ? combobox.options.searchFields : combobox.options.searchFields ? [combobox.options.searchFields] : [];
    const values = fields.map((field) => {
      if (field in item)
        return String(item[field] ?? "");
      return String(item.data?.[field] ?? "");
    });
    return values.some((value) => matchesField(value, query, combobox.options.match));
  }
  function shouldLoadRemote(combobox, query) {
    const input = combobox.input;
    if (typeof combobox.options.shouldLoad === "function" && !combobox.options.shouldLoad(query, { combobox, source: combobox.source, input })) {
      return false;
    }
    return typeof combobox.options.load === "function" && query.length >= Number(combobox.options.minChars || 0) && (query.length > 0 || combobox.options.loadOnEmpty);
  }
  function computeFilteredItems(combobox, items, query) {
    const input = combobox.input;
    let visible = items.filter((item) => {
      if (combobox.isMultiple && item.selected)
        return false;
      return matchesItem(combobox, item, query);
    });
    const context = { combobox, source: combobox.source, input };
    if (typeof combobox.options.filter === "function") {
      visible = visible.filter((item) => combobox.options.filter(item, query, context));
    }
    if (typeof combobox.options.score === "function") {
      visible = rankByScore(visible, (item, _index) => combobox.options.score(item, query, context));
    }
    if (typeof combobox.options.sort === "function") {
      visible.sort((a, b) => combobox.options.sort(a, b, query, context));
    }
    return visible;
  }
  function visibleItemsFor(combobox) {
    return combobox.options.maxOptions > 0 ? combobox.filteredItems.slice(0, combobox.options.maxOptions) : combobox.filteredItems;
  }

  // src/source.js
  function selectSourceOf(combobox) {
    if (!(combobox.source instanceof HTMLSelectElement)) {
      throw new TypeError("Expected a select-backed combobox");
    }
    return combobox.source;
  }
  function readSourceItems(combobox) {
    const { source, isSelect, options, datalist } = combobox;
    if (isSelect) {
      return Array.from(selectSourceOf(combobox).options).filter((option) => option.value || options.allowEmptyOption).map((option) => ({
        value: option.value,
        label: option.textContent.trim(),
        disabled: option.disabled || (option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.disabled : false),
        selected: option.selected,
        group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : "",
        option,
        data: { ...option.dataset }
      }));
    }
    if (!datalist)
      return [];
    return Array.from(datalist.options).map((option) => ({
      value: option.value,
      label: option.label || option.value,
      disabled: option.disabled,
      selected: source.value === option.value,
      group: option.dataset.group || "",
      option,
      data: { ...option.dataset }
    }));
  }
  function findOptionByValue(combobox, value) {
    if (!combobox.isSelect)
      return null;
    const select = selectSourceOf(combobox);
    return Array.from(select.options).find((option) => option.value === String(value)) || null;
  }
  function findSelectableOption(combobox, value) {
    if (!combobox.isSelect)
      return null;
    const wanted = String(value);
    return Array.from(selectSourceOf(combobox).options).find((option) => option.value === wanted && !option.disabled && (combobox.isMultiple && option.selected) === false) || null;
  }
  function findCreateMatch(combobox, label) {
    const lookup = normalize(label);
    for (const item of readSourceItems(combobox)) {
      if (normalize(item.value) === lookup || normalize(item.label) === lookup)
        return item;
    }
    return null;
  }
  function fieldsFor(combobox) {
    const { labelField, valueField } = combobox.options;
    return labelField || valueField ? { labelField, valueField } : null;
  }
  function replaceCatalogue(combobox, normalized, { preserveSelected = combobox.isSelect } = {}) {
    const { isSelect, isMultiple, options, datalist } = combobox;
    if (isSelect) {
      const select = selectSourceOf(combobox);
      const preserved = preserveSelected ? Array.from(select.selectedOptions).map((option) => ({
        value: option.value,
        label: option.textContent.trim(),
        selected: true,
        disabled: option.disabled,
        group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : ""
      })) : [];
      const emptyOption = Array.from(select.options).find((option) => !option.value);
      select.replaceChildren();
      if (emptyOption && !isMultiple)
        select.append(emptyOption);
      const catalog = [...preserved, ...normalized];
      const groups = new Map;
      for (const item of catalog) {
        if (!item.value && !options.allowEmptyOption)
          continue;
        const option = new Option(item.label, item.value, Boolean(item.selected), Boolean(item.selected));
        option.disabled = Boolean(item.disabled);
        if (item.data)
          Object.assign(option.dataset, item.data);
        if (item.group) {
          let group = groups.get(item.group);
          if (!group) {
            group = document.createElement("optgroup");
            group.label = item.group;
            groups.set(item.group, group);
            select.append(group);
          }
          group.append(option);
        } else {
          select.append(option);
        }
      }
      return;
    }
    if (!datalist)
      return;
    datalist.replaceChildren();
    for (const item of normalized) {
      const option = document.createElement("option");
      option.value = item.value;
      if (item.label !== item.value)
        option.label = item.label;
      if (item.data)
        Object.assign(option.dataset, item.data);
      datalist.append(option);
    }
  }
  function appendCatalogOption(combobox, item, { selected = false } = {}) {
    const source = selectSourceOf(combobox);
    const option = item.option instanceof HTMLOptionElement ? item.option : new Option(item.label, item.value, false, selected);
    if (!(item.option instanceof HTMLOptionElement)) {
      option.disabled = Boolean(item.disabled);
      if (item.data)
        Object.assign(option.dataset, item.data);
      if (item.group) {
        let group = Array.from(source.children).find((node) => node instanceof HTMLOptGroupElement && node.label === item.group);
        if (!group) {
          group = document.createElement("optgroup");
          group.label = item.group;
          source.append(group);
        }
        group.append(option);
      } else {
        source.add(option);
      }
    }
    if (selected && !option.selected)
      option.selected = true;
    return option;
  }

  // src/combobox.js
  var instances = new WeakMap;
  var uid = 0;
  var openCombobox = null;
  var DEFAULTS = {
    create: false,
    allowEmptyOption: false,
    placeholder: "Search…",
    messages: DEFAULT_MESSAGES,
    match: "includes",
    searchFields: ["label"],
    minChars: 0,
    load: null,
    loadOnEmpty: false,
    shouldLoad: null,
    debounce: 200,
    createFilter: null,
    maxItems: 0,
    maxOptions: 0,
    separators: [],
    tokenize: null,
    closeOnSelect: undefined,
    createOnBlur: false,
    autoselectFirst: false,
    tabSelect: false,
    labelField: undefined,
    valueField: undefined,
    guards: {},
    selectionOrder: "source",
    observeSource: false,
    sort: null,
    score: null,
    filter: null,
    render: {},
    anchor: null
  };
  function supportsModernCombobox() {
    return typeof HTMLElement.prototype.showPopover === "function" && typeof HTMLElement.prototype.hidePopover === "function";
  }
  function emit(target, type, detail = {}, { cancelable = false } = {}) {
    const event = new CustomEvent(type, {
      bubbles: true,
      cancelable,
      detail
    });
    if (hasOwn(detail, "query")) {
      Object.defineProperty(event, "query", {
        configurable: true,
        enumerable: true,
        value: detail.query
      });
    }
    target.dispatchEvent(event);
    return event;
  }
  function wait(ms, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  }
  function setContent(element, content) {
    element.replaceChildren();
    if (content instanceof Node) {
      element.append(content);
    } else if (content !== null && content !== undefined) {
      element.textContent = String(content);
    }
  }
  function createRemoveIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M4 4l12 12m0-12L4 16");
    svg.append(path);
    return svg;
  }
  function captureAttributes(element, names) {
    const original = new Map(names.map((name) => [name, element.getAttribute(name)]));
    return {
      restore() {
        for (const [name, value] of original) {
          if (value === null)
            element.removeAttribute(name);
          else
            element.setAttribute(name, value);
        }
      }
    };
  }
  var INPUT_ATTRS = [
    "list",
    "name",
    "type",
    "autocomplete",
    "spellcheck",
    "placeholder",
    "hidden",
    "tabindex",
    "role",
    "aria-autocomplete",
    "aria-expanded",
    "aria-controls",
    "aria-activedescendant",
    "aria-invalid",
    "aria-label",
    "aria-labelledby",
    "aria-required",
    "aria-describedby",
    "style"
  ];

  class Combobox {
    static supported = supportsModernCombobox();
    static getDefaultMessages() {
      return getDefaultMessages();
    }
    static setDefaultMessages(messages) {
      setDefaultMessages(messages);
    }
    static init(rootOrSelector = document, selectorOrOptions = null, maybeOptions = {}) {
      const targets = [];
      let options = {};
      const isNode = (value) => value instanceof Node;
      const picks = (value) => value !== null && typeof value === "object" && !isNode(value) && !Array.isArray(value) ? value : {};
      if (typeof rootOrSelector === "string") {
        targets.push(...document.querySelectorAll(rootOrSelector));
        options = picks(selectorOrOptions);
      } else if (isNode(rootOrSelector)) {
        const root = rootOrSelector;
        if (typeof selectorOrOptions === "string") {
          targets.push(...root.querySelectorAll(selectorOrOptions));
          options = maybeOptions;
        } else {
          options = picks(selectorOrOptions);
        }
      } else {
        targets.push(...Array.from(rootOrSelector ?? []));
        options = picks(selectorOrOptions);
      }
      const instances2 = [];
      for (const element of targets) {
        if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement))
          continue;
        const instance = Combobox.getOrCreateInstance(element, options);
        if (instance && !instances2.includes(instance))
          instances2.push(instance);
      }
      return instances2;
    }
    static getInstance(element) {
      return instances.get(element) ?? null;
    }
    static getOrCreateInstance(element, options = {}) {
      return Combobox.getInstance(element) ?? new Combobox(element, options);
    }
    constructor(element, options = {}) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
        throw new TypeError("Combobox expects an input or select element");
      }
      this.source = element;
      this.isSelect = element instanceof HTMLSelectElement;
      this.isMultiple = this.isSelect && element.multiple;
      this.abortController = new AbortController;
      this.loadController = null;
      this.activeIndex = -1;
      this.filteredItems = [];
      this.results = null;
      this.selectionOrder = this.isSelect ? Array.from(this.#selectSource().selectedOptions) : [];
      this._chipOptions = new WeakMap;
      this.searchGeneration = 0;
      this.nextCursor = null;
      this.loading = false;
      this.loadError = null;
      this.query = "";
      this.id = ++uid;
      this.mode = options.mode === "fallback" || !Combobox.supported ? "fallback" : "enhanced";
      this.suppressReopen = false;
      this.composing = false;
      this._sourceObserver = null;
      this._sourceSyncTimer = null;
      this.explicitOptions = options;
      this.options = {
        ...DEFAULTS,
        ...options,
        messages: {
          ...DEFAULT_MESSAGES,
          ...options.messages || {}
        },
        render: {
          ...DEFAULTS.render,
          ...options.render || {}
        }
      };
      this.original = {
        filterInputPlaceholder: null,
        inventedLabels: []
      };
      this.boundLabels = [];
      this.ownsInput = false;
      this.fallbackControl = null;
      this.control = null;
      this.anchor = null;
      this.stopAutoUpdate = null;
      this.input = null;
      this.chips = null;
      this.datalist = null;
      this.inputSnapshot = null;
      this.sourceSnapshot = null;
      this.popover = null;
      this.listbox = null;
      this.status = null;
      if (this.mode === "fallback") {
        this.#initFallback();
      } else {
        try {
          const view = element instanceof HTMLSelectElement ? this.#enhanceSelect(element) : this.#enhanceInput(element);
          this.control = view.control;
          this.input = view.input;
          this.chips = view.chips;
          this.datalist = view.datalist;
          this.inputSnapshot = view.inputSnapshot;
          this.sourceSnapshot = view.sourceSnapshot;
          const requestedAnchor = this.options.anchor;
          this.anchor = requestedAnchor instanceof HTMLElement ? requestedAnchor : view.control || view.input;
          const picker = this.#createPicker();
          this.popover = picker.popover;
          this.listbox = picker.listbox;
          this.status = picker.status;
          this.#bind();
          this.refresh();
          this.#watchSource();
        } catch (error) {
          this.dispose();
          throw error;
        }
      }
      instances.set(element, this);
    }
    #selectSource() {
      return selectSourceOf(this);
    }
    #inputEl() {
      return this.input;
    }
    #popoverEl() {
      return this.popover;
    }
    #listEl() {
      return this.listbox;
    }
    #statusEl() {
      return this.status;
    }
    #chipsEl() {
      return this.chips;
    }
    #initFallback() {
      if (!this.isSelect || !this.options.create)
        return;
      const control = document.createElement("div");
      control.className = "cb-fallback-create";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "cb-fallback-input";
      input.placeholder = this.options.placeholder ?? "";
      input.autocomplete = "off";
      input.setAttribute("aria-label", this.options.placeholder ?? "");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cb-fallback-add";
      button.textContent = this.options.messages.add ?? "Add";
      const add = async () => {
        const label = input.value.trim();
        if (!label)
          return;
        if (await this.#createFallbackOption(label, input))
          input.value = "";
        input.focus();
      };
      button.addEventListener("click", add, { signal: this.abortController.signal });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          add();
        }
      }, { signal: this.abortController.signal });
      control.append(input, button);
      this.source.after(control);
      this.fallbackControl = control;
    }
    async#createFallbackOption(label, input) {
      if (!this.#canCreate(label, input))
        return null;
      const existing = this.#findCreateMatch(label);
      if (existing) {
        const option = existing.option;
        if (option && !option.disabled) {
          if (!option.selected) {
            option.selected = true;
            this.#rememberSelection(option);
            this.#dispatchNativeValueEvents();
          }
        }
        return option ?? null;
      }
      const item = await this.#materializeCreated(label, input, { fallback: true });
      return item?.option ?? null;
    }
    #enhanceInput(source) {
      const listId = source.getAttribute("list");
      if (!listId)
        throw new TypeError("Input combobox expects an input with a datalist");
      const datalist = document.getElementById(listId);
      if (!(datalist instanceof HTMLDataListElement)) {
        throw new TypeError(`No datalist found for #${listId}`);
      }
      const inputSnapshot = captureAttributes(source, INPUT_ATTRS);
      if (!source.placeholder)
        source.placeholder = this.options.placeholder ?? "";
      source.removeAttribute("list");
      source.autocomplete = "off";
      source.classList.add("cb-text-control");
      return {
        control: null,
        input: source,
        chips: null,
        datalist,
        inputSnapshot,
        sourceSnapshot: null
      };
    }
    #enhanceSelect(source) {
      source.classList.add("cb-source-hidden");
      const sourceSnapshot = captureAttributes(source, ["aria-hidden", "tabindex"]);
      source.tabIndex = -1;
      source.setAttribute("aria-hidden", "true");
      const control = document.createElement("div");
      control.className = `cb-control ${this.isMultiple ? "cb-control-multiple" : "cb-control-single"}`;
      const chips = document.createElement("span");
      chips.className = "cb-chips";
      control.append(chips);
      const { input, inputSnapshot } = this.#resolveFilterInput();
      input.classList.add("cb-input");
      input.type = "text";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.removeAttribute("name");
      if (!input.placeholder)
        input.placeholder = this.options.placeholder ?? "";
      this.#copyAccessibleName(input);
      control.append(input);
      source.after(control);
      return {
        control,
        input,
        chips,
        datalist: null,
        inputSnapshot,
        sourceSnapshot
      };
    }
    #resolveFilterInput() {
      let input = null;
      if (this.source.id) {
        input = document.querySelector(`input[data-filter-for="${CSS.escape(this.source.id)}"]`);
      }
      if (input instanceof HTMLInputElement) {
        const inputSnapshot = captureAttributes(input, INPUT_ATTRS);
        const filterInputPlaceholder = document.createComment(`combobox-filter-input-${this.id}`);
        this.original.filterInputPlaceholder = filterInputPlaceholder;
        input.before(filterInputPlaceholder);
        input.hidden = false;
        return { input, inputSnapshot };
      }
      this.ownsInput = true;
      return { input: document.createElement("input"), inputSnapshot: null };
    }
    #copyAccessibleName(input) {
      const labelledBy = this.source.getAttribute("aria-labelledby");
      if (labelledBy) {
        input.setAttribute("aria-labelledby", labelledBy);
      } else {
        this.#copyLabeledNames(input);
      }
      const ariaLabel = this.source.getAttribute("aria-label");
      if (!input.hasAttribute("aria-labelledby") && ariaLabel) {
        input.setAttribute("aria-label", ariaLabel);
      }
      if (this.source.required)
        input.setAttribute("aria-required", "true");
      const describedBy = this.source.getAttribute("aria-describedby");
      if (describedBy) {
        input.setAttribute("aria-describedby", describedBy);
      }
    }
    #copyLabeledNames(input) {
      const labels = [];
      if (this.source.id) {
        labels.push(...document.querySelectorAll(`label[for="${CSS.escape(this.source.id)}"]`));
      }
      const wrapped = this.source.closest("label");
      if (wrapped)
        labels.push(wrapped);
      const seen = new Set;
      this.boundLabels = labels.filter((label) => {
        if (seen.has(label))
          return false;
        seen.add(label);
        return true;
      });
      const labelIds = this.boundLabels.map((label, index) => {
        if (!label.id) {
          label.id = `combobox-label-${this.id}-${index}`;
          this.original.inventedLabels.push({ label, id: label.id });
        }
        return label.id;
      });
      if (labelIds.length)
        input.setAttribute("aria-labelledby", labelIds.join(" "));
    }
    #sourceItems() {
      return readSourceItems(this);
    }
    #items() {
      if (!this.results)
        return this.#sourceItems();
      if (!this.isSelect)
        return this.results;
      return this.results.map((item) => {
        const option = item.option || this.#findOption(item.value);
        return { ...item, selected: option?.selected ?? false, option };
      });
    }
    #fields() {
      return fieldsFor(this);
    }
    get visibleItems() {
      return visibleItemsFor(this);
    }
    setResults(items) {
      this.results = Array.from(items || [], (item) => toItem(item, this.#fields())).filter((item) => item !== null);
      return this;
    }
    clearResults() {
      this.results = null;
      this.loadError = null;
      return this;
    }
    #findOption(value) {
      return findOptionByValue(this, value);
    }
    #findSelectableOption(value) {
      return findSelectableOption(this, value);
    }
    #findCreateMatch(label) {
      return findCreateMatch(this, label);
    }
    setOptions(items, { preserveSelected = this.isSelect } = {}) {
      const normalized = Array.from(items || [], (item) => toItem(item, this.#fields())).filter((item) => item !== null);
      replaceCatalogue(this, normalized, { preserveSelected });
      this.clearResults();
      if (this.mode === "enhanced")
        this.refresh();
      this.#markEngineMutation();
      return this;
    }
    sync() {
      this.clearResults();
      this.refresh();
      return this;
    }
    #markEngineMutation() {
      if (this._sourceSyncTimer) {
        clearTimeout(this._sourceSyncTimer);
        this._sourceSyncTimer = null;
      }
      this._sourceObserver?.disconnect();
      this._sourceObserver = null;
      queueMicrotask(() => {
        if (instances.get(this.source) === this && this.options.observeSource && this.mode === "enhanced") {
          this.#watchSource();
        }
      });
    }
    #watchSource() {
      if (!this.options.observeSource || this._sourceObserver)
        return;
      const config = this.isSelect ? {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["selected", "disabled", "required", "readonly"]
      } : {
        childList: true,
        attributes: true,
        attributeFilter: ["value", "disabled", "label"]
      };
      this._sourceObserver = new MutationObserver(() => this.#scheduleSourceSync());
      const target = this.isSelect ? this.source : this.datalist;
      if (target)
        this._sourceObserver.observe(target, config);
    }
    #scheduleSourceSync() {
      if (this._sourceSyncTimer)
        clearTimeout(this._sourceSyncTimer);
      this._sourceSyncTimer = setTimeout(() => {
        this._sourceSyncTimer = null;
        if (instances.get(this.source) !== this)
          return;
        this.sync();
      }, 50);
    }
    #createPicker() {
      const popover = document.createElement("div");
      popover.className = "cb-popover";
      popover.popover = "manual";
      const listbox = document.createElement("div");
      listbox.className = "cb-listbox";
      listbox.role = "listbox";
      listbox.id = `combobox-listbox-${this.id}`;
      if (this.isMultiple)
        listbox.setAttribute("aria-multiselectable", "true");
      const status = document.createElement("div");
      status.className = "cb-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      popover.append(listbox, status);
      const dialog = this.source.closest("dialog");
      (dialog || document.body).append(popover);
      popover.style.font = getComputedStyle(this.#inputEl()).font;
      this.#inputEl().setAttribute("role", "combobox");
      this.#inputEl().setAttribute("aria-autocomplete", "list");
      this.#inputEl().setAttribute("aria-expanded", "false");
      this.#inputEl().setAttribute("aria-controls", listbox.id);
      return { popover, listbox, status };
    }
    #positionPicker() {
      const anchor = this.anchor || this.control || this.#inputEl();
      const popover = this.#popoverEl();
      const width = anchor.getBoundingClientRect().width;
      popover.style.inlineSize = `${width}px`;
      return reposition(anchor, popover, {
        placement: "bottom-start",
        distance: 4,
        flip: true,
        shift: true
      });
    }
    #startAutoUpdate() {
      this.stopAutoUpdate?.();
      const anchor = this.anchor || this.control || this.#inputEl();
      this.stopAutoUpdate = autoUpdate(anchor, this.#popoverEl(), () => {
        this.#positionPicker();
      });
    }
    #bind() {
      const signal = this.abortController.signal;
      this.#inputEl().addEventListener("focus", this, { signal });
      this.#inputEl().addEventListener("input", this, { signal });
      this.#inputEl().addEventListener("compositionstart", this, { signal });
      this.#inputEl().addEventListener("compositionend", this, { signal });
      this.#inputEl().addEventListener("keydown", this, { signal });
      this.#inputEl().addEventListener("blur", this, { signal });
      this.#listEl().addEventListener("pointerdown", (event) => event.preventDefault(), { signal });
      this.#listEl().addEventListener("pointermove", this, { signal });
      this.#listEl().addEventListener("click", this, { signal });
      if (this.chips) {
        this.chips.addEventListener("keydown", this, { signal });
        this.chips.addEventListener("click", this, { signal });
      }
      this.control?.addEventListener("click", this, { signal });
      document.addEventListener("pointerdown", (event) => {
        if (!this.isOpen())
          return;
        const path = event.composedPath();
        const control = this.anchor || this.control || this.#inputEl();
        if (path.includes(control) || path.includes(this.#popoverEl()))
          return;
        this.hide();
      }, { capture: true, signal });
      this.#popoverEl().addEventListener("toggle", (event) => {
        const open = event.newState === "open";
        this.#inputEl().setAttribute("aria-expanded", String(open));
        emit(this.source, open ? "combobox:open" : "combobox:close", { combobox: this });
        if (!open) {
          this.stopAutoUpdate?.();
          this.stopAutoUpdate = null;
          this.#setActive(-1);
          if (this.isSelect && !this.isMultiple)
            this.#syncSingleLabel();
        } else {
          this.#positionPicker();
          this.#startAutoUpdate();
        }
      }, { signal });
      if (this.isSelect) {
        this.source.addEventListener("change", () => this.refresh(), { signal });
        this.source.addEventListener("focus", () => this.#inputEl().focus(), { signal });
        for (const label of this.boundLabels) {
          label.addEventListener("click", (event) => {
            event.preventDefault();
            this.#inputEl().focus();
          }, { signal });
        }
        if (this.isMultiple && this.options.selectionOrder === "selected" && this.source.name && this.source.form) {
          this.source.form.addEventListener("formdata", (event) => {
            event.formData.delete(this.source.name);
            for (const value of this.getSelectedValues())
              event.formData.append(this.source.name, value);
          }, { signal });
        }
        this.source.addEventListener("invalid", (event) => {
          event.preventDefault();
          this.#inputEl().setAttribute("aria-invalid", "true");
          this.#inputEl().focus();
        }, { signal });
      }
      this.source.form?.addEventListener("reset", () => queueMicrotask(() => {
        if (instances.get(this.source) !== this)
          return;
        this.searchGeneration++;
        this.loadController?.abort();
        this.loading = false;
        this.nextCursor = null;
        this.clearResults();
        if (this.isSelect)
          this.#inputEl().value = "";
        this.query = this.isSelect ? "" : this.source.value;
        this.refresh();
      }), { signal });
    }
    handleEvent(event) {
      if (event.currentTarget === this.#inputEl())
        return this.#onInputEvent(event);
      if (event.currentTarget === this.control)
        return this.#onControlEvent(event);
      if (event.currentTarget === this.#listEl())
        return this.#onListboxEvent(event);
      if (event.currentTarget === this.chips)
        return this.#onChipsEvent(event);
    }
    #onInputEvent(event) {
      switch (event.type) {
        case "focus": {
          if (this.isSelect && !this.isMultiple && this.#selectSource().selectedOptions.length)
            this.#inputEl().select();
          const query = this.isSelect && !this.isMultiple ? "" : this.#inputEl().value;
          this.search(query, { show: true, reason: "focus" });
          return;
        }
        case "input": {
          const inputEvent = event;
          if (this.isMultiple && !inputEvent.isComposing && this.#separatorsActive()) {
            this.#handleTokenInput();
            return;
          }
          this.search(this.#inputEl().value, { show: true, reason: "input" });
          return;
        }
        case "compositionstart":
          this.composing = true;
          return;
        case "compositionend":
          this.composing = false;
          return;
        case "keydown":
          return this.#onInputKeyDown(event);
        case "blur":
          return this.#onInputBlur();
      }
    }
    #onControlEvent(event) {
      const target = event.target;
      if (target.closest("button"))
        return;
      this.#inputEl().focus();
    }
    #onListboxEvent(event) {
      const target = event.target;
      if (event.type === "pointermove") {
        const option = target.closest(".cb-option[data-index]");
        if (option)
          this.#setActive(Number(option.dataset.index));
        return;
      }
      if (event.type === "click") {
        const option = target.closest(".cb-option");
        if (!option)
          return;
        if (option.classList.contains("cb-create")) {
          const query = this.#inputEl().value.trim();
          if (query)
            this.#createItem(query);
          return;
        }
        const item = this.visibleItems[Number(option.dataset.index)];
        if (item)
          this.#selectItem(item);
      }
    }
    #onChipsEvent(event) {
      const target = event.target;
      if (event.type === "click") {
        const remove = target.closest(".cb-chip-remove");
        if (!remove)
          return;
        const chip = remove.closest(".cb-chip");
        if (!chip)
          return;
        const option = this._chipOptions.get(chip);
        this.remove(option ?? chip.dataset.value ?? "").then((removed) => {
          if (removed)
            this.#inputEl().focus();
        });
        return;
      }
      if (event.type === "keydown") {
        const chip = target.closest(".cb-chip");
        if (!chip)
          return;
        const option = this._chipOptions.get(chip);
        const item = option ? this.getSelectedItems().find((entry) => entry.option === option) || {
          value: option.value,
          label: option.textContent.trim(),
          option
        } : { value: chip.dataset.value ?? "", label: chip.dataset.value ?? "" };
        this.#onChipKeyDown(event, item);
      }
    }
    #onInputBlur() {
      queueMicrotask(async () => {
        const active = document.activeElement;
        const stillInside = active === this.#inputEl() || (this.#popoverEl()?.contains(active) ?? false) || this.anchor && active && this.anchor.contains(active) || this.control && active && this.control.contains(active);
        if (this.isOpen() && stillInside)
          return;
        if (this.isOpen() || this.options.createOnBlur) {
          if (this.isSelect && this.isMultiple && this.options.createOnBlur && !this.composing) {
            const value = this.#inputEl().value;
            this.suppressReopen = true;
            try {
              if (this.#separatorsActive()) {
                const result = await this.#processTokens(value, { final: true });
                if (result?.consumed)
                  this.#inputEl().value = result.rest;
              } else if (value.trim()) {
                this.#inputEl().value = "";
                await this.#createItem(value.trim());
              }
            } finally {
              this.suppressReopen = false;
            }
            this.refresh();
          }
          if (this.isSelect && !this.isMultiple)
            this.#syncSingleLabel();
          this.hide();
        }
      });
    }
    #onInputKeyDown(event) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!this.isOpen())
          this.search(this.#inputEl().value, { show: true, reason: "keyboard" });
        this.#moveActive(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!this.isOpen())
          this.search(this.#inputEl().value, { show: true, reason: "keyboard" });
        this.#moveActive(-1);
        return;
      }
      if (event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
        if (!this.isOpen())
          this.search(this.#inputEl().value, { show: true, reason: "keyboard" });
        const down = event.key === "PageDown";
        const base = this.activeIndex < 0 ? down ? -1 : 0 : this.activeIndex;
        const distance = base + (down ? this.#pageSize() : -this.#pageSize());
        this.#setActive(this.#nearestSelectable(distance, down ? 1 : -1));
        return;
      }
      if (event.key === "Enter" && this.isOpen()) {
        if (event.isComposing || this.composing)
          return;
        if (this.isMultiple && this.#separatorsActive()) {
          const tokenCommit = this.#resolveTokenCommit();
          if (tokenCommit) {
            event.preventDefault();
            this.#commitEnterTokens(tokenCommit);
            return;
          }
        }
        const active = this.visibleItems[this.activeIndex];
        if (active) {
          event.preventDefault();
          this.#selectItem(active);
        } else if (this.#canCreate(this.#inputEl().value, this.#inputEl())) {
          event.preventDefault();
          this.#createItem(this.#inputEl().value.trim());
        }
        return;
      }
      if (event.key === "Tab" && this.isOpen()) {
        if (this.options.tabSelect) {
          if (event.isComposing || this.composing)
            return;
          if (this.isMultiple && this.#separatorsActive()) {
            const tokenCommit = this.#resolveTokenCommit();
            if (tokenCommit) {
              event.preventDefault();
              this.#commitEnterTokens(tokenCommit);
              return;
            }
          }
          const active = this.visibleItems[this.activeIndex];
          if (active) {
            event.preventDefault();
            this.#selectItem(active);
            return;
          }
          if (this.#canCreate(this.#inputEl().value, this.#inputEl())) {
            event.preventDefault();
            this.#createItem(this.#inputEl().value.trim());
            return;
          }
          this.hide();
          return;
        }
        this.hide();
        return;
      }
      if (event.key === "Escape" && this.isOpen()) {
        event.preventDefault();
        this.hide();
        return;
      }
      if (event.key === "ArrowLeft" && this.isMultiple && !this.#inputEl().value) {
        const chips = Array.from(this.chips?.querySelectorAll(".cb-chip") || []);
        if (chips.length) {
          event.preventDefault();
          chips[chips.length - 1].focus();
          return;
        }
      }
      if (event.key === "Backspace" && this.isMultiple && !this.#inputEl().value && this.#selectSource().selectedOptions.length) {
        const selected = this.#selectedOptionsInOrder();
        const last = selected[selected.length - 1];
        if (last && !last.disabled)
          this.remove(last);
      }
    }
    async search(query = "", { show = false, reason = "api" } = {}) {
      if (this.mode !== "enhanced")
        return;
      const generation = ++this.searchGeneration;
      this.query = String(query ?? "");
      const before = emit(this.#inputEl(), "beforefilter", {
        query: this.query,
        combobox: this,
        source: this.source,
        reason
      }, { cancelable: true });
      if (before.defaultPrevented)
        return;
      if (this.#shouldLoad(this.query)) {
        await this.#load(this.query, { debounce: reason === "input" });
        if (generation !== this.searchGeneration)
          return;
      } else {
        if (typeof this.options.load === "function")
          this.clearResults();
      }
      this.#applyFilter(this.query);
      emit(this.#inputEl(), "filter", {
        query: this.query,
        combobox: this,
        items: this.filteredItems,
        source: this.source
      });
      if (show)
        this.show();
    }
    setQuery(value, { show = true, reason = "api" } = {}) {
      const query = String(value ?? "");
      if (this.mode === "fallback") {
        this.query = query;
        if (!this.isSelect)
          this.source.value = query;
        return Promise.resolve();
      }
      this.#inputEl().value = query;
      return this.search(query, { show, reason });
    }
    clearQuery({ show = false, reason = "api" } = {}) {
      return this.setQuery("", { show, reason });
    }
    applyFilter(query = "", { show = false } = {}) {
      if (this.mode !== "enhanced")
        return this;
      this.query = String(query ?? "");
      this.#applyFilter(this.query);
      emit(this.#inputEl(), "filter", {
        query: this.query,
        combobox: this,
        items: this.filteredItems,
        source: this.source,
        manual: true
      });
      if (show)
        this.show();
      return this;
    }
    #shouldLoad(query) {
      return shouldLoadRemote(this, query);
    }
    async#load(query, { cursor = null, append = false, debounce = false } = {}) {
      this.loadController?.abort();
      this.loadController = new AbortController;
      const signal = this.loadController.signal;
      this.loadError = null;
      if (debounce && Number(this.options.debounce) > 0) {
        try {
          await wait(Number(this.options.debounce), signal);
        } catch {
          return;
        }
      }
      const before = emit(this.source, "combobox:beforeload", {
        query,
        cursor,
        combobox: this,
        signal
      }, { cancelable: true });
      if (before.defaultPrevented)
        return;
      this.loading = true;
      this.#renderLoading();
      this.show();
      try {
        const result = await this.options.load(query, {
          signal,
          cursor,
          combobox: this,
          source: this.source,
          input: this.#inputEl()
        });
        if (signal.aborted)
          return;
        const items = Array.isArray(result) ? result : result?.items;
        if (items) {
          const merged = append && this.results ? [...this.results, ...items] : items;
          this.setResults(merged);
        }
        this.nextCursor = Array.isArray(result) ? null : result?.cursor ?? null;
        emit(this.source, "combobox:load", {
          query,
          combobox: this,
          result
        });
      } catch (error) {
        const caught = error;
        if (signal.aborted || caught?.name === "AbortError")
          return;
        this.loadError = caught;
        emit(this.source, "combobox:loaderror", {
          query,
          combobox: this,
          error: caught
        });
      } finally {
        if (!signal.aborted)
          this.loading = false;
      }
    }
    #applyFilter(query) {
      const items = this.#items();
      const visible = computeFilteredItems(this, items, query);
      this.filteredItems = visible;
      const visibleOptions = new Set(visible.map((item) => item.option));
      for (const item of items) {
        item.option?.toggleAttribute("data-filtered", !visibleOptions.has(item.option));
      }
      this.#renderList();
      this.#setActive(this.options.autoselectFirst ? this.visibleItems.findIndex((item) => !item.disabled) : -1);
    }
    #canCreate(label, input) {
      const value = String(label ?? "").trim();
      if (!this.isSelect || !this.options.create || !value)
        return false;
      if (this.options.maxItems > 0 && this.isMultiple && this.#selectSource().selectedOptions.length >= this.options.maxItems)
        return false;
      if (typeof this.options.createFilter === "function") {
        return this.options.createFilter(value, { combobox: this, source: this.source, input }) !== false;
      }
      return true;
    }
    #renderList() {
      this.#listEl().replaceChildren();
      this.#statusEl().textContent = "";
      if (this.loading) {
        this.#renderLoading();
        return;
      }
      if (this.loadError) {
        this.#renderError();
        return;
      }
      let currentGroup = null;
      let currentGroupName = null;
      for (const [index, item] of this.visibleItems.entries()) {
        if (item.group) {
          if (!currentGroup || item.group !== currentGroupName) {
            currentGroup = document.createElement("div");
            currentGroup.className = "cb-option-group";
            currentGroup.role = "group";
            const group = document.createElement("div");
            group.className = "cb-group";
            group.id = `combobox-group-${this.id}-${index}`;
            group.setAttribute("role", "presentation");
            setContent(group, this.options.render.group?.(item.group, { combobox: this }) ?? item.group);
            currentGroup.setAttribute("aria-labelledby", group.id);
            currentGroup.append(group);
            this.#listEl().append(currentGroup);
            currentGroupName = item.group;
          }
        } else {
          currentGroup = null;
          currentGroupName = null;
        }
        const option = document.createElement("div");
        option.className = "cb-option";
        option.id = `combobox-option-${this.id}-${index}`;
        option.role = "option";
        option.tabIndex = -1;
        option.dataset.index = String(index);
        option.setAttribute("aria-selected", String(Boolean(item.selected)));
        if (item.option?.title || item.title)
          option.title = item.option?.title ?? item.title ?? "";
        if (item.disabled) {
          option.setAttribute("aria-disabled", "true");
        }
        const rendered = this.options.render.option?.(item, {
          query: this.query,
          selected: item.selected,
          combobox: this
        });
        const label = document.createElement("span");
        label.className = "cb-option-label";
        setContent(label, rendered ?? item.label);
        option.append(label);
        (currentGroup || this.#listEl()).append(option);
      }
      if (!this.filteredItems.length) {
        if (this.#canCreate(this.#inputEl().value, this.#inputEl())) {
          const create = document.createElement("div");
          create.className = "cb-option cb-create";
          create.tabIndex = -1;
          create.role = "option";
          const query = this.#inputEl().value.trim();
          const rendered = this.options.render.create?.(query, { combobox: this });
          const createLabel = document.createElement("span");
          createLabel.className = "cb-option-label";
          setContent(createLabel, rendered ?? this.options.messages.create?.(query, {
            combobox: this,
            source: this.source,
            input: this.#inputEl()
          }) ?? query);
          create.append(createLabel);
          this.#listEl().append(create);
        } else {
          const empty = document.createElement("div");
          empty.className = "cb-empty";
          const rendered = this.options.render.noResults?.(this.query, { combobox: this });
          setContent(empty, rendered ?? this.options.messages.noResults);
          this.#listEl().append(empty);
          this.#statusEl().textContent = this.options.messages.noResults ?? "";
        }
      }
    }
    #renderLoading() {
      this.#listEl().replaceChildren();
      this.#setActive(-1);
      const loading = document.createElement("div");
      loading.className = "cb-empty cb-loading";
      const rendered = this.options.render.loading?.(this.query, { combobox: this });
      setContent(loading, rendered ?? this.options.messages.loading);
      this.#listEl().append(loading);
      this.#statusEl().textContent = this.options.messages.loading ?? "";
    }
    #renderError() {
      this.#listEl().replaceChildren();
      this.#setActive(-1);
      const error = document.createElement("div");
      error.className = "cb-empty cb-error";
      const rendered = this.options.render.error?.(this.query, { error: this.loadError, combobox: this });
      setContent(error, rendered ?? this.options.messages.loadError);
      this.#listEl().append(error);
      this.#statusEl().textContent = this.options.messages.loadError ?? "";
    }
    #renderChips() {
      const chips = this.#chipsEl();
      if (!chips)
        return;
      chips.replaceChildren();
      for (const option of this.#selectedOptionsInOrder()) {
        const placeholder = option.disabled && option.hidden;
        if (!option.value && (!this.options.allowEmptyOption || placeholder))
          continue;
        const item = {
          value: option.value,
          label: option.textContent.trim(),
          selected: true,
          disabled: option.disabled,
          option,
          data: { ...option.dataset }
        };
        const chip = document.createElement("span");
        chip.className = "cb-chip";
        chip.tabIndex = -1;
        chip.dataset.value = item.value;
        this._chipOptions.set(chip, option);
        if (option.title)
          chip.title = option.title;
        const label = document.createElement("span");
        label.className = "cb-chip-label";
        const rendered = this.options.render.item?.(item, { combobox: this });
        setContent(label, rendered ?? item.label);
        chip.append(label);
        if (!option.disabled && !this.source.disabled) {
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "cb-chip-remove";
          remove.append(createRemoveIcon());
          remove.setAttribute("aria-label", this.options.messages.remove?.(item.label, {
            combobox: this,
            source: this.source,
            input: this.#inputEl()
          }) ?? `Remove ${item.label}`);
          chip.append(remove);
        }
        chips.append(chip);
      }
    }
    #selectedOptionsInOrder() {
      const selected = Array.from(this.#selectSource().selectedOptions);
      if (this.options.selectionOrder !== "selected")
        return selected;
      return reconcileSelected(selected, this.selectionOrder);
    }
    #rememberSelection(option) {
      if (!this.selectionOrder.includes(option))
        this.selectionOrder.push(option);
    }
    #forgetSelection(option) {
      const index = this.selectionOrder.indexOf(option);
      if (index >= 0)
        this.selectionOrder.splice(index, 1);
    }
    #onChipKeyDown(event, item) {
      const chips = Array.from(this.#chipsEl()?.querySelectorAll(".cb-chip") || []);
      const current = event.target instanceof HTMLElement ? event.target.closest(".cb-chip") : null;
      const index = current ? chips.indexOf(current) : -1;
      if (event.altKey && index >= 0 && this.options.selectionOrder === "selected") {
        const target = event.key === "ArrowLeft" ? index - 1 : event.key === "ArrowRight" ? index + 1 : event.key === "Home" ? 0 : event.key === "End" ? chips.length - 1 : index;
        if (target !== index && target >= 0 && target < chips.length) {
          event.preventDefault();
          this.#reorderChip(item, target);
          return;
        }
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
        event.preventDefault();
        let next = index;
        if (event.key === "ArrowLeft")
          next = Math.max(0, index - 1);
        if (event.key === "ArrowRight")
          next = index + 1;
        if (event.key === "Home")
          next = 0;
        if (event.key === "End")
          next = chips.length - 1;
        if (next >= chips.length)
          this.#inputEl().focus();
        else
          chips[next]?.focus();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        this.remove(item.option ?? item.value).then((removed) => {
          if (!removed)
            return;
          queueMicrotask(() => {
            const remaining = Array.from(this.#chipsEl()?.querySelectorAll(".cb-chip") || []);
            remaining[Math.min(index, remaining.length - 1)]?.focus();
            if (!remaining.length)
              this.#inputEl().focus();
          });
        });
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this.#inputEl().focus();
      }
    }
    #reorderChip(item, target) {
      const identity = item.option ?? item.value;
      if (!this.move(identity, target))
        return;
      const chips = Array.from(this.#chipsEl()?.querySelectorAll(".cb-chip") || []);
      const chip = item.option ? chips.find((candidate) => this._chipOptions.get(candidate) === item.option) : chips.find((candidate) => candidate.dataset.value === item.value);
      chip?.focus();
      this.#statusEl().textContent = this.options.messages.position?.(item.label, chips.indexOf(chip) + 1, chips.length, { combobox: this, source: this.source, input: this.#inputEl() }) ?? "";
    }
    #moveActive(delta) {
      const visible = this.visibleItems;
      if (!visible.length)
        return;
      let next = this.activeIndex < 0 ? delta > 0 ? -1 : 0 : this.activeIndex;
      for (let checked = 0;checked < visible.length; checked++) {
        next = (next + delta + visible.length) % visible.length;
        if (!visible[next].disabled) {
          this.#setActive(next);
          return;
        }
      }
    }
    #nearestSelectable(from, direction) {
      const visible = this.visibleItems;
      const len = visible.length;
      if (!len)
        return -1;
      from = Math.max(0, Math.min(from, len - 1));
      for (let i = from;i >= 0 && i < len; i += direction) {
        if (!visible[i]?.disabled)
          return i;
      }
      if (direction > 0) {
        for (let i = from - 1;i >= 0; i--)
          if (!visible[i]?.disabled)
            return i;
      } else {
        for (let i = from + 1;i < len; i++)
          if (!visible[i]?.disabled)
            return i;
      }
      return -1;
    }
    #pageSize() {
      const first = this.#listEl().querySelector(".cb-option");
      if (!first)
        return 1;
      const row = first.offsetHeight || 48;
      const view = this.#popoverEl().clientHeight || 0;
      return Math.max(1, Math.floor(view / row));
    }
    #setActive(index) {
      if (index >= this.visibleItems.length)
        index = -1;
      this.activeIndex = index;
      for (const item of this.#sourceItems())
        item.option?.removeAttribute("data-active-option");
      for (const option of this.#listEl().querySelectorAll(".cb-option[data-index]")) {
        const el = option;
        const active = Number(el.dataset.index) === index;
        el.toggleAttribute("data-active", active);
        if (active) {
          this.#inputEl().setAttribute("aria-activedescendant", el.id);
          this.visibleItems[index]?.option?.setAttribute("data-active-option", "");
          el.scrollIntoView({ block: "nearest" });
        }
      }
      if (index < 0)
        this.#inputEl().removeAttribute("aria-activedescendant");
    }
    #selectItem(item, { materialize = true } = {}) {
      if (item.disabled)
        return false;
      let option = null;
      if (this.isSelect) {
        option = item.option instanceof HTMLOptionElement ? item.option : this.#findSelectableOption(item.value);
        if (option?.disabled || !option && !materialize)
          return false;
        const unchanged = option ? this.isMultiple ? option.selected : this.#selectSource().selectedOptions[0] === option : false;
        if (unchanged) {
          if (!this.isMultiple)
            this.hide();
          return false;
        }
        if (this.isMultiple && this.options.maxItems > 0 && this.#selectSource().selectedOptions.length >= this.options.maxItems) {
          return false;
        }
        if (option)
          item = { ...item, option, selected: true };
      } else if (this.source.value === item.value) {
        this.hide();
        return false;
      }
      const before = emit(this.source, "combobox:beforeselect", {
        combobox: this,
        item
      }, { cancelable: true });
      if (before.defaultPrevented)
        return false;
      if (this.isSelect) {
        if (!option)
          option = this.addOption(item);
        const selectOption = option;
        item = { ...item, option: selectOption, selected: true };
        if (this.isMultiple) {
          selectOption.selected = true;
          this.#rememberSelection(selectOption);
          this.#inputEl().value = "";
          this.#commit();
          if (this.suppressReopen)
            this.refresh();
          else if (this.#closeOnSelect())
            this.hide();
          else
            this.search("", { show: true, reason: "select" });
        } else {
          selectOption.selected = true;
          this.selectionOrder = [selectOption];
          this.#inputEl().value = item.label;
          this.#commit();
          if (this.#closeOnSelect())
            this.hide();
        }
      } else {
        this.source.value = item.value;
        this.#dispatchNativeValueEvents();
        this.hide();
      }
      emit(this.source, "combobox:select", { combobox: this, item });
      this.#markEngineMutation();
      return true;
    }
    async#createItem(label) {
      if (!this.#canCreate(label, this.#inputEl()))
        return null;
      const existing = this.#findCreateMatch(label);
      if (existing) {
        this.#selectItem(existing);
        return existing.option ?? null;
      }
      const item = await this.#materializeCreated(label, this.#inputEl());
      if (!item)
        return null;
      this.#inputEl().value = "";
      if (this.isMultiple) {
        if (this.suppressReopen)
          this.refresh();
        else if (this.#closeOnSelect())
          this.hide();
        else
          this.search("", { show: true, reason: "create" });
      } else {
        this.hide();
      }
      this.#markEngineMutation();
      return item.option;
    }
    async#materializeCreated(label, input, { fallback = false } = {}) {
      const guard = await this.#runGuard("add", { label }, input);
      if (!guard.ok)
        return null;
      const before = emit(this.source, "combobox:beforecreate", {
        combobox: this,
        label
      }, { cancelable: true });
      if (before.defaultPrevented)
        return null;
      let created = { value: label, label };
      if (typeof this.options.create === "function") {
        this.loading = true;
        if (!fallback)
          this.#renderLoading();
        try {
          const result = await this.options.create(label, {
            signal: this.abortController.signal,
            combobox: this,
            source: this.source,
            input,
            ...fallback ? { fallback: true } : {}
          });
          if (!result)
            return null;
          created = toItem(result, this.#fields());
        } catch (error) {
          if (error?.name !== "AbortError")
            emit(this.source, "combobox:createerror", { combobox: this, label, error });
          return null;
        } finally {
          this.loading = false;
        }
      }
      const option = this.addOption(created, { selected: true });
      if (!option)
        return null;
      const item = {
        ...created,
        option,
        selected: true
      };
      this.source.removeAttribute("aria-invalid");
      this.input?.removeAttribute("aria-invalid");
      this.#dispatchNativeValueEvents();
      emit(this.source, "combobox:create", { combobox: this, item });
      return item;
    }
    async#runGuard(name, payload, input = this.#inputEl()) {
      const guards = this.options.guards;
      const guard = guards[name];
      if (typeof guard !== "function")
        return { ok: true };
      try {
        const result = await guard(payload, {
          combobox: this,
          source: this.source,
          input,
          signal: this.abortController.signal
        });
        return { ok: result !== false, refused: result === false };
      } catch (error) {
        emit(this.source, "combobox:guarderror", { combobox: this, guard: name, error });
        return { ok: false, refused: false, error };
      }
    }
    #closeOnSelect() {
      return this.options.closeOnSelect ?? !this.isMultiple;
    }
    #separatorsActive() {
      return this.isMultiple && Array.isArray(this.options.separators) && this.options.separators.length > 0;
    }
    #resolveTokens(value, final = false) {
      const custom = this.options.tokenize;
      if (typeof custom === "function") {
        const result = custom(value, { combobox: this, source: this.source, input: this.#inputEl() });
        const tokens = result && Array.isArray(result.tokens) ? result.tokens : [];
        const entries2 = tokens.map((text) => ({ text: String(text), sep: "" }));
        return { entries: entries2, rest: final ? "" : String(result?.rest ?? "") };
      }
      const { done, rest } = splitTokens(value, this.options.separators);
      const entries = final && rest.trim() ? [...done, { text: rest.trim(), sep: "" }] : done;
      return { entries, rest: final ? "" : rest };
    }
    #resolveTokenCommit() {
      if (this.options.maxItems > 0 && this.#selectSource().selectedOptions.length >= this.options.maxItems) {
        return null;
      }
      const resolved = this.#resolveTokens(this.#inputEl().value, true);
      const { entries } = resolved;
      const term = entries.map((entry) => entry.text.trim()).find(Boolean);
      if (!term)
        return null;
      const existing = this.#findCreateMatch(term);
      const canCommit = existing !== null && !existing.disabled || this.#canCreate(term, this.#inputEl());
      return canCommit ? resolved : null;
    }
    async#processTokens(value, { final = false, resolved = undefined } = {}) {
      if (!this.#separatorsActive())
        return null;
      const { entries, rest } = resolved ?? this.#resolveTokens(value, final);
      if (!entries.length)
        return { consumed: false, rest };
      let consumedLength = 0;
      for (let index = 0;index < entries.length; index++) {
        const entry = entries[index];
        if (this.options.maxItems > 0 && this.#selectSource().selectedOptions.length >= this.options.maxItems) {
          return { consumed: false, rest: value.slice(consumedLength) };
        }
        if (!await this.#applyToken(entry.text)) {
          return { consumed: false, rest: value.slice(consumedLength) };
        }
        consumedLength += entry.text.length + entry.sep.length;
      }
      return { consumed: true, rest: final ? "" : rest };
    }
    async#applyToken(text) {
      const term = String(text ?? "").trim();
      if (!term)
        return true;
      const existing = this.#findCreateMatch(term);
      if (existing) {
        this.#selectItem(existing);
        return true;
      }
      if (!this.#canCreate(term, this.#inputEl()))
        return false;
      const created = await this.#createItem(term);
      return created !== null;
    }
    async#handleTokenInput() {
      const result = await this.#processTokens(this.#inputEl().value);
      if (result)
        this.#inputEl().value = result.rest;
      this.search(this.#inputEl().value, { show: true, reason: "input" });
    }
    async#commitEnterTokens(resolved) {
      const result = await this.#processTokens(this.#inputEl().value, { final: true, resolved });
      if (result?.consumed) {
        this.#inputEl().value = result.rest;
        this.search("", { show: true, reason: "create" });
      }
    }
    #dispatchNativeValueEvents() {
      this.source.dispatchEvent(new Event("input", { bubbles: true }));
      this.source.dispatchEvent(new Event("change", { bubbles: true }));
    }
    #commit() {
      this.source.removeAttribute("aria-invalid");
      this.#inputEl()?.removeAttribute("aria-invalid");
      this.#dispatchNativeValueEvents();
    }
    addOption(rawItem, { selected = false } = {}) {
      if (!this.isSelect)
        throw new TypeError("addOption() is only available for select-backed comboboxes");
      const item = toItem(rawItem, this.#fields());
      if (!item)
        throw new TypeError("Option requires a value");
      if (item.value === "" && !this.options.allowEmptyOption)
        throw new TypeError("Option requires a value");
      const option = appendCatalogOption(this, item, { selected });
      if (selected)
        this.#rememberSelection(option);
      return option;
    }
    select(itemOrValue) {
      const isObject = typeof itemOrValue === "object" && itemOrValue !== null;
      if (this.mode === "fallback" && this.isSelect) {
        const item = isObject ? toItem(itemOrValue, this.#fields()) : { value: String(itemOrValue), label: String(itemOrValue) };
        if (!item)
          return false;
        const option = (this.isMultiple ? this.#findSelectableOption(item.value) : null) || this.#findOption(item.value);
        if (!option) {
          if (!isObject)
            return false;
          const created = this.addOption(item, { selected: true });
          this.#dispatchNativeValueEvents();
          return created !== null;
        }
        if (option.disabled)
          return false;
        const unchanged = this.isMultiple ? option.selected : this.source.value === option.value;
        if (unchanged)
          return false;
        if (!this.isMultiple) {
          for (const other of this.#selectSource().options)
            other.selected = false;
        }
        option.selected = true;
        this.#rememberSelection(option);
        this.#dispatchNativeValueEvents();
        return true;
      }
      if (isObject) {
        const item = toItem(itemOrValue, this.#fields());
        if (!item)
          return false;
        if (itemOrValue instanceof HTMLOptionElement)
          item.option = itemOrValue;
        return this.#selectItem(item, { materialize: true });
      }
      const value = String(itemOrValue);
      const foundRaw = this.#items().find((candidate) => candidate.value === value) || this.#sourceItems().find((candidate) => candidate.value === value);
      const found = foundRaw ? foundRaw : null;
      if (!found)
        return false;
      return this.#selectItem({ value: found.value, label: found.label }, { materialize: false });
    }
    async remove(valueOrOption) {
      if (!this.isSelect)
        return false;
      const option = valueOrOption instanceof HTMLOptionElement ? valueOrOption : this.#selectedOptionsInOrder().find((entry) => entry.value === String(valueOrOption));
      if (!option?.selected || option.disabled)
        return false;
      const item = {
        value: option.value,
        label: option.textContent.trim(),
        option,
        selected: true,
        data: { ...option.dataset }
      };
      const guard = await this.#runGuard("remove", { item });
      if (!guard.ok)
        return false;
      const before = emit(this.source, "combobox:beforeremove", { combobox: this, item }, { cancelable: true });
      if (before.defaultPrevented)
        return false;
      option.selected = false;
      this.#forgetSelection(option);
      this.#commit();
      emit(this.source, "combobox:remove", { combobox: this, item });
      this.refresh();
      this.#markEngineMutation();
      return true;
    }
    async clear() {
      if (!this.isSelect) {
        if (!this.source.value)
          return false;
        const guard2 = await this.#runGuard("clear", {});
        if (!guard2.ok)
          return false;
        const before2 = emit(this.source, "combobox:beforeclear", { combobox: this }, { cancelable: true });
        if (before2.defaultPrevented)
          return false;
        this.source.value = "";
        this.#dispatchNativeValueEvents();
        emit(this.source, "combobox:clear", { combobox: this });
        return true;
      }
      const selected = Array.from(this.#selectSource().selectedOptions).filter((option) => !option.disabled);
      if (!selected.length)
        return false;
      const guard = await this.#runGuard("clear", {});
      if (!guard.ok)
        return false;
      const before = emit(this.source, "combobox:beforeclear", { combobox: this }, { cancelable: true });
      if (before.defaultPrevented)
        return false;
      for (const option of selected)
        option.selected = false;
      this.selectionOrder = this.selectionOrder.filter((option) => option.selected);
      this.#commit();
      emit(this.source, "combobox:clear", { combobox: this });
      this.refresh();
      this.#markEngineMutation();
      return true;
    }
    getSelectedValues() {
      if (!this.isSelect)
        return [this.source.value].filter(Boolean);
      return this.#selectedOptionsInOrder().map((option) => option.value);
    }
    getSelectedItems() {
      if (!this.isSelect)
        return [{ value: this.source.value, label: this.source.value }].filter((item) => item.value);
      return this.#selectedOptionsInOrder().map((option) => ({
        value: option.value,
        label: option.textContent.trim(),
        option,
        data: { ...option.dataset }
      }));
    }
    move(itemOrValue, index) {
      if (!this.isMultiple || this.options.selectionOrder !== "selected")
        return false;
      const option = itemOrValue instanceof HTMLOptionElement ? itemOrValue : this.selectionOrder.find((entry) => entry.value === String(itemOrValue));
      if (!option?.selected)
        return false;
      const moved = moveValueInOrder(this.selectionOrder, option, index);
      if (!moved)
        return false;
      const { order: nextOrder, from, to } = moved;
      const before = emit(this.source, "combobox:beforereorder", { combobox: this, value: option.value, from, to }, { cancelable: true });
      if (before.defaultPrevented)
        return false;
      this.selectionOrder = nextOrder;
      this.#renderChips();
      emit(this.source, "combobox:reorder", {
        combobox: this,
        value: option.value,
        from,
        to,
        values: this.getSelectedValues()
      });
      return true;
    }
    async loadMore() {
      if (!this.nextCursor || typeof this.options.load !== "function")
        return false;
      const cursor = this.nextCursor;
      await this.#load(this.query, { cursor, append: true, debounce: false });
      this.#applyFilter(this.query);
      return true;
    }
    refresh() {
      if (this.mode !== "enhanced")
        return this;
      if (this.isSelect) {
        this.#inputEl().disabled = this.source.disabled;
        this.#inputEl().readOnly = this.source.hasAttribute("readonly");
        for (const option of this.#selectSource().selectedOptions)
          this.#rememberSelection(option);
        if (this.source.required)
          this.#inputEl().setAttribute("aria-required", "true");
        else
          this.#inputEl().removeAttribute("aria-required");
        if (this.isMultiple)
          this.#renderChips();
        else
          this.#syncSingleLabel();
      }
      this.#applyFilter(this.isSelect && !this.isMultiple ? "" : this.#inputEl().value);
      return this;
    }
    #syncSingleLabel() {
      const selected = this.#selectSource().selectedOptions[0];
      this.#inputEl().value = selected?.value ? selected.textContent.trim() : "";
    }
    show() {
      if (this.mode !== "enhanced" || this.isOpen())
        return false;
      if (openCombobox && openCombobox !== this) {
        openCombobox.hide();
        if (openCombobox?.isOpen())
          return false;
      }
      const before = emit(this.source, "combobox:beforeopen", { combobox: this }, { cancelable: true });
      if (before.defaultPrevented)
        return false;
      try {
        this.#popoverEl().showPopover({ source: this.#inputEl() });
      } catch {
        this.#popoverEl().showPopover();
      }
      this.#positionPicker();
      this.#startAutoUpdate();
      openCombobox = this;
      return true;
    }
    hide() {
      if (this.mode !== "enhanced" || !this.isOpen())
        return false;
      const before = emit(this.source, "combobox:beforeclose", { combobox: this }, { cancelable: true });
      if (before.defaultPrevented)
        return false;
      this.#popoverEl().hidePopover();
      if (openCombobox === this)
        openCombobox = null;
      return true;
    }
    isOpen() {
      return this.mode === "enhanced" && this.#popoverEl().matches(":popover-open");
    }
    dispose() {
      instances.delete(this.source);
      this.loadController?.abort();
      this.abortController.abort();
      this._sourceObserver?.disconnect();
      this._sourceObserver = null;
      if (this._sourceSyncTimer) {
        clearTimeout(this._sourceSyncTimer);
        this._sourceSyncTimer = null;
      }
      if (this.mode === "fallback") {
        this.fallbackControl?.remove();
        return;
      }
      if (openCombobox === this)
        openCombobox = null;
      this.stopAutoUpdate?.();
      this.stopAutoUpdate = null;
      this.#popoverEl()?.remove();
      if (this.isSelect || this.datalist instanceof HTMLDataListElement) {
        for (const item of this.#sourceItems()) {
          item.option?.removeAttribute("data-filtered");
          item.option?.removeAttribute("data-active-option");
        }
      }
      for (const { label, id } of this.original.inventedLabels) {
        if (label.id === id)
          label.removeAttribute("id");
      }
      if (this.isSelect) {
        this.control?.remove();
        this.source.classList.remove("cb-source-hidden");
        this.sourceSnapshot?.restore();
        if (!this.ownsInput && this.#inputEl() && this.original.filterInputPlaceholder?.parentNode) {
          this.original.filterInputPlaceholder.replaceWith(this.#inputEl());
        }
        this.#inputEl()?.classList.remove("cb-input");
        this.inputSnapshot?.restore();
      } else {
        this.source.classList.remove("cb-text-control");
        this.inputSnapshot?.restore();
      }
    }
  }

  // src/combo-box.js
  var OPTION_ATTRIBUTES = {
    create: { type: "boolean" },
    placeholder: {},
    search: { option: "match" },
    "min-chars": { type: "integer" },
    "max-items": { type: "integer" },
    "max-options": { type: "integer" },
    "selection-order": {},
    separators: { parse: parseSeparators },
    "create-on-blur": { type: "boolean" },
    "close-on-select": { type: "boolean" },
    "autoselect-first": { type: "boolean" },
    "tab-select": { type: "boolean" },
    "search-fields": { parse: parseList },
    "label-field": {},
    "value-field": {},
    "load-on-empty": { type: "boolean" },
    "allow-empty-option": { type: "boolean" },
    debounce: { type: "integer" }
  };
  function camelCase(name) {
    return name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
  }

  class ComboBoxElement extends HTMLElement {
    static get observedAttributes() {
      return Object.keys(OPTION_ATTRIBUTES);
    }
    constructor() {
      super();
      this._combobox = null;
      this._source = null;
      this._options = {};
      this._sourceObserver = null;
      this._revision = 0;
      this._rebuildQueued = false;
      this._readyResolvers = [];
      this.#upgradeProperty("options");
    }
    connectedCallback() {
      const revision = ++this._revision;
      queueMicrotask(() => {
        if (revision !== this._revision || !this.isConnected)
          return;
        this.upgrade();
      });
    }
    disconnectedCallback() {
      const revision = ++this._revision;
      queueMicrotask(() => {
        if (revision !== this._revision || this.isConnected)
          return;
        this.dispose();
      });
    }
    attributeChangedCallback(_name, oldValue, newValue) {
      if (oldValue === newValue || !this._combobox)
        return;
      this.#scheduleRebuild();
    }
    get source() {
      return this._source || this.#findSource();
    }
    get combobox() {
      return this._combobox;
    }
    get options() {
      return { ...this._options };
    }
    set options(value) {
      if (value == null)
        value = {};
      if (typeof value !== "object")
        throw new TypeError("combo-box options must be an object");
      this._options = { ...value };
      if (this._combobox)
        this.#scheduleRebuild();
    }
    configure(options = {}) {
      this.options = { ...this._options, ...options };
      return this;
    }
    upgrade() {
      const source = this.#findSource();
      if (!source) {
        this.#watchForSource();
        return null;
      }
      this._sourceObserver?.disconnect();
      this._sourceObserver = null;
      if (this._combobox && this._source === source)
        return this._combobox;
      if (this._combobox)
        this._combobox.dispose();
      this._source = source;
      this._combobox = new Combobox(source, this.#resolvedOptions());
      const ready = this._readyResolvers.splice(0);
      for (const resolve of ready)
        resolve(this._combobox);
      this.dispatchEvent(new CustomEvent("combobox:ready", {
        bubbles: true,
        detail: { combobox: this._combobox, source }
      }));
      return this._combobox;
    }
    whenReady() {
      if (this._combobox)
        return Promise.resolve(this._combobox);
      return new Promise((resolve) => this._readyResolvers.push(resolve));
    }
    dispose() {
      this._sourceObserver?.disconnect();
      this._sourceObserver = null;
      this._combobox?.dispose();
      this._combobox = null;
      this._source = null;
    }
    #findSource() {
      for (const child of this.children) {
        if (child instanceof HTMLSelectElement)
          return child;
      }
      for (const child of this.children) {
        if (child instanceof HTMLInputElement && child.hasAttribute("list"))
          return child;
      }
      return null;
    }
    #watchForSource() {
      if (this._sourceObserver)
        return;
      this._sourceObserver = new MutationObserver(() => {
        if (this.#findSource())
          this.upgrade();
      });
      this._sourceObserver.observe(this, { childList: true });
    }
    #resolvedOptions() {
      const attrs = {};
      for (const [attribute, config] of Object.entries(OPTION_ATTRIBUTES)) {
        if (!this.hasAttribute(attribute))
          continue;
        const raw = this.getAttribute(attribute);
        const value = config.parse ? config.parse(raw) : config.type === "boolean" ? booleanAttribute(this, attribute) : config.type === "integer" ? parseInteger(raw) : raw;
        if (value !== undefined)
          attrs[config.option ?? camelCase(attribute)] = value;
      }
      return { ...attrs, ...this._options };
    }
    #scheduleRebuild() {
      if (this._rebuildQueued)
        return;
      this._rebuildQueued = true;
      queueMicrotask(() => {
        this._rebuildQueued = false;
        if (!this.isConnected || !this._combobox)
          return;
        const source = this._source;
        this._combobox.dispose();
        this._combobox = null;
        this._source = source;
        this.upgrade();
      });
    }
    #upgradeProperty(name) {
      if (!hasOwn(this, name))
        return;
      const value = Reflect.get(this, name);
      Reflect.deleteProperty(this, name);
      Reflect.set(this, name, value);
    }
  }
  function defineCombobox() {
    const registry = globalThis.customElements;
    if (!registry.get("combo-box"))
      registry.define("combo-box", ComboBoxElement);
    return ComboBoxElement;
  }

  // src/define.js
  defineCombobox();
})();
