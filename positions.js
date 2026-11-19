'use strict';

/**
 * Maps a position through a set of document changes so it keeps pointing at
 * the "same" place after edits.
 *
 * `changes` is the `contentChanges` array of a TextDocumentChangeEvent: every
 * range is expressed in the coordinates of the document *before* the event.
 * Applying them from the bottom of the file upwards keeps that true.
 *
 * pos: { line, character }  (0-based)
 * change: { range: { start, end }, text }
 */
function transformPosition(pos, changes, opts = {}) {
  // 'right': a position sitting exactly where text is *inserted* moves with
  // the text that was after it (what a bookmark on a line start wants).
  const stickRight = opts.affinity === 'right';
  const sorted = [...changes].sort((a, b) =>
    b.range.start.line - a.range.start.line ||
    b.range.start.character - a.range.start.character);

  let { line, character } = pos;

  for (const { range, text } of sorted) {
    const { start, end } = range;

    // Before the change: untouched.
    const isInsert = start.line === end.line && start.character === end.character;
    const atStart = line === start.line && character === start.character;
    if (line < start.line ||
        (line === start.line && character < start.character) ||
        (atStart && !(stickRight && isInsert))) {
      continue;
    }

    // Inside the replaced/deleted range: collapse to where the change starts.
    if (line < end.line || (line === end.line && character < end.character)) {
      line = start.line;
      character = start.character;
      continue;
    }

    // After the change: shift.
    const parts = text.split(/\r\n|\r|\n/);
    const addedLines = parts.length - 1;
    const removedLines = end.line - start.line;

    if (line === end.line) {
      const tail = character - end.character;
      character = addedLines === 0
        ? start.character + parts[0].length + tail
        : parts[parts.length - 1].length + tail;
    }
    line += addedLines - removedLines;
  }

  return { line, character };
}

module.exports = { transformPosition };
