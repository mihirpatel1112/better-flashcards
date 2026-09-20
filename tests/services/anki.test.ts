import { Anki } from "src/services/anki";
import { Flashcard } from "src/entities/flashcard";
import {
  basicModelName,
  basicReversedModelName,
  clozeModelName,
  codeDeckExtension,
  sourceDeckExtension,
  spacedModelName,
} from "src/conf/constants";
import { AnkiConnectMock } from "../mocks/anki-connect";
import type { AnkiConnectRequest } from "../mocks/anki-connect";

AnkiConnectMock.install();

beforeEach(() => {
  AnkiConnectMock.reset();
});

interface SubAction {
  action: string;
  params: Record<string, unknown>;
}

const ankiConnectVersion = 6;

function multiRequests(): AnkiConnectRequest[] {
  return AnkiConnectMock.requests.filter((r) => r.action === "multi");
}

function subActionsOf(request: AnkiConnectRequest): SubAction[] {
  expect(request.version).toBe(ankiConnectVersion);
  return request.params["actions"] as SubAction[];
}

/** Actions of the only multi request - fails when there isn't exactly one. */
function multiSubActions(): SubAction[] {
  const found = multiRequests();
  expect(found).toHaveLength(1);
  return subActionsOf(found[0]);
}

/** Actions of the last multi request - for flows with several requests. */
function lastMultiSubActions(): SubAction[] {
  const found = multiRequests();
  expect(found.length).toBeGreaterThan(0);
  return subActionsOf(found[found.length - 1]);
}

function createCard(): Flashcard {
  return new Flashcard(
    5,
    "Test deck",
    "original content",
    { Front: "Question", Back: "Answer" },
    false,
    0,
    10,
    ["b", "c"],
    false,
    [],
    false,
  );
}

describe("Anki - connection", () => {
  test("ping returns true when AnkiConnect reports version 6", async () => {
    const reportedVersion = ankiConnectVersion;
    AnkiConnectMock.respondWith(reportedVersion);
    await expect(new Anki().ping()).resolves.toBe(true);
    expect(AnkiConnectMock.requests).toHaveLength(1);
    expect(AnkiConnectMock.requests[0].action).toBe("version");
  });

  test("ping returns false when version differs", async () => {
    const unsupportedVersion = 5;
    AnkiConnectMock.respondWith(unsupportedVersion);
    await expect(new Anki().ping()).resolves.toBe(false);
  });

  test("ping rejects when Anki is unreachable", async () => {
    AnkiConnectMock.setConnectionDown(true);
    await expect(new Anki().ping()).rejects.toThrow();
  });

  test("invoke rejects a malformed response", async () => {
    const malformedResponse = { result: 6 };
    AnkiConnectMock.setResponder(() => malformedResponse);
    await expect(new Anki().ping()).rejects.toThrow();
  });

  test("invoke rejects an error response", async () => {
    const ankiErrorResponse: Record<string, unknown> = {
      result: null,
      error: "boom",
    };
    AnkiConnectMock.setResponder(() => ankiErrorResponse);
    await expect(new Anki().ping()).rejects.toThrow("boom");
  });

  test("requestPermission forwards the AnkiConnect response", async () => {
    const grantedPermission = { permission: "granted" };
    AnkiConnectMock.respondWith(grantedPermission);
    await expect(new Anki().requestPermission()).resolves.toEqual(
      grantedPermission,
    );
    expect(AnkiConnectMock.requests[0].action).toBe("requestPermission");
  });
});

describe("Anki - decks and notes lookup", () => {
  test("getDeckNames returns the deck list", async () => {
    const deckList = ["Default", "Languages"];
    AnkiConnectMock.respondWith(deckList);
    await expect(new Anki().getDeckNames()).resolves.toEqual(deckList);
    expect(AnkiConnectMock.requests[0]).toMatchObject({ action: "deckNames" });
  });

  test("findNotes sends the query", async () => {
    const deckQuery = "deck:Default";
    const foundNoteIds = [11, 22];
    AnkiConnectMock.respondWith(foundNoteIds);
    await expect(new Anki().findNotes(deckQuery)).resolves.toEqual(
      foundNoteIds,
    );
    expect(AnkiConnectMock.requests[0]).toMatchObject({
      action: "findNotes",
      params: { query: deckQuery },
    });
  });

  test("getCards asks notesInfo for the given ids", async () => {
    const requestedNoteIds = [1, 2];
    const notesInfo = [{ noteId: 1 }];
    AnkiConnectMock.respondWith(notesInfo);
    await expect(new Anki().getCards(requestedNoteIds)).resolves.toEqual(
      notesInfo,
    );
    expect(AnkiConnectMock.requests[0]).toMatchObject({
      action: "notesInfo",
      params: { notes: requestedNoteIds },
    });
  });

  test("cardsInfo asks cardsInfo for the given ids", async () => {
    const requestedCardIds = [3];
    AnkiConnectMock.respondWith([]);
    await new Anki().cardsInfo(requestedCardIds);
    expect(AnkiConnectMock.requests[0]).toMatchObject({
      action: "cardsInfo",
      params: { cards: requestedCardIds },
    });
  });

  test("deleteCards asks deleteNotes", async () => {
    const deletedNoteIds = [4];
    AnkiConnectMock.respondWith(null);
    await new Anki().deleteCards(deletedNoteIds);
    expect(AnkiConnectMock.requests[0]).toMatchObject({
      action: "deleteNotes",
      params: { notes: deletedNoteIds },
    });
  });

  test("createDeck sends the deck name", async () => {
    const newDeckName = "Languages";
    const newDeckId = 42;
    AnkiConnectMock.respondWith(newDeckId);
    await expect(new Anki().createDeck(newDeckName)).resolves.toEqual(
      newDeckId,
    );
    expect(AnkiConnectMock.requests[0]).toMatchObject({
      action: "createDeck",
      params: { deck: newDeckName },
    });
  });

  test("changeDeck sends card ids and the deck name", async () => {
    const movedCardIds = [5, 6];
    const targetDeck = "Languages";
    AnkiConnectMock.respondWith(null);
    await expect(
      new Anki().changeDeck(movedCardIds, targetDeck),
    ).resolves.toBeNull();
    expect(AnkiConnectMock.requests[0]).toMatchObject({
      action: "changeDeck",
      params: { cards: movedCardIds, deck: targetDeck },
    });
  });
});

describe("Anki - models", () => {
  const modelCreationResults: unknown[] = [null, null, null, null];
  const expectedModelNames = [
    basicModelName,
    basicReversedModelName,
    clozeModelName,
    spacedModelName,
  ];

  test("createModels builds the four base models", async () => {
    AnkiConnectMock.respondWith(modelCreationResults);
    await expect(new Anki().createModels(false, false)).resolves.toEqual(
      modelCreationResults,
    );

    const actions = multiSubActions();
    expect(actions).toHaveLength(4);
    expect(actions.map((a) => a.action)).toEqual([
      "createModel",
      "createModel",
      "createModel",
      "createModel",
    ]);
    const names = actions.map((a) => (a.params["modelName"] as string) ?? "");
    expect(names).toEqual(expectedModelNames);
  });

  test("createModels with source support adds the Source field", async () => {
    AnkiConnectMock.respondWith(modelCreationResults);
    await expect(new Anki().createModels(true, false)).resolves.toEqual(
      modelCreationResults,
    );

    const actions = multiSubActions();
    const names = actions.map((a) => (a.params["modelName"] as string) ?? "");
    for (const name of names) {
      expect(name).toContain(sourceDeckExtension);
    }
    const fields = actions[0].params["inOrderFields"] as string[];
    expect(fields).toContain("Source");
  });

  test("createModels with code highlight support doubles the models", async () => {
    const doubledResults = new Array(8).fill(null);
    AnkiConnectMock.respondWith(doubledResults);
    await expect(new Anki().createModels(false, true)).resolves.toEqual(
      doubledResults,
    );

    const actions = multiSubActions();
    expect(actions).toHaveLength(8);
    const names = actions.map((a) => (a.params["modelName"] as string) ?? "");
    expect(names.slice(4).every((n) => n.includes(codeDeckExtension))).toBe(
      true,
    );
  });
});

describe("Anki - media", () => {
  test("storeMediaFiles skips the request when there is no media", async () => {
    await expect(new Anki().storeMediaFiles([createCard()])).resolves.toEqual(
      {},
    );
    expect(AnkiConnectMock.requests).toHaveLength(0);
  });

  test("storeMediaFiles stores each media file", async () => {
    const mediaFilename = "image.png";
    const mediaContent = "ZGF0YQ==";
    const storeResults: unknown[] = [null];
    AnkiConnectMock.respondWith(storeResults);
    const card = createCard();
    card.mediaNames = [mediaFilename];
    card.mediaBase64Encoded = [mediaContent];

    await expect(new Anki().storeMediaFiles([card])).resolves.toEqual(
      storeResults,
    );

    const actions = multiSubActions();
    expect(actions).toEqual([
      {
        action: "storeMediaFile",
        params: { filename: mediaFilename, data: mediaContent },
      },
    ]);
  });

  test("storeCodeHighlightMedias does nothing when files exist", async () => {
    AnkiConnectMock.respondWith("file-content");
    await expect(
      new Anki().storeCodeHighlightMedias(),
    ).resolves.toBeUndefined();
    expect(AnkiConnectMock.requests).toHaveLength(1);
    expect(AnkiConnectMock.requests[0].action).toBe("retrieveMediaFile");
  });

  test("storeCodeHighlightMedias stores the three files when missing", async () => {
    const highlightStoreResults: unknown[] = [null, null, null];
    const expectedHighlightFiles = [
      "_highlight.js",
      "_highlightInit.js",
      "_highlight.css",
    ];
    AnkiConnectMock.setResponder((request) =>
      request.action === "retrieveMediaFile"
        ? { result: null, error: null }
        : { result: highlightStoreResults, error: null },
    );
    await expect(
      new Anki().storeCodeHighlightMedias(),
    ).resolves.toEqual(highlightStoreResults);

    expect(AnkiConnectMock.requests).toHaveLength(2);
    const actions = lastMultiSubActions();
    expect(actions.map((a) => a.action)).toEqual([
      "storeMediaFile",
      "storeMediaFile",
      "storeMediaFile",
    ]);
    const filenames = actions.map(
      (a) => (a.params as Record<string, string>)["filename"],
    );
    expect(filenames).toEqual(expectedHighlightFiles);
  });
});

describe("Anki - addCards", () => {
  test("batch success resolves the note ids", async () => {
    const createdNoteIds = [101, 102];
    AnkiConnectMock.respondWith(createdNoteIds);
    const ids = await new Anki().addCards([createCard(), createCard()]);

    expect(ids).toEqual(createdNoteIds);
    expect(AnkiConnectMock.requests).toHaveLength(1);
    const request = AnkiConnectMock.requests[0];
    expect(request.action).toBe("addNotes");
    const notes = request.params["notes"] as Array<Record<string, unknown>>;
    expect(notes).toHaveLength(createdNoteIds.length);
  });

  test("partial per-note errors still resolve the result array", async () => {
    const partialResponse: Record<string, unknown> = {
      result: [null, 102],
      error: ["duplicate", null],
    };
    AnkiConnectMock.setResponder(() => partialResponse);
    const ids = await new Anki().addCards([createCard(), createCard()]);
    expect(ids).toEqual([null, 102]);
    expect(AnkiConnectMock.requests).toHaveLength(1);
  });

  test("failed batch falls back to one note at a time", async () => {
    const batchError = "batch failed";
    const singleNoteId = 777;
    AnkiConnectMock.setResponder((request) => {
      const notes = request.params["notes"] as unknown[];
      if (notes.length > 1) {
        return { result: null, error: batchError };
      }
      return { result: [singleNoteId], error: null };
    });

    const ids = await new Anki().addCards([createCard(), createCard()]);

    expect(ids).toEqual([singleNoteId, singleNoteId]);
    expect(AnkiConnectMock.requests).toHaveLength(3);
    for (const single of AnkiConnectMock.requests.slice(1)) {
      expect((single.params["notes"] as unknown[]).length).toBe(1);
    }
  });

  test("failed single notes resolve to null", async () => {
    const alwaysFailingResponse: Record<string, unknown> = {
      result: null,
      error: "boom",
    };
    AnkiConnectMock.setResponder(() => alwaysFailingResponse);
    const ids = await new Anki().addCards([createCard(), createCard()]);
    expect(ids).toEqual([null, null]);
  });
});

describe("Anki - updateCards", () => {
  test("updates fields, merges tags and moves the deck", async () => {
    AnkiConnectMock.respondWith([null, null, null, null]);
    const card = createCard();
    const tagsInAnki = ["a", "b"];
    const tagsInObsidian = ["b", "c"];
    const addedTag = "c";
    const removedTag = "a";
    card.oldTags = tagsInAnki;
    card.tags = tagsInObsidian;

    await new Anki().updateCards([card]);

    const actions = multiSubActions();
    expect(actions.map((a) => a.action)).toEqual([
      "updateNoteFields",
      "addTags",
      "removeTags",
      "changeDeck",
    ]);
    const note = actions[0].params["note"] as Record<string, unknown>;
    expect(note["id"]).toBe(card.id);
    expect(actions[1].params).toMatchObject({
      notes: [card.id],
      tags: addedTag,
    });
    expect(actions[2].params).toMatchObject({
      notes: [card.id],
      tags: removedTag,
    });
    expect(actions[3].params).toMatchObject({
      cards: [card.id],
      deck: card.deckName,
    });
  });
});
