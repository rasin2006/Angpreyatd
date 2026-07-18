/**
 * TypeBattle scoring — shared between server and browser.
 * Score blends WPM (45%), accuracy (35%), and words typed correctly (20%).
 */

function normalizeTextMode(mode) {
  if (mode === 'words') return 'word';
  if (mode === 'word' || mode === 'time' || mode === 'quote') return mode;
  return 'word';
}

function countTotalWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countCorrectWords(typed, text) {
  if (!typed || !text) return 0;
  const targetWords = text.trim().split(/\s+/).filter(Boolean);
  const typedWords = typed.trim().split(/\s+/).filter(Boolean);
  let correct = 0;
  for (let i = 0; i < typedWords.length && i < targetWords.length; i++) {
    if (typedWords[i] === targetWords[i]) correct++;
  }
  return correct;
}

function wordsAttempted(typed) {
  if (!typed) return 0;
  return typed.trim().split(/\s+/).filter(Boolean).length;
}

function countCorrectChars(typed, text) {
  if (!typed || !text) return 0;
  let correct = 0;
  for (let i = 0; i < typed.length && i < text.length; i++) {
    if (typed[i] === text[i]) correct++;
  }
  return correct;
}

function wordCorrectPercent(correctWords, totalWords, typed) {
  if (totalWords <= 0) return 0;
  const isTimeMode = totalWords > 200; // Heuristic for time mode
  if (isTimeMode && typed) {
    return (countCorrectChars(typed, typed) / typed.length) * 100;
  }
  return totalWords > 0 ? (Math.min(correctWords || 0, totalWords) / totalWords) * 100 : 0;
}

function calcTypingScore(wpm, accuracy, correctWords, totalWords, typed) {
  const wpmNorm = Math.min(Math.max(wpm || 0, 0), 200) / 200 * 100;
  const acc = Math.min(Math.max(accuracy || 0, 0), 100);
  const wordPct = wordCorrectPercent(correctWords, totalWords, typed);
  return Math.round(wpmNorm * 0.45 + acc * 0.35 + wordPct * 0.20);
}

function isTextComplete(typed, text) {
  if (!typed || !text) return false;
  const totalWords = countTotalWords(text);
  const attempted = wordsAttempted(typed);
  return attempted >= totalWords;
}

function assignPlacesByScore(room, clients) {
  const totalWords = countTotalWords(room.text);
  const ranked = room.players
    .map((pid) => clients[pid])
    .filter(Boolean)
    .map((c) => {
      const correctWords = c.correctWords ?? countCorrectWords(c.lastTyped || '', room.text);
      const score = calcTypingScore(c.wpm, c.accuracy, correctWords, totalWords, c.lastTyped || '');
      c.correctWords = correctWords;
      c.score = score;
      return c;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.finished && b.finished) return (a.finishTime || 9999) - (b.finishTime || 9999);
      if (a.finished) return -1;
      if (b.finished) return 1;
      return (b.wpm || 0) - (a.wpm || 0);
    });

  ranked.forEach((c, i) => {
    c.place = i + 1;
  });
  return ranked;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeTextMode,
    countTotalWords,
    countCorrectWords,
    calcTypingScore,
    isTextComplete,
    assignPlacesByScore,
    countCorrectChars,
    wordCorrectPercent,
    wordsAttempted,
  };
}
