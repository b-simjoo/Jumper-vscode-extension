'use strict';

const vscode = require('vscode');

const MAX_RESULTS = 300;
const MAX_LABEL = 160;

/**
 * Lines of `doc` that contain every whitespace-separated term of `query`
 * (case-insensitive unless the query has an uppercase letter).
 */
function findLines(doc, query) {
  const terms = query.split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const sensitive = /[A-Z]/.test(query);
  const needles = sensitive ? terms : terms.map((t) => t.toLowerCase());
  const items = [];
  for (let i = 0; i < doc.lineCount && items.length < MAX_RESULTS; i++) {
    const text = doc.lineAt(i).text;
    const hay = sensitive ? text : text.toLowerCase();
    if (needles.every((n) => hay.includes(n))) {
      items.push({
        label: (text.trim() || '(blank line)').slice(0, MAX_LABEL),
        description: String(i + 1),
        alwaysShow: true, // we filter ourselves; don't let the picker re-filter
        line: i,
        col: hay.indexOf(needles[0]),
      });
    }
  }
  return items;
}

function search(editor, marker, recordJump) {
  const doc = editor.document;
  const start = editor.selection.active;
  const topLine = editor.visibleRanges.length ? editor.visibleRanges[0].start.line : start.line;
  let accepted = false;

  const qp = vscode.window.createQuickPick();
  qp.placeholder = 'Search lines: ↑/↓ preview, Enter jump, Esc cancel';
  qp.matchOnDescription = false;
  qp.matchOnDetail = false;
  const sel = editor.selection;
  if (!sel.isEmpty && sel.isSingleLine) qp.value = doc.getText(sel);

  const update = () => {
    const items = findLines(doc, qp.value);
    qp.items = items;
    qp.title = qp.value.trim()
      ? `${items.length >= MAX_RESULTS ? `${MAX_RESULTS}+` : items.length} matching lines`
      : undefined;
  };

  // Scroll to the highlighted result without moving the cursor.
  const preview = (line) => {
    const range = new vscode.Range(line, 0, line, 0);
    editor.setDecorations(marker, [range]);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  };

  qp.onDidChangeValue(update);
  qp.onDidChangeActive((items) => {
    if (items[0]) preview(items[0].line);
  });
  qp.onDidAccept(() => {
    const item = qp.selectedItems[0] || qp.activeItems[0];
    if (!item) return;
    accepted = true;
    if (item.line !== start.line) {
      recordJump({ uri: doc.uri.toString(), line: start.line, character: start.character });
    }
    const pos = new vscode.Position(item.line, Math.max(item.col, 0));
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    qp.hide();
  });
  qp.onDidHide(() => {
    editor.setDecorations(marker, []);
    if (!accepted) {
      // Cancelled: put the view back where it was.
      editor.revealRange(new vscode.Range(topLine, 0, topLine, 0), vscode.TextEditorRevealType.AtTop);
    }
    qp.dispose();
  });

  update();
  qp.show();
}

function activate(context, hooks) {
  const recordJump = (hooks && hooks.recordJump) || (() => {});
  const marker = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    gutterIconPath: vscode.Uri.file(context.asAbsolutePath('media/landing.svg')),
    gutterIconSize: 'contain',
    backgroundColor: new vscode.ThemeColor('editor.rangeHighlightBackground'),
    overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.rangeHighlightForeground'),
    overviewRulerLane: vscode.OverviewRulerLane.Center,
  });
  context.subscriptions.push(
    marker,
    vscode.commands.registerCommand('kangaroo.search', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) search(editor, marker, recordJump);
    }),
  );
}

module.exports = { activate };
