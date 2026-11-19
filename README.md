<p align="center"><img src="media/icon.png" width="128" alt="Jumper icon"></p>

# Jumper

**Move around your code at the speed of thought.**
Jumper turns "go to line" into a dialog-free, keyboard-only flow, adds a jump-back history that survives edits, and ships workspace-wide bookmarks that stick to the *code*, not to a line number.

- ⌨️ **Inline go-to-line** — no dialog, just type the number
- 👀 **Peek a line** — see (and edit) any line in a floating box without leaving your spot
- ↩️ **Jump back** — return to where you were, even after the file changed
- 🔖 **Bookmarks** — titled, tracked through edits, saved in `.vscode/`, searchable

---

## Inline go-to-line

Press <kbd>⌘</kbd><kbd>L</kbd> (<kbd>Ctrl</kbd><kbd>L</kbd> on Windows/Linux) and just start typing digits. The cursor follows you live.

| Key | What it does |
| --- | --- |
| `0`–`9` (also `۰`–`۹`, `٠`–`٩`) | Jump to that line as you type |
| <kbd>Backspace</kbd> | Delete a digit. When the number is empty you're back where you started |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Previous / next line number |
| <kbd>←</kbd> / <kbd>→</kbd> | Start / end of the line, then leave the mode |
| <kbd>Enter</kbd> | Leave the mode and stay on the line |
| <kbd>⌘</kbd><kbd>Enter</kbd> | Insert a line **below** and start typing there |
| <kbd>⌘</kbd><kbd>⇧</kbd><kbd>Enter</kbd> | Insert a line **above** and start typing there |
| <kbd>Esc</kbd> | Cancel and return to the original position |
| any other key | Leave the mode and type that character right there |

Moving the cursor with the mouse or switching editors also leaves the mode.

## Peek mode

Press <kbd>⌘</kbd><kbd>⇧</kbd><kbd>L</kbd> and type a line number. The line opens in a VS Code peek box **while your cursor stays put**. Everything above works here too, with a twist: *accepting* moves the caret **into the peek box**, so you can edit the peeked line in place.

- <kbd>Enter</kbd>, <kbd>⌘</kbd><kbd>Enter</kbd>, <kbd>⌘</kbd><kbd>⇧</kbd><kbd>Enter</kbd>, <kbd>←</kbd>/<kbd>→</kbd> or any character focus the editor inside the box
- <kbd>Esc</kbd> closes the box
- <kbd>↑</kbd> / <kbd>↓</kbd> flip through neighbouring lines

## Jump back

<kbd>⌘</kbd><kbd>⌥</kbd><kbd>L</kbd> returns to where you were before your last jump (go-to-line or bookmark). Press it again to keep walking back.

VS Code's own "go back" can lose its place when the file is edited. Jumper keeps its own history and **moves every saved position with your edits** — insert lines above, delete a block, split a line — and the entry still points at the same code.

## Bookmarks

| Key | What it does |
| --- | --- |
| <kbd>⌘</kbd><kbd>⌥</kbd><kbd>K</kbd> | Add a bookmark on the current line (you pick the title), or remove it if one exists |
| <kbd>⌘</kbd><kbd>⌥</kbd><kbd>J</kbd> | Search all bookmarks |

In the search list:

| Key | What it does |
| --- | --- |
| <kbd>Enter</kbd> | Go to the bookmark |
| <kbd>⌘</kbd><kbd>Enter</kbd> | Open it in a side editor group |
| <kbd>⌘</kbd><kbd>⇧</kbd><kbd>Enter</kbd> | Peek it (and edit it in place) |

Bookmarked lines get a gutter icon and an overview-ruler mark; hover to see the title. The **Jumper** view in the Activity Bar lists everything grouped by file, with inline rename and delete.

### Bookmarks follow the code

A bookmark is tied to its line's *content*, not its number. Add lines above, press <kbd>Enter</kbd> at the start of the line, delete a block elsewhere — the bookmark moves along. If a file changes outside VS Code (a `git pull`, another tool), Jumper re-finds each bookmark by its text the next time the file opens.

### Stored in your workspace

Bookmarks are saved to **`.vscode/jumper-bookmarks.json`**, with paths relative to the workspace, so you can commit the file and share it with your team:

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

Not on the Marketplace — install it locally:

```bash
# build a .vsix (needs Node.js)
npx @vscode/vsce package --allow-missing-repository
code --install-extension jumper-0.1.0.vsix
```

or copy/symlink the folder into `~/.vscode/extensions/bsimjoo.jumper-0.1.0` and run **Developer: Reload Window**. To hack on it, open the folder and press <kbd>F5</kbd>.

## Customising keys

Every shortcut is a normal VS Code keybinding; remap them in **Keyboard Shortcuts** (search for `jumper`). Defaults are shown for macOS; on Windows/Linux <kbd>⌘</kbd> becomes <kbd>Ctrl</kbd> and <kbd>⌥</kbd> becomes <kbd>Alt</kbd>.

Jumper's "insert line" keys call VS Code's `editor.action.insertLineAfter` / `insertLineBefore`. If you rebind those, rebind `jumper.acceptInsertAfter` / `jumper.acceptInsertBefore` to match.

> Jumper overrides `⌘L` (expand line selection) and `⌘⇧L` (select all occurrences) inside the editor. Rebind `jumper.start` / `jumper.peek` if you'd rather keep them.

## Good to know

- While the go-to-line mode is on, Jumper takes over the `type` command; it lets go the moment you leave the mode, so it won't fight extensions like Vim.
- Peek focus is handled for you whatever `editor.peekWidgetDefaultFocus` is set to.

## Development

```bash
node test-positions.js   # unit tests for the edit-tracking logic
```

The position tracker lives in [`positions.js`](positions.js) and has no VS Code dependency.

## License

Copyright © 2026 BSimjoo <bsimjoo@gmail.com>

Jumper is free software: you can redistribute it and/or modify it under the terms of the **GNU General Public License v3.0** as published by the Free Software Foundation. It is distributed in the hope that it will be useful, but **without any warranty**. See [LICENSE](LICENSE) for the full text.
