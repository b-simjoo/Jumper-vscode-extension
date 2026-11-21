'use strict';

const vscode = require('vscode');
const { transformPosition } = require('./positions');

const MAX_HISTORY = 100;
const MAX_DIGITS = 9;

let active = false;
let buffer = '';
let origin = null; // { uri, line, character } where the jump session started
let peekMode = false; // digits open a peek box instead of moving the cursor
let peekTimer = null;
let pendingPeek = null; // { editor, line } scheduled but not yet shown
let typeHook = null; // disposable for our temporary `type` override
let statusItem;
// Relative mode: typing "+" or "-" shows relative line numbers and treats the
// digits as an offset from `relBase` (the cursor line at that moment).
let sign = 0; // 0 = absolute, 1 = down (+), -1 = up (-)
let relBase = 0;
let relTarget = null; // line the offset currently points at (non-peek preview)
let relEditor = null; // editor whose line numbers we switched
let savedLineNumbers;
let highlight; // decoration for the previewed target line
let landing; // gutter marker (ellipse + down arrow) on the line being chosen
let markEditor = null;
const history = []; // [{ uri, line, character }], newest last

// ---------- helpers ----------

function setActive(value) {
  active = value;
  vscode.commands.executeCommand('setContext', 'kangaroo.active', value);
  vscode.commands.executeCommand('setContext', 'kangaroo.peek', value && peekMode);
  if (value) {
    updateStatus();
    statusItem.show();
  } else {
    statusItem.hide();
  }
}

function updateStatus() {
  const prefix = sign > 0 ? '+' : sign < 0 ? '-' : '';
  statusItem.text = `$(arrow-right) ${peekMode ? 'Peek' : 'Jump to'} line: ${prefix}${buffer}` +
    (sign ? ' (relative)' : '');
}

function markLanding(editor, line) {
  markEditor = editor;
  editor.setDecorations(landing, [new vscode.Range(line, 0, line, 0)]);
}

function clearLanding() {
  if (markEditor) {
    try { markEditor.setDecorations(landing, []); } catch (e) { /* editor closed */ }
    markEditor = null;
  }
}

function clearHighlight() {
  clearLanding();
  if (relEditor) {
    try { relEditor.setDecorations(highlight, []); } catch (e) { /* editor closed */ }
  }
}

function restoreLineNumbers() {
  clearHighlight();
  if (relEditor && savedLineNumbers !== undefined) {
    try { relEditor.options = { lineNumbers: savedLineNumbers }; } catch (e) { /* editor closed */ }
  }
  relEditor = null;
  savedLineNumbers = undefined;
  sign = 0;
  relTarget = null;
}

/** "+" / "-": show relative numbers and read the digits as an offset. */
function setSign(newSign) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !origin || editor.document.uri.toString() !== origin.uri) return;
  if (sign === 0) {
    relBase = editor.selection.active.line;
    buffer = '';
    relEditor = editor;
    savedLineNumbers = editor.options.lineNumbers;
    editor.options = { lineNumbers: vscode.TextEditorLineNumbersStyle.Relative };
    if (peekMode) {
      clearTimeout(peekTimer);
      pendingPeek = null;
      closePeek();
    }
  }
  sign = newSign;
  updateStatus();
  if (buffer) jumpToBuffer();
}

/** The line the typed number points at, or null while nothing is typed. */
function targetLineFor(editor) {
  const last = editor.document.lineCount - 1;
  if (sign) {
    if (buffer === '') return null;
    return Math.min(Math.max(relBase + sign * parseInt(buffer, 10), 0), last);
  }
  return Math.min(Math.max(parseInt(buffer, 10), 1), last + 1) - 1;
}

/** Relative mode keeps the cursor still while typing; move it for real now. */
function commitRelative() {
  const editor = vscode.window.activeTextEditor;
  if (sign && relTarget !== null && editor && origin &&
      editor.document.uri.toString() === origin.uri) {
    goTo(editor, relTarget, 0);
  }
}

/** Accepts ASCII, Persian (۰-۹) and Arabic-Indic (٠-٩) digits. */
function normalizeDigits(text) {
  if (typeof text !== 'string' || !/^[0-9۰-۹٠-٩]+$/.test(text)) {
    return null;
  }
  return text.replace(/[۰-۹]/g, (c) => c.charCodeAt(0) - 0x06F0)
    .replace(/[٠-٩]/g, (c) => c.charCodeAt(0) - 0x0660);
}

function goTo(editor, line, character) {
  const pos = editor.document.validatePosition(new vscode.Position(line, character));
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

function pushHistory(entry) {
  const last = history[history.length - 1];
  if (last && last.uri === entry.uri && last.line === entry.line) return;
  history.push(entry);
  if (history.length > MAX_HISTORY) history.shift();
}

// ---------- jump session ----------

function enterMode(editor, peek) {
  peekMode = !!peek;
  origin = {
    uri: editor.document.uri.toString(),
    line: editor.selection.active.line,
    character: editor.selection.active.character,
  };
  buffer = '';
  setActive(true);
  // Claim `type` only while the mode is on, so we don't clash with other
  // extensions (e.g. Vim) that override it permanently.
  try {
    typeHook = vscode.commands.registerCommand('type', onType);
  } catch (e) {
    setActive(false);
    vscode.window.showWarningMessage(
      'Kangaroo: another extension already overrides the "type" command.');
  }
}

function closePeek() {
  vscode.commands.executeCommand('closeReferenceSearch');
}

function exitMode() {
  clearTimeout(peekTimer);
  peekTimer = null;
  pendingPeek = null;
  if (typeHook) {
    typeHook.dispose();
    typeHook = null;
  }
  clearLanding();
  restoreLineNumbers();
  buffer = '';
  origin = null;
  peekMode = false;
  setActive(false);
}

/** Leave the mode and stay where we are; remember where we came from. */
function accept() {
  if (!active) return;
  commitRelative();
  const editor = vscode.window.activeTextEditor;
  if (origin && (buffer || sign) && editor && editor.document.uri.toString() === origin.uri &&
      editor.selection.active.line !== origin.line) {
    pushHistory({ ...origin });
  }
  exitMode();
}

/** Leave the mode and go back to where the session started. */
function cancel() {
  if (!active) return;
  if (peekMode) closePeek();
  const editor = vscode.window.activeTextEditor;
  if (origin && editor && editor.document.uri.toString() === origin.uri) {
    goTo(editor, origin.line, origin.character);
  }
  exitMode();
}

/** Cursor to end/start of the current line, then leave the mode. */
function moveInLine(toEnd) {
  commitRelative();
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const line = editor.selection.active.line;
    goTo(editor, line, toEnd ? editor.document.lineAt(line).text.length : 0);
  }
  accept();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Leave the mode in peek mode and put the keyboard focus inside the peek
 * box, so the line there can be edited right away.
 * VS Code focuses the peek's reference tree by default
 * (editor.peekWidgetDefaultFocus = "tree"), so we move focus to the preview
 * editor ourselves via `togglePeekWidgetFocus`.
 */
async function acceptPeek() {
  if (!active) return;
  const hadPeek = buffer !== '';
  const pending = pendingPeek;
  exitMode();
  if (!hadPeek) return;
  if (pending) await showPeek(pending.editor, pending.line);
  await sleep(100);
  // After a normal live update we handed focus back to the main editor (see
  // showPeekKeepingFocus), so the preview editor always needs the toggle,
  // except when the peek was just opened with the "editor" default focus.
  const focus = vscode.workspace.getConfiguration('editor').get('peekWidgetDefaultFocus');
  if (!(pending && focus === 'editor')) {
    await vscode.commands.executeCommand('togglePeekWidgetFocus');
  }
}

/**
 * Show the peek, then give the focus back to the main editor. A peek steals
 * focus into its own list, where key presses never reach our `type` hook;
 * with the main editor focused, every key keeps going through the hook.
 */
async function showPeekKeepingFocus(editor, line) {
  await showPeek(editor, line);
  await sleep(80);
  if (active && peekMode && !pendingPeek) {
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
  }
}

/** Leave the mode, then run a command (e.g. insert a line) where we landed. */
async function acceptAndRun(command) {
  if (!active) return;
  if (peekMode) await acceptPeek();
  else accept();
  await vscode.commands.executeCommand(command);
}

/** Left/Right in peek mode: focus the peeked line's editor, then Home/End. */
async function peekLineMove(toEnd) {
  await acceptPeek();
  await vscode.commands.executeCommand(toEnd ? 'cursorEnd' : 'cursorHome');
}

async function showPeek(editor, line) {
  // peekLocations *toggles*: asked for the same anchor while a peek is open,
  // it just closes it. So always close first (a no-op when nothing is open).
  await vscode.commands.executeCommand('closeReferenceSearch');
  const uri = editor.document.uri;
  const loc = new vscode.Location(uri, new vscode.Range(line, 0, line, 0));
  return vscode.commands.executeCommand(
    'editor.action.peekLocations', uri, editor.selection.active, [loc], 'peek');
}

function jumpToBuffer() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !origin || editor.document.uri.toString() !== origin.uri) {
    exitMode();
    return;
  }
  const line = targetLineFor(editor);
  updateStatus();
  if (line === null) {
    relTarget = null;
    clearHighlight();
    return;
  }
  relTarget = sign ? line : null;
  markLanding(editor, line);
  if (peekMode) {
    clearTimeout(peekTimer);
    pendingPeek = { editor, line };
    peekTimer = setTimeout(() => {
      pendingPeek = null;
      if (active) showPeekKeepingFocus(editor, line);
    }, 120);
    return;
  }
  if (sign) {
    // Cursor stays put so the relative numbers keep meaning; just preview.
    const range = new vscode.Range(line, 0, line, 0);
    editor.setDecorations(highlight, [range]);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    return;
  }
  goTo(editor, line, 0);
}

function onType(args) {
  if (!active) return vscode.commands.executeCommand('default:type', args);

  const key = args && args.text;
  if (key === '+' || key === '-') {
    setSign(key === '+' ? 1 : -1);
    return undefined;
  }

  const digits = normalizeDigits(key);
  if (digits !== null) {
    if (buffer.length + digits.length <= MAX_DIGITS) {
      buffer += digits;
      jumpToBuffer();
    }
    return undefined;
  }

  // Non-numeric key: leave the mode and type it right where we are.
  if (peekMode) {
    return acceptPeek().then(() => vscode.commands.executeCommand('default:type', args));
  }
  accept();
  return vscode.commands.executeCommand('default:type', args);
}

/** Up/Down while in the mode: line number -1 / +1 (clamped to the file). */
function stepLine(delta) {
  const editor = vscode.window.activeTextEditor;
  if (!active || !editor) return;
  if (sign) {
    // Relative: move the signed offset by one, kept inside the file.
    const last = editor.document.lineCount - 1;
    const offset = (buffer ? sign * parseInt(buffer, 10) : 0) + delta;
    const clamped = Math.min(Math.max(offset, -relBase), last - relBase);
    if (clamped !== 0) sign = clamped < 0 ? -1 : 1;
    buffer = String(Math.abs(clamped));
    jumpToBuffer();
    return;
  }
  const last = editor.document.lineCount;
  const current = buffer !== ''
    ? Math.min(Math.max(parseInt(buffer, 10), 1), last)
    : (peekMode && origin ? origin.line : editor.selection.active.line) + 1;
  buffer = String(Math.min(Math.max(current + delta, 1), last));
  jumpToBuffer();
}

function backspace() {
  if (!active) return;
  if (sign) {
    if (buffer === '') {
      // Nothing left to delete but the sign itself: back to absolute numbers.
      restoreLineNumbers();
      updateStatus();
      return;
    }
    buffer = buffer.slice(0, -1);
    if (buffer === '') {
      relTarget = null;
      clearHighlight();
      clearTimeout(peekTimer);
      pendingPeek = null;
      if (peekMode) closePeek();
      updateStatus();
    } else {
      jumpToBuffer();
    }
    return;
  }
  buffer = buffer.slice(0, -1);
  if (peekMode) {
    if (buffer === '') {
      clearTimeout(peekTimer);
      pendingPeek = null;
      closePeek();
      clearLanding();
      updateStatus();
    } else {
      jumpToBuffer();
    }
    return;
  }
  if (buffer === '') {
    // Nothing typed anymore -> back to where we started (still in the mode).
    const editor = vscode.window.activeTextEditor;
    if (origin && editor && editor.document.uri.toString() === origin.uri) {
      goTo(editor, origin.line, origin.character);
    }
    clearLanding();
    updateStatus();
  } else {
    jumpToBuffer();
  }
}

// ---------- jump back (edit-aware) ----------

async function jumpBack() {
  if (active) accept();

  const editor = vscode.window.activeTextEditor;
  const here = editor && {
    uri: editor.document.uri.toString(),
    line: editor.selection.active.line,
  };

  let entry;
  // Skip entries that point at where we already are.
  while ((entry = history.pop())) {
    if (!here || entry.uri !== here.uri || entry.line !== here.line) break;
  }
  if (!entry) {
    vscode.window.setStatusBarMessage('Kangaroo: no earlier position', 2000);
    return;
  }

  const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(entry.uri));
  const target = await vscode.window.showTextDocument(doc, { preserveFocus: false });
  goTo(target, entry.line, entry.character);
}

/** Keep stored positions glued to the text when the document changes. */
function onDocumentChange(e) {
  if (e.contentChanges.length === 0) return;
  const uri = e.document.uri.toString();
  const apply = (p) => {
    if (p.uri !== uri) return;
    const next = transformPosition(p, e.contentChanges);
    p.line = next.line;
    p.character = next.character;
  };
  history.forEach(apply);
  if (origin) apply(origin);
}

// ---------- activation ----------

function activate(context) {
  require('./bookmarks').activate(context, { recordJump: pushHistory });
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
  setActive(false);
  landing = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.file(context.asAbsolutePath('media/landing.svg')),
    gutterIconSize: 'contain',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  highlight = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('editor.rangeHighlightBackground'),
    overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.rangeHighlightForeground'),
    overviewRulerLane: vscode.OverviewRulerLane.Center,
  });

  context.subscriptions.push(
    statusItem,
    highlight,
    landing,
    { dispose: exitMode },
    vscode.commands.registerCommand('kangaroo.start', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && !active) enterMode(editor, false);
    }),
    vscode.commands.registerCommand('kangaroo.peek', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && !active) enterMode(editor, true);
    }),
    vscode.commands.registerCommand('kangaroo.acceptInsertAfter',
      () => acceptAndRun('editor.action.insertLineAfter')),
    vscode.commands.registerCommand('kangaroo.acceptInsertBefore',
      () => acceptAndRun('editor.action.insertLineBefore')),
    vscode.commands.registerCommand('kangaroo.lineEnd', () =>
      active && (peekMode ? peekLineMove(true) : moveInLine(true))),
    vscode.commands.registerCommand('kangaroo.lineStart', () =>
      active && (peekMode ? peekLineMove(false) : moveInLine(false))),
    vscode.commands.registerCommand('kangaroo.accept', () => (peekMode ? acceptPeek() : accept())),
    vscode.commands.registerCommand('kangaroo.cancel', cancel),
    vscode.commands.registerCommand('kangaroo.backspace', backspace),
    vscode.commands.registerCommand('kangaroo.lineUp', () => stepLine(-1)),
    vscode.commands.registerCommand('kangaroo.lineDown', () => stepLine(1)),
    vscode.commands.registerCommand('kangaroo.back', jumpBack),
    vscode.workspace.onDidChangeTextDocument(onDocumentChange),
    // Cursor moved by arrows/mouse, or another editor focused: leave the mode.
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (active && (e.kind === vscode.TextEditorSelectionChangeKind.Keyboard ||
                     e.kind === vscode.TextEditorSelectionChangeKind.Mouse)) {
        accept();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(() => active && accept())
  );
}

function deactivate() {
  exitMode();
  return require('./bookmarks').deactivate();
}

module.exports = { activate, deactivate };
