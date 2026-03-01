import { Anki } from "src/services/anki";
import {
  App,
  FileSystemAdapter,
  FrontMatterCache,
  Notice,
  parseFrontMatterEntry,
  TFile,
} from "obsidian";
import { Parser } from "src/services/parser";
import { ISettings } from "src/conf/settings";
import { Card } from "src/entities/card";
import { arrayBufferToBase64 } from "src/utils";
import { Regex } from "src/conf/regex";
import { noticeTimeout } from "src/conf/constants";
import { Inlinecard } from "src/entities/inlinecard";

export class CardsService {
  private app: App;
  private settings: ISettings;
  private regex: Regex;
  private parser: Parser;
  private anki: Anki;

  private updateFile: boolean;
  private totalOffset: number;
  private file: string;
  private notifications: string[];

  constructor(app: App, settings: ISettings) {
    this.app = app;
    this.settings = settings;
    this.regex = new Regex(this.settings);
    this.parser = new Parser(this.regex, this.settings);
    this.anki = new Anki();
  }

  public async setup(): Promise<void> {
    this.regex.update(this.settings);
    await this.anki.ping();
    await this.anki.storeCodeHighlightMedias();
    await this.anki.createModels(
      this.settings.sourceSupport,
      this.settings.codeHighlightSupport
    );
  }

  public async execute(activeFile: TFile, skipSetup = false): Promise<string[]> {
    this.regex.update(this.settings);

    if (!skipSetup) {
      try {
        await this.anki.ping();
      } catch (err) {
        console.error(err);
        return ["Error: Anki must be open with AnkiConnect installed."];
      }
    }

    // Init for the execute phase
    this.updateFile = false;
    this.totalOffset = 0;
    this.notifications = [];
    const filePath = activeFile.basename;
    const sourcePath = activeFile.path;
    const fileCachedMetadata = this.app.metadataCache.getFileCache(activeFile);
    const vaultName = this.app.vault.getName();
    let globalTags: string[] = undefined;

    // Parse frontmatter
    const frontmatter = fileCachedMetadata.frontmatter;
    let deckName = "";
    if (parseFrontMatterEntry(frontmatter, "cards-deck")) {
      deckName = parseFrontMatterEntry(frontmatter, "cards-deck");
    } else if (this.settings.folderBasedDeck && activeFile.parent.path !== "/") {
      const folderDeck = activeFile.parent.path.split("/").join("::");
      deckName = this.settings.deck + "::" + folderDeck;
    } else {
      deckName = this.settings.deck;
    }

    try {
      if (!skipSetup) {
        await this.anki.storeCodeHighlightMedias();
        await this.anki.createModels(
          this.settings.sourceSupport,
          this.settings.codeHighlightSupport
        );
      }
      this.file = await this.app.vault.read(activeFile);
      if (!this.file.endsWith("\n")) {
        this.file += "\n";
      }
      globalTags = this.parseGlobalTags(this.file);
      const ankiBlocks = this.parser.getAnkiIDsBlocks(this.file);
      const ankiCards = ankiBlocks?.length
        ? await this.anki.getCards(this.getAnkiIDs(ankiBlocks))
        : undefined;

      const cards: Card[] = this.parser.generateFlashcards(
        this.file,
        deckName,
        vaultName,
        filePath,
        globalTags
      );
      const [cardsToCreate, cardsToUpdate, cardsNotInAnki] =
        this.filterByUpdate(ankiCards, cards);
      const cardIds: number[] = this.getCardsIds(ankiCards, cards);
      const cardsToDelete: number[] = this.parser.getCardsToDelete(this.file);

      const hasWork = cardsToCreate.length || cardsToUpdate.length || cardsToDelete.length;
      if (!hasWork) {
        return ["Nothing to do. Everything is up to date"];
      }

      await this.anki.createDeck(deckName);

      await this.insertMedias(cards, sourcePath);
      await this.deleteCardsOnAnki(cardsToDelete, ankiBlocks);
      await this.updateCardsOnAnki(cardsToUpdate);
      await this.insertCardsOnAnki(cardsToCreate, frontmatter, deckName);

      // Update decks if needed
      const deckNeedToBeChanged = await this.deckNeedToBeChanged(
        cardIds,
        deckName
      );
      if (deckNeedToBeChanged) {
        try {
          await this.anki.changeDeck(cardIds, deckName);
          this.notifications.push("Cards moved in new deck");
        } catch (err) {
          console.error(err);
          return ["Error: Could not update deck the file."];
        }
      }

      // Update file
      if (this.updateFile) {
        try {
          await this.app.vault.modify(activeFile, this.file);
        } catch (err) {
          console.error(err);
          return ["Error: Could not update the file."];
        }
      }

      if (!this.notifications.length) {
        this.notifications.push("Nothing to do. Everything is up to date");
      }
      return this.notifications;
    } catch (err) {
      console.error(err);
      return [`Error: ${err}`];
    }
  }

  private async insertMedias(cards: Card[], sourcePath: string) {
    try {
      await this.generateMediaLinks(cards, sourcePath);
      await this.anki.storeMediaFiles(cards);
    } catch (err) {
      console.error(err);
    }
  }

  private async generateMediaLinks(cards: Card[], sourcePath: string) {
    if (this.app.vault.adapter instanceof FileSystemAdapter) {
      // @ts-ignore: Unreachable code error

      for (const card of cards) {
        for (const media of card.mediaNames) {
          const image = this.app.metadataCache.getFirstLinkpathDest(
            decodeURIComponent(media),
            sourcePath
          );
          try {
            const binaryMedia = await this.app.vault.readBinary(image);
            card.mediaBase64Encoded.push(arrayBufferToBase64(binaryMedia));
          } catch (err) {
            console.error(err);
          }
        }
      }
    }
  }

  private async insertCardsOnAnki(
    cardsToCreate: Card[],
    frontmatter: FrontMatterCache,
    deckName: string
  ): Promise<number> {
    if (cardsToCreate.length) {
      let insertedCards = 0;
      try {
        const ids = await this.anki.addCards(cardsToCreate);

        ids.map((id: number, index: number) => {
          cardsToCreate[index].id = id;
        });

        let total = 0;
        cardsToCreate.forEach((card) => {
          if (card.id === null) {
            new Notice(
              `Error, could not add: '${card.initialContent}'`,
              noticeTimeout
            );
          } else {
            card.reversed ? (insertedCards += 2) : insertedCards++;
          }
          card.reversed ? (total += 2) : total++;
        });

        this.updateFrontmatter(frontmatter, deckName);
        this.writeAnkiBlocks(cardsToCreate);

        this.notifications.push(
          `Inserted successfully ${insertedCards}/${total} cards.`
        );
        return insertedCards;
      } catch (err) {
        console.error(err);
        this.notifications.push(`Error: Could not write cards on Anki (${cardsToCreate.map(c => c.initialContent).join(", ")})`);
      }
    }
  }

  private updateFrontmatter(frontmatter: FrontMatterCache, deckName: string) {
    const cardsDeckLine = `cards-deck: ${deckName}\n`;
    const frontmatterMatch = this.file.match(/^---\n([\s\S]*?)\n---/);

    if (frontmatterMatch) {
      if (!frontmatterMatch[0].match(this.regex.cardsDeckLine)) {
        const oldBlock = frontmatterMatch[0];
        const newBlock = oldBlock.replace(/\n---$/, `\n${cardsDeckLine}---`);
        this.totalOffset += cardsDeckLine.length;
        this.file = newBlock + this.file.substring(oldBlock.length);
      }
    } else {
      const newFrontmatter = `---\n${cardsDeckLine}---\n\n`;
      this.totalOffset += newFrontmatter.length;
      this.file = newFrontmatter + this.file;
    }
  }

  private writeAnkiBlocks(cardsToCreate: Card[]) {
    // Strip stale block IDs for cards being re-created
    for (const card of cardsToCreate) {
      if (card.oldId) {
        const oldIdPattern = new RegExp(`\\n?\\^${card.oldId}\\s*`, "g");
        const before = this.file.length;
        this.file = this.file.replace(oldIdPattern, "");
        this.totalOffset -= (before - this.file.length);
        this.updateFile = true;
      }
    }

    for (const card of cardsToCreate) {
      if (card.id !== null && !card.inserted) {
        let id = card.getIdFormat();
        if (card instanceof Inlinecard) {
          if (this.settings.inlineID) {
            id = " " + id;
          } else {
            id = "\n" + id;
          }
        }
        card.endOffset += this.totalOffset;
        const offset = card.endOffset;

        this.updateFile = true;
        this.file =
          this.file.substring(0, offset) +
          id +
          this.file.substring(offset, this.file.length + 1);
        this.totalOffset += id.length;
      }
    }
  }

  private async updateCardsOnAnki(cards: Card[]): Promise<number> {
    if (cards.length) {
      try {
        await this.anki.updateCards(cards);
        this.notifications.push(
          `Updated successfully ${cards.length}/${cards.length} cards.`
        );
      } catch (err) {
        console.error(err);
        this.notifications.push("Error: Could not update cards on Anki");
      }

      return cards.length;
    }
  }

  public async deleteCardsOnAnki(
    cards: number[],
    ankiBlocks: RegExpMatchArray[]
  ): Promise<number> {
    if (cards.length) {
      let deletedCards = 0;
      for (const block of ankiBlocks) {
        const id = Number(block[1]);

        if (cards.includes(id)) {
          try {
            await this.anki.deleteCards([id]);
            deletedCards++;

            this.updateFile = true;
            this.file =
              this.file.substring(0, block["index"]) +
              this.file.substring(
                block["index"] + block[0].length,
                this.file.length
              );
            this.totalOffset -= block[0].length;
            this.notifications.push(
              `Deleted successfully ${deletedCards}/${cards.length} cards.`
            );
          } catch (err) {
            console.error(err);
          }
        }
      }

      return deletedCards;
    }
  }

  private getAnkiIDs(blocks: RegExpMatchArray[]): number[] {
    const IDs: number[] = [];
    for (const b of blocks) {
      IDs.push(Number(b[1]));
    }

    return IDs;
  }

  public filterByUpdate(ankiCards: any, generatedCards: Card[]) {
    let cardsToCreate: Card[] = [];
    const cardsToUpdate: Card[] = [];
    const cardsNotInAnki: Card[] = [];

    if (ankiCards) {
      for (const flashcard of generatedCards) {
        // Inserted means that anki blocks are available, that means that the card should
        // 	(the user can always delete it) be in Anki
        let ankiCard = undefined;
        if (flashcard.inserted) {
          ankiCard = ankiCards.filter(
            (card: any) => Number(card.noteId) === flashcard.id
          )[0];
          if (!ankiCard) {
            flashcard.oldId = flashcard.id;
            flashcard.inserted = false;
            cardsToCreate.push(flashcard);
          } else if (!flashcard.match(ankiCard)) {
            flashcard.oldTags = ankiCard.tags;
            cardsToUpdate.push(flashcard);
          }
        } else {
          cardsToCreate.push(flashcard);
        }
      }
    } else {
      cardsToCreate = [...generatedCards];
    }

    return [cardsToCreate, cardsToUpdate, cardsNotInAnki];
  }

  public async deckNeedToBeChanged(cardsIds: number[], deckName: string) {
    const cardsInfo = await this.anki.cardsInfo(cardsIds);
    if (cardsInfo.length !== 0) {
      return cardsInfo[0].deckName !== deckName;
    }

    return false;
  }

  public getCardsIds(ankiCards: any, generatedCards: Card[]): number[] {
    let ids: number[] = [];

    if (ankiCards) {
      for (const flashcard of generatedCards) {
        let ankiCard = undefined;
        if (flashcard.inserted) {
          ankiCard = ankiCards.filter(
            (card: any) => Number(card.noteId) === flashcard.id
          )[0];
          if (ankiCard) {
            ids = ids.concat(ankiCard.cards);
          }
        }
      }
    }

    return ids;
  }

  public parseGlobalTags(file: string): string[] {
    let globalTags: string[] = [];

    const tags = file.match(/(?:cards-)?tags: ?(.*)/im);
    globalTags = tags ? tags[1].match(this.regex.globalTagsSplitter) : [];

    if (globalTags) {
      for (let i = 0; i < globalTags.length; i++) {
        globalTags[i] = globalTags[i].replace("#", "");
        globalTags[i] = globalTags[i].replace(/\//g, "::");
        globalTags[i] = globalTags[i].replace(/\[\[(.*)\]\]/, "$1");
        globalTags[i] = globalTags[i].trim();
        globalTags[i] = globalTags[i].replace(/ /g, "-");
      }

      return globalTags;
    }

    return [];
  }
}
