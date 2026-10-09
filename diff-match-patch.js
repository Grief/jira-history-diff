/**
 * Simplified diff-match-patch implementation for word-level diffing
 * Focused on what's needed for Jira history diffs
 */

(function(global) {
  'use strict';

  class DiffMatchPatch {
    constructor() {
      this.Diff_Timeout = 1.0;
      this.Diff_EditCost = 4;
    }

    /**
     * Find differences between two texts at word level
     * @param {string} text1 Old text
     * @param {string} text2 New text
     * @returns {Array} Array of [op, text] where op: -1 (delete), 0 (equal), 1 (insert)
     */
    diff_main(text1, text2) {
      if (text1 === text2) {
        return text1 ? [[0, text1]] : [];
      }

      // Split by words
      const words1 = this.diff_split_(text1);
      const words2 = this.diff_split_(text2);

      return this.diff_compute_(words1, words2);
    }

    /**
     * Split text into words
     */
    diff_split_(text) {
      // Split by whitespace and punctuation boundaries
      const words = [];
      let current = '';

      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const isWhitespace = /\s/.test(char);

        if (isWhitespace) {
          if (current) {
            words.push(current);
            current = '';
          }
          words.push(char); // preserve whitespace
        } else {
          current += char;
        }
      }

      if (current) {
        words.push(current);
      }

      return words;
    }

    /**
     * Compute differences between word arrays using Myers' algorithm
     */
    diff_compute_(words1, words2) {
      const diffs = [];
      const len1 = words1.length;
      const len2 = words2.length;

      // Quick path: one is empty
      if (len1 === 0) {
        if (len2 > 0) {
          return [[1, words2.join('')]];
        }
        return [];
      }
      if (len2 === 0) {
        return [[-1, words1.join('')]];
      }

      // Find common prefix
      let commonLength = 0;
      while (
        commonLength < len1 &&
        commonLength < len2 &&
        words1[commonLength] === words2[commonLength]
      ) {
        commonLength++;
      }

      let prefix = '';
      if (commonLength > 0) {
        prefix = words1.slice(0, commonLength).join('');
        if (prefix) {
          diffs.push([0, prefix]);
        }
      }

      // Find common suffix
      let commonSuffixLength = 0;
      while (
        commonSuffixLength < len1 - commonLength &&
        commonSuffixLength < len2 - commonLength &&
        words1[len1 - 1 - commonSuffixLength] === words2[len2 - 1 - commonSuffixLength]
      ) {
        commonSuffixLength++;
      }

      const suffix = commonSuffixLength > 0 ? words1.slice(len1 - commonSuffixLength).join('') : '';

      // Middle part
      const midWords1 = words1.slice(commonLength, len1 - commonSuffixLength);
      const midWords2 = words2.slice(commonLength, len2 - commonSuffixLength);

      if (midWords1.length === 0 && midWords2.length === 0) {
        if (suffix) {
          diffs.push([0, suffix]);
        }
        return diffs;
      }

      const midDiffs = this.diff_lcs_(midWords1, midWords2);

      for (const [op, text] of midDiffs) {
        diffs.push([op, text]);
      }

      if (suffix) {
        diffs.push([0, suffix]);
      }

      return diffs;
    }

    /**
     * Find longest common subsequence using dynamic programming
     */
    diff_lcs_(words1, words2) {
      const len1 = words1.length;
      const len2 = words2.length;

      // Build LCS table
      const dp = Array(len1 + 1)
        .fill(null)
        .map(() => Array(len2 + 1).fill(0));

      for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
          if (words1[i - 1] === words2[j - 1]) {
            dp[i][j] = dp[i - 1][j - 1] + 1;
          } else {
            dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
          }
        }
      }

      // Backtrack to build diffs
      const diffs = [];
      let i = len1;
      let j = len2;

      while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && words1[i - 1] === words2[j - 1]) {
          // Match: both move
          diffs.unshift([0, words1[i - 1]]);
          i--;
          j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
          // Insert from words2
          diffs.unshift([1, words2[j - 1]]);
          j--;
        } else if (i > 0) {
          // Delete from words1
          diffs.unshift([-1, words1[i - 1]]);
          i--;
        } else {
          j--;
        }
      }

      return diffs;
    }
  }

  // Export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiffMatchPatch;
  }
  global.diff_match_patch = DiffMatchPatch;
})(typeof window !== 'undefined' ? window : global);
