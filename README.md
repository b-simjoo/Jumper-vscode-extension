<p align="center"><img src="media/icon.png" width="128" alt="Kangaroo icon"></p>

# Kangaroo

**Move around your code at the speed of thought.**
Kangaroo turns "go to line" into a dialog-free, keyboard-only flow, lets you peek at and edit any line without leaving your spot, searches lines with a live scrolling preview, keeps a jump-back history that survives edits, and ships workspace-wide bookmarks that stick to the *code*, not to a line number.

- ⌨️ **Inline go-to-line**: no dialog, just type the number, or `+5` / `-3` for relative jumps
- 👀 **Peek a line**: see (and edit) any line in a floating box without leaving your spot
- 🔎 **Search lines**: list every matching line and watch the editor scroll to each result as you move through them
- ↩️ **Jump back**: return to where you were, even after the file changed
- 🔖 **Bookmarks**: titled, tracked through edits, saved in `.vscode/`, searchable

> **Keys on macOS:** this document uses the Windows/Linux keys. On a Mac, read <kbd>Ctrl</kbd> as <kbd>⌘</kbd> (Command), <kbd>Alt</kbd> as <kbd>⌥</kbd> (Option) and <kbd>Shift</kbd> as <kbd>⇧</kbd>. Every table also lists the Mac keys in full.

---

## Inline go-to-line

Press <kbd>Ctrl</kbd>+<kbd>L</kbd> (macOS: <kbd>⌘</kbd><kbd>L</kbd>) and just start typing digits. The cursor follows you live.

| Key | macOS | What it does |
| --- | --- | --- |
| `0`–`9` (also `۰`–`۹`, `٠`–`٩`) | same | Jump to that line as you type |
| `+` / `-` | same | Switch the gutter to **relative** line numbers (temporarily) and read the number as an offset from the current line: `+5` is five lines down, `-3` three lines up. The target is highlighted and your cursor stays put until you accept |
| <kbd>Backspace</kbd> | same | Delete a digit. When the number is empty you're back where you started (in relative mode, one more press drops back to absolute numbers) |
| <kbd>↑</kbd> / <kbd>↓</kbd> | same | Previous / next line number |
| <kbd>←</kbd> / <kbd>→</kbd> | same | Start / end of the line, then leave the mode |
| <kbd>Enter</kbd> | same | Leave the mode and stay on the line |
| <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | <kbd>⌘</kbd><kbd>Enter</kbd> | Insert a line **below** and start typing there |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> | <kbd>⌘</kbd><kbd>⇧</kbd><kbd>Enter</kbd> | Insert a line **above** and start typing there |
| <kbd>Esc</kbd> | same | Cancel and return to the original position |
| any other key | same | Leave the mode and type that character right there |

The line you are heading for carries a **landing marker** in the gutter (an ellipse with a down arrow landing on it), in peek mode too, so you can always see where you will end up. Moving the cursor with the mouse or switching editors also leaves the mode. Your `editor.lineNumbers` setting is never touched: relative numbers are applied to the editor only for as long as the mode lasts.

## Peek mode

Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> (macOS: <kbd>⌘</kbd><kbd>⇧</kbd><kbd>L</kbd>) and type a line number. The line opens in a VS Code peek box **while your cursor stays put**. All the keys above work here too, with a twist: *accepting* moves the caret **into the peek box**, so you can edit the peeked line in place.

- <kbd>Enter</kbd>, <kbd>Ctrl</kbd>+<kbd>Enter</kbd>, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd>, <kbd>←</kbd>/<kbd>→</kbd> or any character focus the editor inside the box
- <kbd>Esc</kbd> closes the box
- <kbd>Backspace</kbd> deletes a digit; with the number empty the box closes
- <kbd>↑</kbd> / <kbd>↓</kbd> flip through neighbouring lines
- `+` / `-` work here too: the main editor switches to relative numbers (counted from your cursor, which stays put) and the peek box shows the line you point at

## Search lines

Press <kbd>Ctrl</kbd>+<kbd>K</kbd> then <kbd>Ctrl</kbd>+<kbd>G</kbd> (macOS: <kbd>⌘</kbd><kbd>K</kbd> then <kbd>⌘</kbd><kbd>G</kbd>) and type: every line of the file that contains your text is listed under the input box.

- Several words match lines containing **all** of them, in any order.
- Matching is case-insensitive until you type an uppercase letter.
- Moving through the results with <kbd>↑</kbd> / <kbd>↓</kbd> **previews** each one: the editor scrolls to it and marks the line, without moving your cursor.
- <kbd>Enter</kbd> jumps to the match (the cursor lands on the matched text); <kbd>Esc</kbd> cancels and puts the view back exactly where it was.
- If text is selected on a single line, it is used as the starting query.
- The jump is recorded, so <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>L</kbd> takes you back.

## Jump back

<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>L</kbd> (macOS: <kbd>⌘</kbd><kbd>⌥</kbd><kbd>L</kbd>) returns to where you were before your last jump (go-to-line or bookmark). Press it again to keep walking back.

VS Code's own "go back" can lose its place when the file is edited. Kangaroo keeps its own history and **moves every saved position with your edits**: insert lines above, delete a block, split a line, and the entry still points at the same code.

## Bookmarks

| Key | macOS | What it does |
| --- | --- | --- |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>K</kbd> | <kbd>⌘</kbd><kbd>⌥</kbd><kbd>K</kbd> | Add a bookmark on the current line (you pick the title), or remove it if one exists |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>J</kbd> | <kbd>⌘</kbd><kbd>⌥</kbd><kbd>J</kbd> | Search all bookmarks |

In the search list:

| Key | macOS | What it does |
| --- | --- | --- |
| <kbd>Enter</kbd> | same | Go to the bookmark |
| <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | <kbd>⌘</kbd><kbd>Enter</kbd> | Open it in a side editor group |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> | <kbd>⌘</kbd><kbd>⇧</kbd><kbd>Enter</kbd> | Peek it (and edit it in place) |

You can also add or remove a bookmark from the editor's right-click menu (**Kangaroo: Toggle Bookmark**).

Bookmarked lines get a gutter icon and an overview-ruler mark; hover to see the title. The **Kangaroo** view in the Activity Bar lists everything grouped by file, with inline rename and delete buttons, a search button and a **Delete All** button in the view's title bar.

### Bookmarks follow the code

A bookmark is tied to its line's *content*, not its number. Add lines above, press <kbd>Enter</kbd> at the start of the line, delete a block elsewhere, and the bookmark moves along. If a file changes outside VS Code (a `git pull`, another tool), Kangaroo re-finds each bookmark by its text the next time the file opens.

### Stored in your workspace

Bookmarks are saved to **`.vscode/kangaroo-bookmarks.json`**, with paths relative to the workspace, so you can commit the file and share it with your team:

```json
{
  "version": 1,
  "bookmarks": [
    { "file": "src/server.js", "line": 42, "title": "Auth entry point", "text": "app.use(authMiddleware);" }
  ]
}
```

The file is re-read when it changes on disk, and only written when there is something to save. Without an open folder, bookmarks are kept in VS Code's workspace storage instead.

## Installing

Not on the Marketplace, so install it locally.

**Build a `.vsix`** (needs [Node.js](https://nodejs.org)):

```bash
npx @vscode/vsce package
code --install-extension kangaroo-1.2.0.vsix
```

**Or copy the folder** into your extensions directory and run **Developer: Reload Window**:

| OS | Extensions directory |
| --- | --- |
| Windows | `%USERPROFILE%\.vscode\extensions\bsimjoo.kangaroo-1.2.0` |
| Linux | `~/.vscode/extensions/bsimjoo.kangaroo-1.2.0` |
| macOS | `~/.vscode/extensions/bsimjoo.kangaroo-1.2.0` |

To hack on it, open the folder in VS Code and press <kbd>F5</kbd>.

## Customising keys

Every shortcut is a normal VS Code keybinding; remap them in **Keyboard Shortcuts** (search for `kangaroo`).

Kangaroo's "insert line" keys call VS Code's `editor.action.insertLineAfter` / `insertLineBefore`. If you rebind those, rebind `kangaroo.acceptInsertAfter` / `kangaroo.acceptInsertBefore` to match.

> Kangaroo overrides <kbd>Ctrl</kbd>+<kbd>L</kbd> (expand line selection) and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> (select all occurrences) inside the editor. Rebind `kangaroo.start` / `kangaroo.peek` if you'd rather keep them.

## Good to know

- While the go-to-line mode is on, Kangaroo takes over the `type` command; it lets go the moment you leave the mode, so it won't fight extensions like Vim.
- Peek focus is handled for you whatever `editor.peekWidgetDefaultFocus` is set to.

## Development

```bash
node test-positions.js   # unit tests for the edit-tracking logic
```

Pushing a tag is not enough to publish: create a GitHub **release** whose tag matches the `version` in `package.json` (for `1.2.0`, tag `v1.2.0`). A workflow then runs the tests, builds the `.vsix` and attaches it to the release.

The position tracker lives in [`positions.js`](positions.js) and has no VS Code dependency.

## License

Copyright © 2026 BSimjoo <bsimjoo@gmail.com>

Kangaroo is free software: you can redistribute it and/or modify it under the terms of the **GNU General Public License v3.0** as published by the Free Software Foundation. It is distributed in the hope that it will be useful, but **without any warranty**. See [LICENSE](LICENSE) for the full text.
