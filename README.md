# Jira History Diff — Chrome Extension

A Chrome extension that highlights word-level differences in Jira issue history, making it easy to see exactly what changed in Description and Summary fields.

## Features

- **Side-by-side diff view** for Description and Summary field changes
- **Word-level highlighting** — removed words in red with strikethrough, added words in green
- **Works on both** Jira Cloud (atlassian.net) and self-hosted Jira Server/Data Center
- **No dependencies** — vanilla JavaScript, ~4.7KB diff library included
- **Per-site toggles** — enable/disable globally or on specific Jira instances

## Installation

### Development / Testing

1. **Clone or download** this directory
2. Open **Chrome Extensions** at `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **"Load unpacked"** and select this `jira-history-diff` directory
5. The extension icon will appear in your toolbar

### Using the Extension

1. Navigate to any Jira issue
2. Click the **History** tab
3. Look for Description or Summary field changes — they will display as **side-by-side diffs**

### Settings

Click the extension icon to access toggles:

- **Global toggle**: Enable/disable the extension everywhere
- **This site**: For self-hosted Jira, explicitly enable/disable on specific domains
  - Jira Cloud (*.atlassian.net) is always enabled when global toggle is on
  - Self-hosted Jira requires per-site opt-in to avoid running on all websites

## File Structure

```
jira-history-diff/
├── manifest.json          # Chrome extension configuration (MV3)
├── content.js             # Core logic: DOM observer, diff processing
├── diff-match-patch.js    # Word-level diff algorithm (~4.7KB)
├── styles.css             # Side-by-side panel styling
├── popup.html             # Extension popup UI
├── popup.js               # Toggle state management
├── test.html              # Unit tests (open in browser)
├── icons/                 # Extension icons (16, 48, 128px)
└── README.md              # This file
```

## Testing

### Manual Testing

**On Jira Cloud:**
1. Navigate to https://[your-domain].atlassian.net/browse/[ISSUE-KEY]
2. Click the **History** tab
3. Find a Description or Summary change
4. You should see a side-by-side diff panel with word-level highlighting

**On Self-Hosted Jira:**
1. Enable the extension for your Jira domain via the popup
2. Navigate to an issue with history
3. Click History tab and look for diffs

### Unit Testing

1. Open `test.html` directly in your browser (file → open or drag it to a tab)
2. See all test cases run automatically
3. Tests cover:
   - Empty text insertion/deletion
   - Simple word replacements
   - Word additions/removals
   - Multi-word changes
   - Special characters and punctuation

## How It Works

### Content Script Flow

1. **Startup**: Checks storage for enabled state, detects Jira variant (Cloud vs Server)
2. **MutationObserver**: Watches DOM for new history items (debounced 150ms)
3. **DOM Targeting**:
   - Cloud: Looks for history activity containers using `data-testid` and text anchors
   - Server: Uses structured `.change-log-field`, `.change-log-old-val`, `.change-log-new-val` selectors
4. **Diff Processing**:
   - Extracts old and new text via `innerText` (handles ADF HTML in Cloud)
   - Computes word-level diff using LCS algorithm
   - Builds side-by-side HTML panel with color-coded words
   - Inserts panel into DOM, hides original

### Diff Algorithm

Uses a simplified longest-common-subsequence (LCS) algorithm for word-level diffing:
- Splits text into words
- Finds common prefix and suffix
- Computes LCS on middle section
- Backtracks to build operation list: `[[-1, "removed"], [0, "equal"], [1, "added"]]`
- Renders left pane (old with deletions) and right pane (new with insertions)

### Storage & State

- Uses `chrome.storage.sync` for extension state:
  - `globalEnabled: boolean` — global on/off
  - `enabledHosts: string[]` — list of hostnames where extension is enabled
- Content script listens to `chrome.storage.onChanged` to react instantly

## Limitations & Known Issues

### Current Limitations

- **Description/Summary only**: Other field types (Status, Assignee, etc.) are not diffed
- **Rich text (ADF)**: Cloud descriptions with tables/lists/code blocks are flattened to plain text
- **Very large diffs** (>50k chars): May show fallback label instead of diff
- **Shadow DOM**: Jira Forge widgets in shadow DOM are not processed (v1 limitation)

### Browser Compatibility

- **Chrome/Chromium**: Full support (MV3)
- **Firefox**: Would require MV2 conversion
- **Safari**: Would require MV2 conversion and app store submission

## Development Notes

### No Build System

This extension intentionally avoids npm, webpack, TypeScript, etc. to keep it simple:
- Single `diff-match-patch.js` file (copied from Google's repo)
- All other files are vanilla JS/HTML/CSS
- No transpilation or bundling needed
- Easy to audit and modify

### Debugging

Enable logging in `content.js` by adding:

```javascript
console.log('[JHD]', 'Found history items:', items);
```

View logs at DevTools → Console while on a Jira page.

### Performance

- MutationObserver is debounced 150ms to avoid thrashing on React re-renders
- Diff processing uses O(n*m) time complexity (acceptable for typical field sizes)
- DOM inserts are minimal (one panel per field change)

## Future Enhancements

- Support more field types (Comments, custom fields)
- Preserve rich text structure (tables, code blocks) in Cloud ADF diffs
- Configurable colors and theme support
- Keyboard shortcuts for quick enable/disable
- Firefox/Safari support

## License

MIT

## Contributing

To report bugs or suggest features:
1. Check the test.html for diff algorithm correctness
2. Inspect DevTools console for error messages
3. Verify DOM structure matches expected selectors

## Support

This extension is provided as-is for personal use. For issues:
1. Clear the extension cache and reload
2. Check that Jira page fully loaded before History tab clicked
3. Try disabling and re-enabling the extension
4. Open test.html to verify diff algorithm works
