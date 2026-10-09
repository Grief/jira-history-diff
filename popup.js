/**
 * Jira History Diff - Popup Script
 * Handles global and per-site enable/disable toggles
 */

'use strict';

// === Browser API Compatibility (Chrome + Firefox) ===
const browserAPI = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;

const globalToggle = document.getElementById('globalToggle');
const siteToggle = document.getElementById('siteToggle');
const currentHostEl = document.getElementById('currentHost');

/**
 * Get current tab's hostname
 */
async function getCurrentHostname() {
  const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
  if (tabs.length === 0) return null;

  try {
    const url = new URL(tabs[0].url);
    return url.hostname;
  } catch {
    return null;
  }
}

/**
 * Load and update UI state
 */
async function loadState() {
  const hostname = await getCurrentHostname();
  const storage = await browserAPI.storage.sync.get({
    globalEnabled: true,
    enabledHosts: []
  });

  // Update display
  if (hostname) {
    currentHostEl.textContent = hostname;
  } else {
    currentHostEl.textContent = 'Not a web page';
    siteToggle.disabled = true;
  }

  // Set toggle states
  globalToggle.checked = storage.globalEnabled;
  siteToggle.checked = storage.enabledHosts.includes(hostname);
  siteToggle.disabled = !hostname;
}

/**
 * Handle global toggle change
 */
globalToggle.addEventListener('change', async (event) => {
  const enabled = event.target.checked;
  await browserAPI.storage.sync.set({ globalEnabled: enabled });
});

/**
 * Handle site toggle change
 */
siteToggle.addEventListener('change', async (event) => {
  const hostname = await getCurrentHostname();
  if (!hostname) return;

  const checked = event.target.checked;
  const storage = await browserAPI.storage.sync.get({ enabledHosts: [] });
  let enabledHosts = storage.enabledHosts || [];

  if (checked) {
    // Add hostname
    if (!enabledHosts.includes(hostname)) {
      enabledHosts.push(hostname);
    }
  } else {
    // Remove hostname
    enabledHosts = enabledHosts.filter(h => h !== hostname);
  }

  await browserAPI.storage.sync.set({ enabledHosts });
});

// Initialize on popup open
loadState();
