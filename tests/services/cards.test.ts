/**
 * @jest-environment jsdom
 *
 * obsidian-test-mocks needs a DOM (document) for UI classes like Notice,
 * so this suite runs in jsdom while the rest stays in node.
 */
import "obsidian-test-mocks/jest-setup";
import { App, Notice, TFile } from "obsidian-test-mocks/obsidian";
import type { App as ObsidianApp, TFile as ObsidianTFile } from "obsidian";
import { CardsService } from "src/services/cards";
import { Parser } from "src/services/parser";
import { Regex } from "src/conf/regex";
import type { Card } from "src/entities/card";
import type { ISettings } from "src/conf/settings";
import { createSettings } from "../helpers/settings";
import { setActiveDocument } from "../mocks/obsidian";
import { AnkiConnectMock } from "../mocks/anki-connect";

AnkiConnectMock.install();

beforeEach(() => {
  AnkiConnectMock.reset();
  setActiveDocument();
});

const noteIdInAnki = 1111111111111;
const notePath = "Note.md";

function setupService(
  files: Record<string, string> = {},
  settingOverrides: Partial<ISettings> = {}
): { cardsService: CardsService; app: App } {
  const app = App.createConfigured__({ files });
  const cardsService = new CardsService(
    app as unknown as ObsidianApp,
    createSettings(settingOverrides)
  );
  return { cardsService, app };
}

function noteFile(app: App): TFile {
  const file = app.vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) {
    throw new Error(`${notePath} not found in mock vault`);
  }
  return file;
}

function noteFileForService(app: App): ObsidianTFile {
  return noteFile(app) as unknown as ObsidianTFile;
}

function generateInlineCard(content: string): Card {
  const settings = createSettings();
  const parser = new Parser(new Regex(settings), settings);
  const cards = parser.generateFlashcards(
    content,
    "Default",
    "Vault",
    "Note",
    []
  );
  return cards[0];
}

function mirrorCardAsAnkiNote(noteId: number, card: Card) {
  return {
    noteId,
    tags: [...card.tags],
    fields: {
      Front: { value: card.fields["Front"] },
      Back: { value: card.fields["Back"] },
    },
    cards: [7],
  };
}

describe("CardsService - parseGlobalTags", () => {
  const tagsFileContent = "tags: #alpha #beta\nQ :: A\n";
  const expectedSimpleTags = ["alpha", "beta"];
  const mixedTagsFileContent =
    "tags: #parent/child #[[My Note]] #two words\n";
  const expectedMixedTags = ["parent::child", "My-Note", "two", "words"];

  test("parses a tags line", async () => {
    const { cardsService } = setupService();
    expect(cardsService.parseGlobalTags(tagsFileContent)).toEqual(
      expectedSimpleTags
    );
  });

  test("converts hierarchy, links and spaces", async () => {
    const { cardsService } = setupService();
    expect(cardsService.parseGlobalTags(mixedTagsFileContent)).toEqual(
      expectedMixedTags
    );
  });

  test("returns empty tags without a tags line", async () => {
    const { cardsService } = setupService();
    const cardOnlyContent = "Q :: A\n";
    expect(cardsService.parseGlobalTags(cardOnlyContent)).toEqual([]);
  });
});

describe("CardsService - filterByUpdate", () => {
  const inlineCardContent = "Q :: A\n";
  const unknownNoteId = 9999999999999;
  const outdatedAnswer = "Outdated answer";
  const previousAnkiTags = ["old-tag"];

  test("creates everything when Anki has no cards", async () => {
    const { cardsService } = setupService();
    const card = generateInlineCard(inlineCardContent);
    const [toCreate, toUpdate] = cardsService.filterByUpdate(undefined, [card]);
    expect(toCreate).toEqual([card]);
    expect(toUpdate).toEqual([]);
  });

  test("matching card needs no work", async () => {
    const { cardsService } = setupService();
    const card = generateInlineCard(inlineCardContent);
    card.inserted = true;
    card.id = noteIdInAnki;
    const [toCreate, toUpdate] = cardsService.filterByUpdate(
      [mirrorCardAsAnkiNote(noteIdInAnki, card)],
      [card]
    );
    expect(toCreate).toEqual([]);
    expect(toUpdate).toEqual([]);
  });

  test("changed card is scheduled for update with old tags", async () => {
    const { cardsService } = setupService();
    const card = generateInlineCard(inlineCardContent);
    card.inserted = true;
    card.id = noteIdInAnki;
    const changed = mirrorCardAsAnkiNote(noteIdInAnki, card);
    changed.fields.Back.value = outdatedAnswer;
    changed.tags = previousAnkiTags;
    const [toCreate, toUpdate] = cardsService.filterByUpdate([changed], [card]);
    expect(toCreate).toEqual([]);
    expect(toUpdate).toEqual([card]);
    expect(card.oldTags).toEqual(previousAnkiTags);
  });

  test("card missing in Anki goes back to create", async () => {
    const { cardsService } = setupService();
    const card = generateInlineCard(inlineCardContent);
    card.inserted = true;
    card.id = noteIdInAnki;
    const [toCreate] = cardsService.filterByUpdate(
      [mirrorCardAsAnkiNote(unknownNoteId, card)],
      [card]
    );
    expect(toCreate).toEqual([card]);
    expect(card.oldId).toBe(noteIdInAnki);
    expect(card.inserted).toBe(false);
  });
});

describe("CardsService - getCardsIds", () => {
  const inlineCardContent = "Q :: A\n";
  const ankiCardIds = [7, 8];

  test("collects anki card ids for inserted cards", async () => {
    const { cardsService } = setupService();
    const card = generateInlineCard(inlineCardContent);
    card.inserted = true;
    card.id = noteIdInAnki;
    const note = mirrorCardAsAnkiNote(noteIdInAnki, card);
    note.cards = ankiCardIds;
    expect(cardsService.getCardsIds([note], [card])).toEqual(ankiCardIds);
  });

  test("ignores cards not yet inserted", async () => {
    const { cardsService } = setupService();
    const card = generateInlineCard(inlineCardContent);
    expect(cardsService.getCardsIds([], [card])).toEqual([]);
  });
});

describe("CardsService - deckNeedToBeChanged", () => {
  const checkedCardIds = [7];
  const currentDeckName = "Default";
  const otherDeckName = "Other";

  test("returns false when the deck matches", async () => {
    const { cardsService } = setupService();
    AnkiConnectMock.setResponder(() => ({
      result: [{ deckName: currentDeckName }],
      error: null,
    }));
    await expect(
      cardsService.deckNeedToBeChanged(checkedCardIds, currentDeckName)
    ).resolves.toBe(false);
  });

  test("returns true when the deck differs", async () => {
    const { cardsService } = setupService();
    AnkiConnectMock.setResponder(() => ({
      result: [{ deckName: otherDeckName }],
      error: null,
    }));
    await expect(
      cardsService.deckNeedToBeChanged(checkedCardIds, currentDeckName)
    ).resolves.toBe(true);
  });

  test("returns false without cardsInfo", async () => {
    const { cardsService } = setupService();
    AnkiConnectMock.setResponder(() => ({ result: [], error: null }));
    await expect(
      cardsService.deckNeedToBeChanged(checkedCardIds, currentDeckName)
    ).resolves.toBe(false);
  });
});

describe("CardsService - setup", () => {
  test("pings Anki and creates models", async () => {
    const { cardsService } = setupService();
    AnkiConnectMock.respondWith(null);
    await expect(cardsService.setup()).resolves.toBeUndefined();
    const actions = AnkiConnectMock.requests.map((r) => r.action);
    expect(actions).toEqual([
      "version",
      "retrieveMediaFile",
      "multi",
      "multi",
    ]);
  });
});

describe("CardsService - execute", () => {
  const cardContent = "What is 2+2? :: 4\n";
  const createdNoteId = 111;
  const expectedBlockId = `^${createdNoteId}`;
  const insertSuccessMessage = "Inserted successfully 1/1 cards.";
  const deleteSuccessMessage = "Deleted successfully 1/1 cards.";
  const frontmatterDeckName = "Custom";
  const ankiDownMessage = "Error: Anki must be open with AnkiConnect installed.";
  const nothingToDoMessage = "Nothing to do. Everything is up to date";

  function mockAnkiFlowResponses(overrides: {
    addNotes?: unknown;
    notesInfo?: unknown;
    cardsInfo?: unknown;
  } = {}) {
    AnkiConnectMock.setResponder((request) => {
      switch (request.action) {
        case "addNotes":
          return { result: overrides.addNotes ?? [createdNoteId], error: null };
        case "notesInfo":
          return { result: overrides.notesInfo ?? null, error: null };
        case "cardsInfo":
          return { result: overrides.cardsInfo ?? [], error: null };
        default:
          return { result: null, error: null };
      }
    });
  }

  test("creates a new inline card and writes its id back", async () => {
    const { cardsService, app } = setupService({ [notePath]: cardContent });
    mockAnkiFlowResponses();

    const result = await cardsService.execute(noteFileForService(app), true);

    expect(result).toContain(insertSuccessMessage);
    const createDeck = AnkiConnectMock.requests.find(
      (r) => r.action === "createDeck"
    );
    expect(createDeck?.params).toMatchObject({ deck: "Default" });
    const written = await app.vault.read(noteFile(app));
    expect(written).toContain(expectedBlockId);
    expect(written).toContain("cards-deck: Default");
  });

  test("returns an error when Anki is unreachable", async () => {
    const { cardsService, app } = setupService({ [notePath]: cardContent });
    AnkiConnectMock.setConnectionDown(true);

    const result = await cardsService.execute(noteFileForService(app), false);

    expect(result).toEqual([ankiDownMessage]);
  });

  test("uses the deck from frontmatter", async () => {
    const frontmatterContent =
      `---\ncards-deck: ${frontmatterDeckName}\n---\n${cardContent}`;
    const { cardsService, app } = setupService({
      [notePath]: frontmatterContent,
    });
    mockAnkiFlowResponses();

    await cardsService.execute(noteFileForService(app), true);

    const createDeck = AnkiConnectMock.requests.find(
      (r) => r.action === "createDeck"
    );
    expect(createDeck?.params).toMatchObject({ deck: frontmatterDeckName });
  });

  test("reports nothing to do when everything matches", async () => {
    const existingCardContent = `What is 2+2? :: 4\n^${noteIdInAnki}\n`;
    const generated = generateInlineCard(existingCardContent);
    const { cardsService, app } = setupService({ [notePath]: existingCardContent });
    mockAnkiFlowResponses({
      notesInfo: [mirrorCardAsAnkiNote(noteIdInAnki, generated)],
      cardsInfo: [{ deckName: "Default" }],
    });

    const result = await cardsService.execute(noteFileForService(app), true);

    expect(result).toEqual([nothingToDoMessage]);
  });

  test("deletes orphan block ids from Anki and the file", async () => {
    const orphanId = 1234567890123;
    const orphanContent = `Some text\n\n^${orphanId}\n`;
    const { cardsService, app } = setupService({
      [notePath]: orphanContent,
    });
    mockAnkiFlowResponses({
      notesInfo: [{ noteId: orphanId }],
    });

    const result = await cardsService.execute(noteFileForService(app), true);

    const deleted = AnkiConnectMock.requests.find(
      (r) => r.action === "deleteNotes"
    );
    expect(deleted?.params).toMatchObject({ notes: [orphanId] });
    expect(result).toContain(deleteSuccessMessage);
    const written = await app.vault.read(noteFile(app));
    expect(written).not.toContain(`^${orphanId}`);
  });

  test("shows a notice when a card cannot be added", async () => {
    const { cardsService, app } = setupService({ [notePath]: cardContent });
    mockAnkiFlowResponses({ addNotes: [null] });
    const noticeSpy = jest.spyOn(Notice.prototype, "constructor__");

    const result = await cardsService.execute(noteFileForService(app), true);

    expect(noticeSpy).toHaveBeenCalledWith(
      expect.stringContaining("could not add"),
      expect.anything()
    );
    expect(result).toContain("Inserted successfully 0/1 cards.");
  });
});
