'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { diffWords, sideBySideDiff } = require('../word-diff.js');

const D = -1;
const E = 0;
const I = 1;

test('identical texts produce a single equal run', () => {
  assert.deepEqual(diffWords('same text', 'same text'), [[E, 'same text']]);
});

test('empty texts produce no ops', () => {
  assert.deepEqual(diffWords('', ''), []);
});

test('insertion into empty text', () => {
  assert.deepEqual(diffWords('', 'new text'), [[I, 'new text']]);
});

test('deletion of whole text', () => {
  assert.deepEqual(diffWords('old text', ''), [[D, 'old text']]);
});

test('single word replacement', () => {
  assert.deepEqual(diffWords('home page tiles and', 'home page cards and'), [
    [E, 'home page '],
    [D, 'tiles'],
    [I, 'cards'],
    [E, ' and'],
  ]);
});

test('inserted phrase is one run without gaps', () => {
  assert.deepEqual(diffWords('Applications opened from', 'Applications that you open from'), [
    [E, 'Applications '],
    [D, 'opened'],
    [I, 'that you open'],
    [E, ' from'],
  ]);
});

test('whitespace shared by both sides of a change stays unchanged', () => {
  assert.deepEqual(
    diffWords('opened from tiles and the tiles', 'that you open from cards and the cards'),
    [
      [D, 'opened'],
      [I, 'that you open'],
      [E, ' from '],
      [D, 'tiles'],
      [I, 'cards'],
      [E, ' and the '],
      [D, 'tiles'],
      [I, 'cards'],
    ],
  );
});

test('punctuation is a separate token', () => {
  assert.deepEqual(diffWords('Version: 1.2', 'Version: 1.3'), [
    [E, 'Version: 1.'],
    [D, '2'],
    [I, '3'],
  ]);
});

test('newlines are preserved in equal runs', () => {
  assert.deepEqual(diffWords('first line\nsecond', 'first line\nthird'), [
    [E, 'first line\n'],
    [D, 'second'],
    [I, 'third'],
  ]);
});

test('non-latin words are tokenized as words', () => {
  assert.deepEqual(diffWords('Привет, мир', 'Привет, весь мир'), [
    [E, 'Привет, '],
    [I, 'весь '],
    [E, 'мир'],
  ]);
});

test('side-by-side segments split ops per side', () => {
  assert.deepEqual(sideBySideDiff('a b c', 'a x c'), {
    oldSegments: [
      { text: 'a ', changed: false },
      { text: 'b', changed: true },
      { text: ' c', changed: false },
    ],
    newSegments: [
      { text: 'a ', changed: false },
      { text: 'x', changed: true },
      { text: ' c', changed: false },
    ],
    sharesText: true,
  });
});

test('texts without common words do not share text', () => {
  assert.equal(sideBySideDiff('None', 'Administrator Console').sharesText, false);
});

test('oversized middle part is rejected', () => {
  const oldText = Array.from({ length: 2100 }, (_, index) => `a${index}`).join(' ');
  const newText = Array.from({ length: 2100 }, (_, index) => `b${index}`).join(' ');
  assert.equal(sideBySideDiff(oldText, newText), null);
});
