'use strict';

const browserAPI = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;

const HISTORY_ITEM_SELECTOR = '[data-testid="issue-history.ui.history-items.generic-history-item.history-item"]';
const PANEL_CLASS = 'jhd-diff-panel';
const PROCESSED_ATTRIBUTE = 'data-jhd-processed';
const VALUE_ROW_CELLS = 3;
const RESCAN_DELAY_MS = 150;
const BLOCK_TAGS = new Set([
  'ADDRESS', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'HR', 'LI', 'OL', 'P', 'PRE', 'TABLE', 'TR', 'UL',
]);

let active = false;

function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

function collectText(node, parts) {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      parts.push(child.data);
    } else if (child.nodeName === 'BR') {
      parts.push('\n');
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const isBlock = BLOCK_TAGS.has(child.nodeName);
      if (isBlock) {
        parts.push('\n');
      }
      collectText(child, parts);
      if (isBlock) {
        parts.push('\n');
      }
    }
  }
}

function extractText(element) {
  const parts = [];
  collectText(element, parts);
  return parts.join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findValueRow(item) {
  const content = item.lastElementChild;
  if (!content) {
    return null;
  }
  const blocks = Array.from(content.children).filter((block) => !block.classList.contains(PANEL_CLASS));
  const row = blocks[blocks.length - 1];
  if (blocks.length < 2 || row.childElementCount !== VALUE_ROW_CELLS) {
    return null;
  }
  return row;
}

function buildPane(segments, side, changeTag) {
  const pane = document.createElement('div');
  pane.className = `jhd-pane jhd-pane--${side}`;
  for (const { text, changed } of segments) {
    if (changed) {
      const change = document.createElement(changeTag);
      change.className = 'jhd-change';
      change.textContent = text;
      pane.append(change);
    } else {
      pane.append(text);
    }
  }
  return pane;
}

function buildDiffPanel(diff) {
  const panel = document.createElement('div');
  panel.className = PANEL_CLASS;
  panel.append(
    buildPane(diff.oldSegments, 'old', 'del'),
    buildPane(diff.newSegments, 'new', 'ins'),
  );
  return panel;
}

function removePanels(root) {
  for (const panel of root.querySelectorAll(`.${PANEL_CLASS}`)) {
    panel.remove();
  }
}

function processItem(item) {
  const row = findValueRow(item);
  if (!row || row.hasAttribute(PROCESSED_ATTRIBUTE)) {
    return;
  }
  row.setAttribute(PROCESSED_ATTRIBUTE, '');
  removePanels(item);
  const [oldCell, , newCell] = row.children;
  const diff = sideBySideDiff(extractText(oldCell), extractText(newCell));
  if (!diff?.sharesText) {
    return;
  }
  row.style.display = 'none';
  row.after(buildDiffPanel(diff));
}

function scan() {
  if (!active) {
    return;
  }
  for (const item of document.querySelectorAll(HISTORY_ITEM_SELECTOR)) {
    processItem(item);
  }
}

function restoreAll() {
  removePanels(document);
  for (const row of document.querySelectorAll(`[${PROCESSED_ATTRIBUTE}]`)) {
    row.style.removeProperty('display');
    row.removeAttribute(PROCESSED_ATTRIBUTE);
  }
}

const observer = new MutationObserver(debounce(scan, RESCAN_DELAY_MS));

function setActive(enabled) {
  if (enabled === active) {
    return;
  }
  active = enabled;
  if (active) {
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
  } else {
    observer.disconnect();
    restoreAll();
  }
}

browserAPI.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.globalEnabled) {
    setActive(changes.globalEnabled.newValue !== false);
  }
});

browserAPI.storage.sync.get({ globalEnabled: true }).then(({ globalEnabled }) => setActive(globalEnabled));
