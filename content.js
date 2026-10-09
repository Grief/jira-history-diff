/**
 * Jira History Diff - Content Script
 * Injects word-level diffs into Jira issue history
 */

'use strict';

// === Browser API Compatibility (Chrome + Firefox) ===
const browserAPI = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;

// === Utility Functions ===

/**
 * Debounce function to prevent excessive processing on mutations
 */
function debounce(fn, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Extract visible text from an element
 */
function extractText(element) {
  if (!element) return '';
  // innerText respects visibility and collapses whitespace like the browser renders
  return (element.innerText || element.textContent || '').trim();
}

// === Diff Logic ===

/**
 * Perform word-level diff on old and new text
 */
function wordDiff(oldText, newText) {
  const dmp = new diff_match_patch();
  return dmp.diff_main(oldText, newText);
}

/**
 * Build HTML fragments from diffs for rendering
 */
function buildDiffFragments(diffs) {
  const fragments = [];

  for (const [op, text] of diffs) {
    if (op === -1) { // DELETE
      fragments.push({ text, type: 'removed' });
    } else if (op === 1) { // INSERT
      fragments.push({ text, type: 'added' });
    } else { // EQUAL
      fragments.push({ text, type: 'equal' });
    }
  }

  return fragments;
}

/**
 * Build a single pane (left or right) with colored diffs
 */
function buildPane(fragments, label) {
  const pane = document.createElement('div');
  pane.className = 'jhd-pane';

  const header = document.createElement('div');
  header.className = 'jhd-pane-header';
  header.textContent = label;
  pane.appendChild(header);

  const content = document.createElement('div');
  content.className = 'jhd-pane-content';

  for (const { text, type } of fragments) {
    const span = document.createElement('span');
    span.textContent = text;
    span.className = `jhd-word jhd-word--${type}`;
    content.appendChild(span);
  }

  pane.appendChild(content);
  return pane;
}

/**
 * Build the side-by-side diff panel
 */
function buildDiffPanel(oldText, newText) {
  const diffs = wordDiff(oldText, newText);

  // Separate into old and new streams
  const oldFragments = [];
  const newFragments = [];

  for (const [op, text] of diffs) {
    if (op === -1) { // DELETE (old only)
      oldFragments.push({ text, type: 'removed' });
    } else if (op === 1) { // INSERT (new only)
      newFragments.push({ text, type: 'added' });
    } else { // EQUAL (both)
      oldFragments.push({ text, type: 'equal' });
      newFragments.push({ text, type: 'equal' });
    }
  }

  const panel = document.createElement('div');
  panel.className = 'jhd-diff-panel';
  panel.dataset.diffPanel = 'true';

  const leftPane = buildPane(oldFragments, 'Old');
  const rightPane = buildPane(newFragments, 'New');

  panel.appendChild(leftPane);
  panel.appendChild(rightPane);

  return panel;
}

// === DOM Targeting ===

/**
 * Detect Jira variant (Cloud vs Server/DC)
 */
function detectJiraVariant() {
  // Cloud: look for Jira frontend elements
  if (document.getElementById('jira-frontend')) {
    return 'cloud';
  }

  // Look for data-testid (stable in both variants)
  if (document.querySelector('[data-testid*="change-history"]')) {
    return 'cloud';
  }

  // Server/DC: look for legacy elements
  if (document.getElementById('changehistory') || document.getElementById('issue-tabs')) {
    return 'server';
  }

  // Default attempt
  return 'cloud';
}

/**
 * Find history change items in the DOM
 */
function findChangeItems() {
  const items = [];
  const variant = detectJiraVariant();

  console.log('[JHD] Variant detected:', variant);
  console.log('[JHD] Page HTML sample:', document.body.innerText.substring(0, 500));

  console.log('[JHD] ===== findChangeItems() for variant:', variant);

  if (variant === 'server') {
    // Server/DC uses structured HTML with .change-log-field, .change-log-old-val, etc.
    const fields = document.querySelectorAll('.change-log-field');

    for (const fieldEl of fields) {
      const fieldName = extractText(fieldEl);

      // Find parent container and sibling value elements
      const parent = fieldEl.closest('[class*="history-item"], li, tr, div[class*="activity"]') || fieldEl.parentElement;

      if (!parent) continue;

      // Look for value elements (often siblings of the field label)
      let oldEl = parent.querySelector('.change-log-old-val');
      let newEl = parent.querySelector('.change-log-new-val');

      // If not found as direct children, try alternatives
      if (!oldEl) {
        const siblings = Array.from(parent.querySelectorAll('span, div'));
        const fieldIndex = siblings.indexOf(fieldEl);
        if (fieldIndex >= 0 && fieldIndex + 1 < siblings.length) {
          oldEl = siblings[fieldIndex + 1];
        }
      }

      if (oldEl && newEl) {
        items.push({
          fieldName,
          oldEl,
          newEl,
          container: parent
        });
      }
    }
  } else {
    // Cloud: Jira Cloud history items have specific data-testid structure
    // Structure: <div data-testid="issue-history.ui.history-items.generic-history-item.history-item">
    //   - Contains the change details including field name, old value, new value

    console.log('[JHD] Looking for Cloud history items with specific selector...');

    const historyItems = document.querySelectorAll('[data-testid="issue-history.ui.history-items.generic-history-item.history-item"]');
    console.log('[JHD] Found', historyItems.length, 'history items');

    for (const historyItem of historyItems) {
      // Skip if already processed
      if (historyItem.dataset.diffProcessed) {
        continue;
      }

      const itemText = historyItem.innerText || '';

      // Split the text by newlines to extract components
      // Pattern: [user]\n[action] the\n[field]\n[timestamp]\n[old value]\n[new value]
      const lines = itemText.split('\n').map(l => l.trim()).filter(l => l);

      // Find the actual field name (it comes after "updated the" or "changed the")
      let fieldName = null;
      let fieldIndex = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('updated the') || lines[i].includes('changed the')) {
          // Next line should be the field name
          if (i + 1 < lines.length) {
            const potentialField = lines[i + 1];
            // Support any field now - exclude common single-value fields
            const excludeFields = ['Assignee', 'Status', 'Priority', 'Labels', 'Dev Work Estimate', 'Team', 'Sprint', 'Reporter'];
            if (!excludeFields.includes(potentialField)) {
              fieldName = potentialField;
              fieldIndex = i + 1;
              break;
            }
          }
        }
      }

      if (fieldIndex === -1) {
        continue;
      }

      console.log('[JHD] Found field change:', fieldName, 'at index', fieldIndex);

      // Simple approach: the last two lines are always old and new values
      // Structure: [user] [action] [field] [timestamp...] [old value] [new value]
      let oldValue = null;
      let newValue = null;

      // Last two non-empty lines are old and new
      if (lines.length >= fieldIndex + 3) {
        oldValue = lines[lines.length - 2].trim();
        newValue = lines[lines.length - 1].trim();

        // Validate that they're different
        if (oldValue !== newValue) {
          console.log('[JHD] Field:', fieldName, '- extracted values differ');
        } else {
          oldValue = null;
          newValue = null;
          console.log('[JHD] Field:', fieldName, '- old and new are identical, skipping');
        }
      }

      // If we found values, create a diff item
      if (oldValue && newValue) {
        const oldEl = { innerText: oldValue, textContent: oldValue };
        const newEl = { innerText: newValue, textContent: newValue };

        items.push({
          fieldName,
          oldEl,
          newEl,
          container: historyItem
        });

        console.log('[JHD] Created diff item for', fieldName);
      }
    }
  }

  return items;
}

/**
 * Process all history items and apply diffs
 */
function findAndProcessHistoryItems() {
  const items = findChangeItems();
  console.log('[JHD] Processing items:', items.length);

  for (const item of items) {
    // Idempotency guard
    if (item.container.dataset.diffProcessed === 'true') {
      continue;
    }

    const fieldName = (item.fieldName || '');

    // Skip if no field name
    if (!fieldName) {
      continue;
    }

    const oldText = extractText(item.oldEl);
    const newText = extractText(item.newEl);

    // Don't create a diff if both are empty
    if (!oldText && !newText) {
      item.container.dataset.diffProcessed = 'true';
      continue;
    }

    const diffPanel = buildDiffPanel(oldText, newText);

    console.log('[JHD] Built diff panel:', diffPanel.className);
    console.log('[JHD] Panel HTML:', diffPanel.outerHTML.substring(0, 200));
    console.log('[JHD] Container before:', item.container.outerHTML.substring(0, 100));

    // Hide original content and insert diff panel
    item.container.style.display = 'none';
    item.container.insertAdjacentElement('afterend', diffPanel);

    console.log('[JHD] Container after insert, display:', item.container.style.display);
    console.log('[JHD] Panel in DOM:', diffPanel.parentElement ? 'YES' : 'NO');

    item.container.dataset.diffProcessed = 'true';
  }
}

// === Extension State Management ===

/**
 * Check if extension is enabled for current site
 */
async function isEnabledForCurrentSite() {
  const storage = await browserAPI.storage.sync.get({
    globalEnabled: true,
    enabledHosts: []
  });

  if (!storage.globalEnabled) {
    return false;
  }

  // For self-hosted Jira, check if hostname is in enabledHosts
  const hostname = window.location.hostname;

  if (hostname.includes('atlassian.net')) {
    // Cloud: always enabled if globally enabled
    return true;
  }

  // Self-hosted: check enabledHosts list
  return storage.enabledHosts.includes(hostname);
}

/**
 * Start the diff observer
 */
function startObserver() {
  let observerActive = false;
  let observer;

  const debouncedProcess = debounce(findAndProcessHistoryItems, 150);

  observer = new MutationObserver(() => {
    debouncedProcess();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  observerActive = true;

  // Listen for storage changes to enable/disable
  browserAPI.storage.onChanged.addListener((changes) => {
    if (changes.globalEnabled || changes.enabledHosts) {
      isEnabledForCurrentSite().then((enabled) => {
        if (enabled && !observerActive) {
          observer.observe(document.body, {
            childList: true,
            subtree: true
          });
          observerActive = true;
          findAndProcessHistoryItems();
        } else if (!enabled && observerActive) {
          observer.disconnect();
          observerActive = false;
        }
      });
    }
  });
}

// === Entry Point ===

(async function initialize() {
  console.log('[JHD] Extension initializing...');

  // Prevent duplicate observers
  if (window.__jhdObserverActive) {
    console.log('[JHD] Observer already active, skipping');
    return;
  }

  // Check if enabled
  const enabled = await isEnabledForCurrentSite();
  console.log('[JHD] Extension enabled for this site:', enabled);

  if (!enabled) {
    return;
  }

  window.__jhdObserverActive = true;

  // Start processing
  console.log('[JHD] Starting observer...');
  startObserver();

  // Process any history already present
  console.log('[JHD] Scheduling initial scan...');
  setTimeout(findAndProcessHistoryItems, 500);
})();
