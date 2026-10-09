'use strict';

const browserAPI = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;

const enabledToggle = document.getElementById('enabledToggle');

document.getElementById('version').textContent = `v${browserAPI.runtime.getManifest().version}`;

browserAPI.storage.sync.get({ globalEnabled: true }).then(({ globalEnabled }) => {
  enabledToggle.checked = globalEnabled;
});

enabledToggle.addEventListener('change', () => {
  browserAPI.storage.sync.set({ globalEnabled: enabledToggle.checked });
});
