# Better Flashcards

![logo](logo.png)
Anki integration for [Obsidian](https://obsidian.md/).

## Attribution

This plugin is a fork of [reuseman/flashcards-obsidian](https://github.com/reuseman/flashcards-obsidian), originally by Alex Colucci and Noah Rousell, with bug fixes and small tweaks maintained by [Mihir Patel](https://github.com/mihirpatel1112).

## Features

🗃️ Simple flashcards with **#card**  
🎴 Reversed flashcards with **#card-reverse** or **#card/reverse**  
📅 Spaced-only cards with **#card-spaced** or **#card/spaced**  
✍️ Inline style with **Question::Answer**  
✍️ Inline style reversed with **Question:::Answer**  
📃 Cloze with **==Highlight==** or **{Curly brackets}** or  **{2:Cloze}**   
🧠 **Context-aware** mode  
🏷️ Global and local **tags**  

🔢 Support for **LaTeX**  
🖼️ Support for **images**  
🎤 Support for **audios**   
🔗 Support for **Obsidian URI**  
⚓ Support for **reference to note**  
📟 Support for **code syntax highlight**

For other features check the [wiki](https://github.com/reuseman/flashcards-obsidian/wiki).

## How it works?

The following is a demo where the three main operations are shown:

1. **Insertion** of cards;
2. **Update** of cards;
3. **Deletion** of cards.

![Demo image](docs/demo.gif)

## How to use it?

The wiki explains in detail [how to use it](https://github.com/reuseman/flashcards-obsidian/wiki).

## How to install

### From the community plugin store

1. [Install](obsidian://show-plugin?id=better-flashcards) this plugin on Obsidian:

   - Open Settings > Community plugins
   - Make sure Safe mode is off
   - Click Browse community plugins
   - Search for "**Better Flashcards**"
   - Click Install
   - Once installed, close the community plugins window and activate the newly installed plugin

2. Install [AnkiConnect](https://ankiweb.net/shared/info/2055492159) on Anki
   - Tools > Add-ons -> Get Add-ons...
   - Paste the code **2055492159** > Ok

3. Open the settings of the plugin, and while Anki is opened press "**Grant Permission**"

### Manual install from source

To build and install from this repository, see the [Build and release guide](docs/BUILD_AND_RELEASE.md).

## Migrate from Flashcards

Notes you already wrote stay in the vault. Anki keeps the same card and its review history. The old plugin stores that Anki note number in the note header, under a label such as `q-v4p9`:

```markdown
---
cards-deck: Old plugin cards
flashcards:
  q-v4p9: { nid: 1792015386098, hash: 97ajaefb, sync: nkztwkvd }
---
front :: back
^q-v4p9
```

`1792015386098` is the Anki note. `^q-v4p9` is only the label.

1. Disable the old **Flashcards** plugin. If both plugins stay on, both write cards.
2. Install and enable **Better Flashcards**. Open Anki with AnkiConnect.
3. Before the first generate, set the deck, card tag, `::` separators, source support, and code highlight to the same values as the old plugin. Settings are not copied. A mismatch can create a second Anki card.
4. Generate one note that already has a `^q-` label.

A correct generate says the card was updated, or that there is nothing to do. It does not say a card was inserted. The `^q-` label and the `flashcards:` list stay in the note.

In Live Preview, Obsidian shows `^q-v4p9` as a dot. Source mode shows the text. The id is still in the file.

Cards that Better Flashcards creates use a 13-digit id. That id is separate from the old `^q-` label.

## Privacy

This plugin only reads vault files when you explicitly run a generate command (current file or all files in vault). It uses file paths locally to find flashcard syntax and sends card content to Anki on your machine via AnkiConnect. No data is sent to external servers. Use the **Ignored directories** setting to exclude folders from vault-wide generation.

## Contributing
Contributions via bug reports, bug fixes, are welcome. If you have ideas about features to be implemented, please open an issue so we can discuss the best way to implement it. For more details check [Contributing.md](docs/CONTRIBUTING.md)

## Support
If this plugin is useful to you, consider starring the [repository](https://github.com/mihirpatel1112/better-flashcards) or [sponsoring on GitHub](https://github.com/sponsors/mihirpatel1112).
