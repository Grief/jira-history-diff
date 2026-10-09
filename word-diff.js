'use strict';

const DIFF_DELETE = -1;
const DIFF_EQUAL = 0;
const DIFF_INSERT = 1;
const MAX_LCS_CELLS = 4_000_000;
const TOKEN_PATTERN = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;
const WHITESPACE_ONLY = /^\s+$/;
const NON_WHITESPACE = /\S/;

function tokenize(text) {
  return text.match(TOKEN_PATTERN) ?? [];
}

function commonPrefixLength(a, b) {
  const limit = Math.min(a.length, b.length);
  let length = 0;
  while (length < limit && a[length] === b[length]) {
    length++;
  }
  return length;
}

function commonSuffixLength(a, b, prefixLength) {
  const limit = Math.min(a.length, b.length) - prefixLength;
  let length = 0;
  while (length < limit && a[a.length - 1 - length] === b[b.length - 1 - length]) {
    length++;
  }
  return length;
}

function suffixLcsTable(a, b) {
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  return table;
}

function opsFor(op, tokens) {
  return tokens.map((token) => [op, token]);
}

function diffTokens(a, b) {
  const width = b.length + 1;
  const table = suffixLcsTable(a, b);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push([DIFF_EQUAL, a[i]]);
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.push([DIFF_DELETE, a[i]]);
      i++;
    } else {
      ops.push([DIFF_INSERT, b[j]]);
      j++;
    }
  }
  return [...ops, ...opsFor(DIFF_DELETE, a.slice(i)), ...opsFor(DIFF_INSERT, b.slice(j))];
}

function isChange(entry) {
  return entry !== undefined && entry[0] !== DIFF_EQUAL;
}

function isWhitespaceBetweenChanges(ops, index) {
  const [op, text] = ops[index];
  return op === DIFF_EQUAL && WHITESPACE_ONLY.test(text) && isChange(ops[index - 1]) && isChange(ops[index + 1]);
}

function absorbWhitespaceBetweenChanges(ops) {
  return ops.flatMap((entry, index) => {
    if (!isWhitespaceBetweenChanges(ops, index)) {
      return [entry];
    }
    return [[DIFF_DELETE, entry[1]], [DIFF_INSERT, entry[1]]];
  });
}

function sharedLeadingWhitespaceLength(a, b) {
  let length = 0;
  while (length < a.length && a[length] === b[length] && WHITESPACE_ONLY.test(a[length])) {
    length++;
  }
  return length;
}

function sharedTrailingWhitespaceLength(a, b) {
  let length = 0;
  while (
    length < a.length
    && length < b.length
    && a[a.length - 1 - length] === b[b.length - 1 - length]
    && WHITESPACE_ONLY.test(a[a.length - 1 - length])
  ) {
    length++;
  }
  return length;
}

function pushEqual(merged, text) {
  if (!text) {
    return;
  }
  const last = merged[merged.length - 1];
  if (last?.[0] === DIFF_EQUAL) {
    last[1] += text;
  } else {
    merged.push([DIFF_EQUAL, text]);
  }
}

function pushChange(merged, deleted, inserted) {
  const leading = sharedLeadingWhitespaceLength(deleted, inserted);
  const trailing = sharedTrailingWhitespaceLength(deleted.slice(leading), inserted.slice(leading));
  const removed = deleted.slice(leading, deleted.length - trailing);
  const added = inserted.slice(leading, inserted.length - trailing);
  pushEqual(merged, deleted.slice(0, leading));
  if (removed) {
    merged.push([DIFF_DELETE, removed]);
  }
  if (added) {
    merged.push([DIFF_INSERT, added]);
  }
  pushEqual(merged, deleted.slice(deleted.length - trailing));
}

function mergeRuns(ops) {
  const merged = [];
  let deleted = '';
  let inserted = '';
  for (const [op, text] of ops) {
    if (op === DIFF_DELETE) {
      deleted += text;
    } else if (op === DIFF_INSERT) {
      inserted += text;
    } else {
      pushChange(merged, deleted, inserted);
      deleted = '';
      inserted = '';
      pushEqual(merged, text);
    }
  }
  pushChange(merged, deleted, inserted);
  return merged;
}

function diffWords(oldText, newText) {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);
  const prefixLength = commonPrefixLength(oldTokens, newTokens);
  const suffixLength = commonSuffixLength(oldTokens, newTokens, prefixLength);
  const oldMiddle = oldTokens.slice(prefixLength, oldTokens.length - suffixLength);
  const newMiddle = newTokens.slice(prefixLength, newTokens.length - suffixLength);
  if ((oldMiddle.length + 1) * (newMiddle.length + 1) > MAX_LCS_CELLS) {
    return null;
  }
  const ops = [
    ...opsFor(DIFF_EQUAL, oldTokens.slice(0, prefixLength)),
    ...diffTokens(oldMiddle, newMiddle),
    ...opsFor(DIFF_EQUAL, oldTokens.slice(oldTokens.length - suffixLength)),
  ];
  return mergeRuns(absorbWhitespaceBetweenChanges(ops));
}

function segmentsFor(ops, changeOp) {
  return ops
    .filter(([op]) => op === DIFF_EQUAL || op === changeOp)
    .map(([op, text]) => ({ text, changed: op === changeOp }));
}

function sideBySideDiff(oldText, newText) {
  const ops = diffWords(oldText, newText);
  if (!ops) {
    return null;
  }
  return {
    oldSegments: segmentsFor(ops, DIFF_DELETE),
    newSegments: segmentsFor(ops, DIFF_INSERT),
    sharesText: ops.some(([op, text]) => op === DIFF_EQUAL && NON_WHITESPACE.test(text)),
  };
}

if (typeof module !== 'undefined') {
  module.exports = { diffWords, sideBySideDiff };
}
