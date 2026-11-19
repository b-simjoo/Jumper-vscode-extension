'use strict';

const vscode = require('vscode');
const { transformPosition } = require('./positions');

const STATE_KEY = 'kangaroo.bookmarks';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ctx;
let recordJump = () => {};
let bookmarks = []; // { id, uri, line, title, text, verified }
let decoration;
let picker = null;
let saveTimer = null;
const treeChanged = new vscode.EventEmitter();

// ---------- storage ----------
// Bookmarks live in <workspace>/.vscode/kangaroo-bookmarks.json (paths relative
// to the workspace folder, so the file can be committed and shared). Without
// an open folder they fall back to workspaceState.

let baseUri = null; // first workspace folder
let storeUri = null; // its .vscode/kangaroo-bookmarks.json
let loaded = false; // never write before a successful read
let lastWritten = ''; // exact file content we last read or wrote
let pendingMoves = false; // line numbers changed by edits, not yet saved

function initStore() {
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!folder) return;
  baseUri = folder.uri;
  storeUri = vscode.Uri.joinPath(folder.uri, '.vscode', 'kangaroo-bookmarks.json');
}

function wsPrefix() {
  return baseUri.path.replace(/\/$/, '') + '/';
}

function serialize() {
  const list = bookmarks.map((b) => {
    const u = vscode.Uri.parse(b.uri);
    const inWs = baseUri && u.scheme === baseUri.scheme && u.path.startsWith(wsPrefix());
    return {
      ...(inWs ? { file: u.path.slice(wsPrefix().length) } : { uri: b.uri }),
      line: b.line + 1, // 1-based in the file, like an editor shows it
      title: b.title,
      text: b.text || '',
    };
  });
  const key = (e) => e.file || e.uri;
  return list.sort((a, b) => key(a).localeCompare(key(b)) || a.line - b.line);
}

function deserialize(list) {
  return (Array.isArray(list) ? list : []).map((e, i) => ({
    id: Date.now().toString(36) + i + Math.random().toString(36).slice(2, 6),
    uri: e.uri || vscode.Uri.joinPath(baseUri, ...String(e.file).split('/')).toString(),
    line: Math.max((e.line | 0) - 1, 0),
    title: String(e.title || ''),
    text: String(e.text || ''),
    verified: false,
  }));
}

async function readStore() {
  try {
    return Buffer.from(await vscode.workspace.fs.readFile(storeUri)).toString('utf8');
  } catch (e) {
    return null; // missing
  }
}

/** Replace the in-memory list with what is on disk. */
async function loadFromDisk() {
  const raw = await readStore();
  if (raw === null) {
    // No file yet: pick up bookmarks from older versions (workspaceState).
    const legacy = ctx.workspaceState.get(STATE_KEY, []);
    bookmarks = legacy.map((b) => ({ ...b, verified: false }));
    lastWritten = '';
    loaded = true;
    if (bookmarks.length) {
      await persist();
      ctx.workspaceState.update(STATE_KEY, undefined);
    }
  } else {
    try {
      bookmarks = deserialize(JSON.parse(raw).bookmarks);
      lastWritten = raw;
      loaded = true;
    } catch (e) {
      loaded = false; // leave the broken file alone until it parses again
      bookmarks = [];
      vscode.window.showWarningMessage(
        'Kangaroo: .vscode/kangaroo-bookmarks.json is not valid JSON; bookmarks are read-only until it is fixed.');
    }
  }
  treeChanged.fire();
  vscode.workspace.textDocuments.forEach(verify);
  vscode.window.visibleTextEditors.forEach(decorate);
}

async function persist() {
  clearTimeout(saveTimer);
  pendingMoves = false;
  for (const b of bookmarks) {
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === b.uri);
    if (doc && b.line < doc.lineCount) b.text = doc.lineAt(b.line).text.trim();
  }
  if (!storeUri) {
    ctx.workspaceState.update(STATE_KEY, bookmarks.map(({ id, uri, line, title, text }) =>
      ({ id, uri, line, title, text })));
    return;
  }
  if (!loaded) return;
  const data = serialize();
  if (!data.length && lastWritten === '') return; // don't create an empty file
  const text = JSON.stringify({ version: 1, bookmarks: data }, null, 2) + '\n';
  if (text === lastWritten) return;
  lastWritten = text;
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(baseUri, '.vscode'));
  await vscode.workspace.fs.writeFile(storeUri, Buffer.from(text, 'utf8'));
}

/** `save: false` for pure line-number shifts caused by typing; those are
 *  written when a document is saved so the file matches what is on disk. */
function changed(save = true) {
  treeChanged.fire();
  vscode.window.visibleTextEditors.forEach(decorate);
  if (save) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  } else {
    pendingMoves = true;
  }
}

// ---------- tracking ----------

/**
 * First time a document is seen in this session: the file may have changed
 * outside the editor since the bookmark was saved, so make sure the stored
 * line still holds the same text; otherwise look for the nearest identical one.
 */
function verify(doc) {
  const uri = doc.uri.toString();
  let moved = false;
  for (const b of bookmarks) {
    if (b.uri !== uri || b.verified) continue;
    b.verified = true;
    const at = (n) => (n >= 0 && n < doc.lineCount ? doc.lineAt(n).text.trim() : null);
    if (!b.text || at(b.line) === b.text) continue;
    for (let d = 1; d < doc.lineCount; d++) {
      if (at(b.line - d) === b.text) { b.line -= d; moved = true; break; }
      if (at(b.line + d) === b.text) { b.line += d; moved = true; break; }
    }
    if (b.line >= doc.lineCount) { b.line = Math.max(doc.lineCount - 1, 0); moved = true; }
  }
  if (moved) changed();
}

function onDocumentChange(e) {
  if (e.contentChanges.length === 0) return;
  const uri = e.document.uri.toString();
  let any = false;
  for (const b of bookmarks) {
    if (b.uri !== uri) continue;
    const next = transformPosition({ line: b.line, character: 0 }, e.contentChanges,
      { affinity: 'right' });
    const line = Math.min(next.line, Math.max(e.document.lineCount - 1, 0));
    if (line !== b.line) { b.line = line; any = true; }
  }
  if (any) changed(false);
  // Always redraw this document's icons: the decoration ranges VS Code keeps
  // stretch over text typed at their edges (e.g. Enter at the end of a
  // bookmarked line), which would show the icon on the new line too.
  vscode.window.visibleTextEditors
    .filter((ed) => ed.document.uri.toString() === uri)
    .forEach(decorate);
}

// ---------- gutter icons ----------

function decorate(editor) {
  const uri = editor.document.uri.toString();
  const options = bookmarks
    .filter((b) => b.uri === uri && b.line < editor.document.lineCount)
    .map((b) => ({
      range: editor.document.lineAt(b.line).range,
      hoverMessage: new vscode.MarkdownString().appendText(`Bookmark: ${b.title}`),
    }));
  editor.setDecorations(decoration, options);
}

// ---------- operations ----------

const at = (uri, line) => bookmarks.find((b) => b.uri === uri && b.line === line);
const rel = (uri) => vscode.workspace.asRelativePath(vscode.Uri.parse(uri));

function atCursor() {
  const editor = vscode.window.activeTextEditor;
  return editor && at(editor.document.uri.toString(), editor.selection.active.line);
}

async function addBookmark(editor) {
  const doc = editor.document;
  const line = editor.selection.active.line;
  const text = doc.lineAt(line).text.trim();
  const title = await vscode.window.showInputBox({
    prompt: `Bookmark title (line ${line + 1})`,
    value: text.slice(0, 60),
  });
  if (title === undefined) return;
  bookmarks.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    uri: doc.uri.toString(),
    line,
    title: title.trim() || text.slice(0, 60) || `Line ${line + 1}`,
    text,
    verified: true,
  });
  changed();
}

function toggle() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const existing = atCursor();
  if (existing) {
    bookmarks = bookmarks.filter((b) => b !== existing);
    changed();
    vscode.window.setStatusBarMessage(`Bookmark removed: ${existing.title}`, 2000);
  } else {
    addBookmark(editor);
  }
}

async function rename(node) {
  const bm = (node && node.bm) || atCursor();
  if (!bm) return;
  const title = await vscode.window.showInputBox({ prompt: 'Bookmark title', value: bm.title });
  if (title === undefined || !title.trim()) return;
  bm.title = title.trim();
  changed();
}

function remove(node) {
  const bm = (node && node.bm) || atCursor();
  if (!bm) return;
  bookmarks = bookmarks.filter((b) => b !== bm);
  changed();
}

async function clearAll() {
  if (!bookmarks.length) return;
  const yes = await vscode.window.showWarningMessage(
    `Delete all ${bookmarks.length} bookmarks?`, { modal: true }, 'Delete all');
  if (yes) { bookmarks = []; changed(); }
}

async function loadDoc(bm) {
  const uri = vscode.Uri.parse(bm.uri);
  const doc = await vscode.workspace.openTextDocument(uri);
  verify(doc);
  return doc;
}

async function openBookmark(bm, side) {
  const from = vscode.window.activeTextEditor;
  const doc = await loadDoc(bm);
  if (from) {
    recordJump({
      uri: from.document.uri.toString(),
      line: from.selection.active.line,
      character: from.selection.active.character,
    });
  }
  const editor = await vscode.window.showTextDocument(doc, {
    viewColumn: side ? vscode.ViewColumn.Beside : undefined,
  });
  const line = Math.min(bm.line, doc.lineCount - 1);
  const pos = new vscode.Position(line, doc.lineAt(line).firstNonWhitespaceCharacterIndex);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

async function peekBookmark(bm) {
  const from = vscode.window.activeTextEditor;
  const doc = await loadDoc(bm);
  if (!from) return openBookmark(bm, false);
  const line = Math.min(bm.line, doc.lineCount - 1);
  // peekLocations toggles when asked for the same anchor: close any peek first.
  await vscode.commands.executeCommand('closeReferenceSearch');
  await vscode.commands.executeCommand(
    'editor.action.peekLocations', from.document.uri, from.selection.active,
    [new vscode.Location(doc.uri, new vscode.Range(line, 0, line, 0))], 'peek');
  // The peek focuses its reference list by default; put the caret in its editor.
  await sleep(100);
  if (vscode.workspace.getConfiguration('editor').get('peekWidgetDefaultFocus') !== 'editor') {
    await vscode.commands.executeCommand('togglePeekWidgetFocus');
  }
}

// ---------- searchable list ----------

function pickBookmarks() {
  if (!bookmarks.length) {
    vscode.window.showInformationMessage('Kangaroo: no bookmarks yet.');
    return;
  }
  const sorted = [...bookmarks].sort((a, b) =>
    rel(a.uri).localeCompare(rel(b.uri)) || a.line - b.line);

  const qp = vscode.window.createQuickPick();
  qp.placeholder = 'Search bookmarks — Enter: go · ⌘/Ctrl+Enter: open to the side · ⌘/Ctrl+Shift+Enter: peek';
  qp.matchOnDescription = true;
  qp.matchOnDetail = true;
  qp.items = sorted.map((b) => ({
    label: `$(bookmark) ${b.title}`,
    description: `${rel(b.uri)}:${b.line + 1}`,
    detail: b.text,
    bm: b,
  }));
  picker = qp;
  vscode.commands.executeCommand('setContext', 'kangaroo.bookmarkPicker', true);

  qp.onDidAccept(() => {
    const item = qp.selectedItems[0];
    qp.hide();
    if (item) openBookmark(item.bm, false);
  });
  qp.onDidHide(() => {
    picker = null;
    vscode.commands.executeCommand('setContext', 'kangaroo.bookmarkPicker', false);
    qp.dispose();
  });
  qp.show();
}

/** Run `fn` on the highlighted item of the open list, closing the list first. */
const withPicked = (fn) => async () => {
  const item = picker && picker.activeItems[0];
  if (!item) return;
  picker.hide();
  await sleep(80); // let focus return to the editor
  fn(item.bm);
};

// ---------- side panel ----------

class BookmarkTree {
  constructor() { this.onDidChangeTreeData = treeChanged.event; }

  getTreeItem(node) {
    if (node.kind === 'file') {
      const item = new vscode.TreeItem(
        vscode.Uri.parse(node.uri).path.split('/').pop(),
        vscode.TreeItemCollapsibleState.Expanded);
      item.description = rel(node.uri);
      item.resourceUri = vscode.Uri.parse(node.uri);
      item.iconPath = vscode.ThemeIcon.File;
      item.contextValue = 'bookmarkFile';
      return item;
    }
    const b = node.bm;
    const item = new vscode.TreeItem(b.title, vscode.TreeItemCollapsibleState.None);
    item.description = `:${b.line + 1}`;
    item.tooltip = `${rel(b.uri)}:${b.line + 1}\n${b.text || ''}`;
    item.iconPath = new vscode.ThemeIcon('bookmark');
    item.contextValue = 'bookmark';
    item.command = { command: 'kangaroo.bookmark.open', title: 'Open', arguments: [node] };
    return item;
  }

  getChildren(node) {
    if (!node) {
      const uris = [...new Set(bookmarks.map((b) => b.uri))]
        .sort((a, b) => rel(a).localeCompare(rel(b)));
      return uris.map((uri) => ({ kind: 'file', uri }));
    }
    if (node.kind === 'file') {
      return bookmarks.filter((b) => b.uri === node.uri)
        .sort((a, b) => a.line - b.line)
        .map((bm) => ({ kind: 'bookmark', bm }));
    }
    return [];
  }
}

// ---------- activation ----------

function activate(context, hooks) {
  ctx = context;
  recordJump = (hooks && hooks.recordJump) || recordJump;
  initStore();
  loadFromDisk();

  decoration = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.file(context.asAbsolutePath('media/bookmark.svg')),
    gutterIconSize: 'contain',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    overviewRulerColor: '#3794ff',
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });

  const cmd = vscode.commands.registerCommand;
  context.subscriptions.push(
    decoration,
    vscode.workspace.onDidSaveTextDocument(() => { if (pendingMoves) persist(); }),
    vscode.window.createTreeView('kangaroo.bookmarks', { treeDataProvider: new BookmarkTree() }),
    cmd('kangaroo.bookmark.toggle', toggle),
    cmd('kangaroo.bookmark.rename', rename),
    cmd('kangaroo.bookmark.delete', remove),
    cmd('kangaroo.bookmark.clearAll', clearAll),
    cmd('kangaroo.bookmark.open', (node) => node && node.bm && openBookmark(node.bm, false)),
    cmd('kangaroo.bookmarks.pick', pickBookmarks),
    cmd('kangaroo.bookmarks.pickOpenSide', withPicked((bm) => openBookmark(bm, true))),
    cmd('kangaroo.bookmarks.pickPeek', withPicked(peekBookmark)),
    vscode.workspace.onDidChangeTextDocument(onDocumentChange),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      verify(doc);
      vscode.window.visibleTextEditors.forEach(decorate);
    }),
    vscode.window.onDidChangeVisibleTextEditors((eds) => eds.forEach(decorate)),
  );

  if (storeUri) {
    // Pick up edits made outside the extension (git pull, manual edit).
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(baseUri, '.vscode/kangaroo-bookmarks.json'));
    const reload = async () => {
      const raw = await readStore();
      if (raw === lastWritten || (raw === null && lastWritten === '')) return; // our own write
      await loadFromDisk();
    };
    context.subscriptions.push(watcher, watcher.onDidChange(reload),
      watcher.onDidCreate(reload), watcher.onDidDelete(reload));
  }
}

function deactivate() {
  return persist();
}

module.exports = { activate, deactivate };
