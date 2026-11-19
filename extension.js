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
const history = []; // [{ uri, line, character }], newest last

// ---------- helpers ----------

function setActive(value) {
  active = value;
  vscode.commands.executeCommand('setContext', 'jumper.active', value);
  vscode.commands.executeCommand('setContext', 'jumper.peek', value && peekMode);
  if (value) {
    updateStatus();
    statusItem.show();
  } else {
    statusItem.hide();
  }
}

function updateStatus() {
  statusItem.text = `$(arrow-right) ${peekMode ? 'Peek' : 'Jump to'} line: ${buffer}`;
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
      'Jumper: another extension already overrides the "type" command.');
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
  buffer = '';
  origin = null;
  peekMode = false;
  setActive(false);
}

/** Leave the mode and stay where we are; remember where we came from. */
function accept() {
  if (!active) return;
  const editor = vscode.window.activeTextEditor;
  if (origin && buffer && editor && editor.document.uri.toString() === origin.uri &&
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
  const n = parseInt(buffer, 10);
  const line = Math.min(Math.max(n, 1), editor.document.lineCount) - 1;
  updateStatus();
  if (peekMode) {
    clearTimeout(peekTimer);
    pendingPeek = { editor, line };
    peekTimer = setTimeout(() => {
      pendingPeek = null;
      if (active) showPeekKeepingFocus(editor, line);
    }, 120);
    return;
  }
  goTo(editor, line, 0);
}

function onType(args) {
  if (!active) return vscode.commands.executeCommand('default:type', args);

  const digits = normalizeDigits(args && args.text);
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
  const last = editor.document.lineCount;
  const current = buffer !== ''
    ? Math.min(Math.max(parseInt(buffer, 10), 1), last)
    : (peekMode && origin ? origin.line : editor.selection.active.line) + 1;
  buffer = String(Math.min(Math.max(current + delta, 1), last));
  jumpToBuffer();
}

function backspace() {
  if (!active) return;
  buffer = buffer.slice(0, -1);
  if (peekMode) {
    if (buffer === '') {
      clearTimeout(peekTimer);
      pendingPeek = null;
      closePeek();
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
    vscode.window.setStatusBarMessage('Jumper: no earlier position', 2000);
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

  context.subscriptions.push(
    statusItem,
    { dispose: exitMode },
    vscode.commands.registerCommand('jumper.start', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && !active) enterMode(editor, false);
    }),
    vscode.commands.registerCommand('jumper.peek', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && !active) enterMode(editor, true);
    }),
    vscode.commands.registerCommand('jumper.acceptInsertAfter',
      () => acceptAndRun('editor.action.insertLineAfter')),
    vscode.commands.registerCommand('jumper.acceptInsertBefore',
      () => acceptAndRun('editor.action.insertLineBefore')),
    vscode.commands.registerCommand('jumper.lineEnd', () =>
      active && (peekMode ? peekLineMove(true) : moveInLine(true))),
    vscode.commands.registerCommand('jumper.lineStart', () =>
      active && (peekMode ? peekLineMove(false) : moveInLine(false))),
    vscode.commands.registerCommand('jumper.accept', () => (peekMode ? acceptPeek() : accept())),
    vscode.commands.registerCommand('jumper.cancel', cancel),
    vscode.commands.registerCommand('jumper.backspace', backspace),
    vscode.commands.registerCommand('jumper.lineUp', () => stepLine(-1)),
    vscode.commands.registerCommand('jumper.lineDown', () => stepLine(1)),
    vscode.commands.registerCommand('jumper.back', jumpBack),
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
