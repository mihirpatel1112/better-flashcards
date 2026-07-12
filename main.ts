import { addIcon, Notice, Plugin, TFile } from "obsidian";
import { ISettings } from "src/conf/settings";
import { SettingsTab } from "src/gui/settings-tab";
import { CardsService } from "src/services/cards";
import { Anki } from "src/services/anki";
import { noticeTimeout, flashcardsIcon } from "src/conf/constants";

export default class ObsidianFlashcard extends Plugin {
  settings: ISettings;
  private cardsService: CardsService;

  async onload() {
    addIcon("flashcards", flashcardsIcon);

    // TODO test when file did not insert flashcards, but one of them is in Anki already
    const anki = new Anki();
    this.settings = (await this.loadData()) || this.getDefaultSettings();
    this.cardsService = new CardsService(this.app, this.settings);

    const statusBar = this.addStatusBarItem();

    this.addCommand({
      id: "generate-flashcard-current-file",
      name: "Generate for the current file",
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          if (!checking) {
            this.generateCards(activeFile);
          }
          return true;
        }
        return false;
      },
    });

    this.addCommand({
      id: "generate-flashcard-all-files",
      name: "Generate for all files in vault",
      callback: () => {
        this.generateCardsForVault();
      },
    });

    this.addRibbonIcon("flashcards", "Generate flashcards", () => {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        this.generateCards(activeFile);
      } else {
        new Notice("Open a file before");
      }
    });

    this.addSettingTab(new SettingsTab(this.app, this));

    this.registerInterval(
      window.setInterval(
        () =>
          anki
            .ping()
            .then(() => statusBar.setText("Anki"))
            .catch(() => statusBar.setText("")),
        15 * 1000,
      ),
    );
  }

  async onunload() {
    await this.saveData(this.settings);
  }

  private getDefaultSettings(): ISettings {
    return {
      contextAwareMode: true,
      sourceSupport: false,
      codeHighlightSupport: false,
      inlineID: false,
      contextSeparator: " > ",
      deck: "Default",
      folderBasedDeck: true,
      flashcardsTag: "card",
      inlineSeparator: "::",
      inlineSeparatorReverse: ":::",
      defaultAnkiTag: "obsidian",
      ankiConnectPermission: false,
      ignoredDirectories: "",
    };
  }

  private generateCards(activeFile: TFile) {
    this.cardsService
      .execute(activeFile)
      .then((res) => {
        if (!res) {
          new Notice("Error: Something went wrong", noticeTimeout);
          return;
        }
        for (const r of res) {
          new Notice(r, noticeTimeout);
        }
      })
      .catch((err) => {
        console.error(err);
        new Notice(`Error: ${err}`, noticeTimeout);
      });
  }

  private isIgnoredPath(filePath: string): boolean {
    const ignored = (this.settings.ignoredDirectories || "")
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d.length > 0);
    return ignored.some((dir) => filePath.startsWith(dir + "/") || filePath.startsWith(dir + "\\"));
  }

  private async generateCardsForVault() {
    const allFiles = this.app.vault.getMarkdownFiles();
    const files = allFiles.filter((f) => !this.isIgnoredPath(f.path));

    try {
      await this.cardsService.setup();
    } catch (err) {
      console.error(err);
      new Notice("Error: Anki must be open with AnkiConnect installed.", noticeTimeout);
      return;
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const tag = this.settings.flashcardsTag;
    const sep = this.settings.inlineSeparator;
    const sepRev = this.settings.inlineSeparatorReverse;

    new Notice(`Flashcards: scanning ${files.length} files...`, noticeTimeout);

    for (const file of files) {
      try {
        const content = await this.app.vault.cachedRead(file);
        const hasCardTag = content.includes(`#${tag}`);
        const hasInline = content.includes(sep);
        const hasCloze = content.includes("==") || content.includes("{");
        const hasExistingIds = /\^\d{13}/.test(content);
        if (!hasCardTag && !hasInline && !hasExistingIds && !hasCloze) {
          skipped++;
          continue;
        }
        // Only check cloze-heavy files if they also have a card tag or existing IDs
        if (!hasCardTag && !hasInline && !hasExistingIds && hasCloze) {
          skipped++;
          continue;
        }

        const res = await this.cardsService.execute(file, true);
        if (!res) continue;
        for (const r of res) {
          if (r.startsWith("Inserted")) created++;
          else if (r.startsWith("Updated")) updated++;
          else if (r.startsWith("Error")) {
            console.warn(`Flashcards: [${file.path}] ${r}`);
            failed++;
          }
        }
      } catch (err) {
        console.error(`Flashcards: [${file.path}] uncaught error`, err);
        failed++;
      }
    }

    new Notice(
      `Flashcards: done. ${files.length - skipped} files with cards, ${created} created, ${updated} updated, ${failed} errors.`,
      noticeTimeout
    );
  }
}
