# Build and release guide

This plugin can be installed manually in Obsidian by building the plugin bundle and copying the release files into a vault plugin folder.

## Requirements

- Node.js
- npm
- Anki with AnkiConnect installed if you want to sync cards

## Build from source

Install dependencies, including development dependencies:

```bash
npm install --include=dev
```

Build the Obsidian plugin bundle:

```bash
npm run build
```

This creates `main.js` in the repository root. The plugin manifest is `manifest.json`.

## Prepare release files

Run:

```bash
npm run release
```

The release folder will be created at:

```text
dist/better-flashcards/
```

It contains the files Obsidian needs:

```text
main.js
manifest.json
```

If a future version adds `styles.css`, include that file in the release folder too.

For a GitHub release, upload `main.js` and `manifest.json` as release assets. You can also zip the contents of `dist/better-flashcards/`, but the files should be at the top level of the zip.

## Manual install in Obsidian

Create this folder inside your vault:

```text
<your-vault>/.obsidian/plugins/better-flashcards/
```

Copy the release files into it:

```text
<your-vault>/.obsidian/plugins/better-flashcards/main.js
<your-vault>/.obsidian/plugins/better-flashcards/manifest.json
```

Then restart Obsidian and enable **Better Flashcards** under:

```text
Settings -> Community plugins
```

Use placeholder paths like `<your-vault>` in documentation and release notes. Do not publish local absolute paths from your machine.
