import { Parser } from "src/services/parser";
import { Regex } from "src/conf/regex";
import { ISettings } from "src/conf/settings";
import { createSettings } from "../helpers/settings";
import { setActiveDocument } from "../mocks/obsidian";
import { Flashcard } from "src/entities/flashcard";
import { Inlinecard } from "src/entities/inlinecard";
import { Spacedcard } from "src/entities/spacedcard";
import { Clozecard } from "src/entities/clozecard";
import {
  basicModelName,
  basicReversedModelName,
  spacedModelName,
} from "src/conf/constants";

function createParser(overrides: Partial<ISettings> = {}): Parser {
  const settings = createSettings(overrides);
  return new Parser(new Regex(settings), settings);
}

function generate(
  file: string,
  overrides: Partial<ISettings> = {},
  globalTags: string[] = []
) {
  return createParser(overrides).generateFlashcards(
    file,
    "Test deck",
    "Vault",
    "Note",
    globalTags
  );
}

beforeEach(() => {
  setActiveDocument();
});

function htmlToPlainText(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

describe("Parser - inline cards (Q :: A)", () => {
  test("parses basic inline card with fields, deck and offsets", () => {
    const question = "What is 2+2?";
    const answer = "4";
    const cardLine = `${question} :: ${answer}`;
    const file = `${cardLine}\n`;
    const cards = generate(file);

    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card).toBeInstanceOf(Inlinecard);
    expect(card.fields["Front"]).toContain(question);
    expect(card.fields["Back"]).toContain(answer);
    expect(card.reversed).toBe(false);
    expect(card.deckName).toBe("Test deck");
    expect(card.initialOffset).toBe(0);
    expect(card.endOffset).toBe(cardLine.length);
    expect(card.inserted).toBe(false);
    expect(card.id).toBe(-1);
  });

  test("parses reversed inline card (:::)", () => {
    const cards = generate("Capital of France ::: Paris\n");

    expect(cards).toHaveLength(1);
    expect(cards[0].reversed).toBe(true);
    expect(cards[0].modelName).toBe(basicReversedModelName);
  });

  test("skips lines starting with cards-deck", () => {
    const cards = generate("cards-deck: Foo :: Bar\n");
    expect(cards).toHaveLength(0);
  });

  test("skips lines starting with tags", () => {
    const cards = generate("tags: #a :: b\n");
    expect(cards).toHaveLength(0);
  });

  test("collects card tags and converts hierarchy separator", () => {
    const cards = generate("Q :: A #science/physics #important\n");

    expect(cards[0].tags).toEqual(["science::physics", "important"]);
  });

  test("merges global tags before card tags", () => {
    const globalTag = "global1";
    const cardTag = "card-tag";
    const cards = generate(
      `Q :: A #${cardTag}\n`,
      {},
      [globalTag]
    );

    expect(cards[0].tags).toEqual([globalTag, cardTag]);
  });

  test("reads inline block ID when inlineID enabled", () => {
    const blockId = 1234567890123;
    const cards = generate(
      `Q :: A ^${blockId}\n`,
      { inlineID: true }
    );

    expect(cards[0].id).toBe(blockId);
    expect(cards[0].inserted).toBe(true);
  });

  test("adds Source field when sourceSupport enabled", () => {
    const vault = "Vault";
    const note = "Note";
    const settings = createSettings({ sourceSupport: true });
    const parser = new Parser(new Regex(settings), settings);
    const cards = parser.generateFlashcards(
      "Q :: A\n",
      "Deck",
      vault,
      note
    );

    expect(cards[0].fields["Source"]).toBe(
      `<a href="obsidian://open?vault=${vault}&file=${note}.md">${note}</a>`
    );
  });

  test("parses card defined in a heading line", () => {
    const question = "Heading question";
    const cards = generate(`# ${question} :: answer\n`);

    expect(cards).toHaveLength(1);
    expect(cards[0].fields["Front"]).toContain("<p>" + question + "</p>");
  });

  test("parses card defined as a list item", () => {
    const question = "List question";
    const cards = generate(`- ${question} :: list answer\n`);

    expect(cards).toHaveLength(1);
    expect(cards[0].fields["Front"]).toContain("<p>" + question + "</p>");
  });

  test("converts markdown to HTML in fields", () => {
    const boldText = "bold";
    const cards = generate(`This is **${boldText}** :: answer\n`);

    expect(cards[0].fields["Front"]).toContain(
      `<p>This is <strong>${boldText}</strong></p>`
    );
  });

  test("detects code in card content", () => {
    const cards = generate("Use `printf` here :: output\n");

    expect(cards).toHaveLength(1);
    expect(cards[0].containsCode).toBe(true);
  });

  test("collects wiki image and audio links as medias", () => {
    const image = "photo.png";
    const audio = "voice.mp3";
    const cards = generate(
      `Look ![[${image}]] :: Listen ![[${audio}]]\n`
    );

    expect(cards).toHaveLength(1);
    expect(cards[0].mediaNames).toContain(image);
    expect(cards[0].mediaNames).toContain(audio);
  });
});

describe("Parser - spaced repetition cards", () => {
  test("parses single-line spaced card", () => {
    const prompt = "What is Anki?";
    const cards = generate(`${prompt} #card-spaced\n`);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Spacedcard);
    expect(cards[0].fields["Prompt"]).toContain("<p>" + prompt + "</p>");
    expect(cards[0].modelName).toBe(spacedModelName);
  });

  test("collects additional tags on spaced card", () => {
    const cards = generate("Addition #card-spaced #math\n");

    expect(cards[0].tags).toEqual(["math"]);
  });

  test("does not create cards from plain lines", () => {
    const cards = generate("Just an ordinary sentence.\n");
    expect(cards).toHaveLength(0);
  });
});

describe("Parser - cloze cards", () => {
  test("converts ==highlight== to cloze deletion", () => {
    const word = "Sun";
    const line = `The ==${word}== is hot`;
    const cards = generate(`${line}\n`);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Clozecard);
    expect(cards[0].fields["Text"]).toContain(`<p>The {{c1::${word}}} is hot</p>`);
    expect(cards[0].initialContent).toBe(line);
  });

  test("converts {curly} syntax to cloze deletion", () => {
    const word = "dog";
    const cards = generate(`A {${word}} barks\n`);

    expect(cards[0].fields["Text"]).toContain(`<p>A {{c1::${word}}} barks</p>`);
  });

  test("respects explicit cloze numbering ({2:...})", () => {
    const secondWord = "dog";
    const firstWord = "cat";
    const cards = generate(
      `A {2:${secondWord}} and a {1:${firstWord}}\n`
    );

    expect(cards[0].fields["Text"]).toContain(`{{c2::${secondWord}}}`);
    expect(cards[0].fields["Text"]).toContain(`{{c1::${firstWord}}}`);
  });

  test("does not create cloze card without cloze markers", () => {
    const cards = generate("Nothing special here\n");
    expect(cards).toHaveLength(0);
  });

  test("shields math from cloze parsing", () => {
    const math = "E=mc^2";
    const word = "energy";
    const cards = generate(`$${math}$ says ==${word}==\n`);

    expect(cards).toHaveLength(1);
    expect(cards[0].fields["Text"]).toContain(`{{c1::${word}}}`);
    expect(cards[0].fields["Text"]).toContain(math);
  });
});

describe("Parser - multiline cards with tag", () => {
  test("parses multiline card under flashcards tag", () => {
    const question = "Two plus two";
    const answer = "Four";
    const cards = generate(`${question}\n#card\n${answer}\n`);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toBeInstanceOf(Flashcard);
    expect(cards[0].fields["Front"]).toContain(question);
    expect(cards[0].fields["Back"]).toContain(answer);
    expect(cards[0].reversed).toBe(false);
    expect(cards[0].modelName).toBe(basicModelName);
  });

  test("parses reversed multiline card", () => {
    const cards = generate("Capital city\n#card-reverse\nWarsaw\n");

    expect(cards).toHaveLength(1);
    expect(cards[0].reversed).toBe(true);
    expect(cards[0].modelName).toBe(basicReversedModelName);
  });

  test("inlines embedded note content into the answer", () => {
    const embedMarker = "EMBEDCONTENTMARKER";
    const embedSrc = "embedded-note";

    setActiveDocument([
      {
        src: embedSrc,
        outerHTML: `<div class="internal-embed">${embedMarker}</div>`,
      },
    ]);

    const settings = createSettings();
    const parser = new Parser(new Regex(settings), settings);
    jest
      .spyOn(
        (parser as unknown as { htmlConverter: { makeMarkdown: (html: string) => string } })
          .htmlConverter,
        "makeMarkdown"
      )
      .mockReturnValue(embedMarker);

    const cards = parser.generateFlashcards(
      `Front side\n#card\nSee ![[${embedSrc}]]\n`,
      "Test deck",
      "Vault",
      "Note"
    );

    expect(cards).toHaveLength(1);
    expect(cards[0].fields["Back"]).toContain(`<p>See !<a href="obsidian://open?vault=Vault&file=embedded-note.md">${embedSrc}</a>${embedMarker}</p>`);
  });
});

describe("Parser - context aware mode", () => {
  const topic = "Topic";
  const subtopic = "Subtopic";
  const question = "What";
  const file = `# ${topic}\n\n## ${subtopic}\n\n${question} :: Answer\n`;

  test("prepends heading context to the prompt", () => {
    const cards = generate(file, { contextAwareMode: true });
    const front = htmlToPlainText(cards[0].fields["Front"]);

    expect(front).toContain("&gt;");
    expect(front).toContain(topic);
    expect(front).toContain(subtopic);
    expect(front).toContain(question);
    expect(front.match(/&gt;/g)).toHaveLength(2);
  });

  test("omits context when contextAwareMode disabled", () => {
    const cards = generate(file);
    const front = htmlToPlainText(cards[0].fields["Front"]);

    expect(front).not.toContain("&gt;");
    expect(front).not.toContain(topic);
    expect(front).not.toContain(subtopic);
  });

  test("collects all heading levels from deeply nested notes", () => {
    const deepTopics = [
      "First",
      "Second",
      "Third",
      "Fourth",
      "Fifth",
    ];
    const deepFile =
      deepTopics
        .map((name, i) => `${"#".repeat(i + 1)} ${name}`)
        .join("\n\n") + `\n\n${question} :: Answer\n`;

    const cards = generate(deepFile, { contextAwareMode: true });
    const front = htmlToPlainText(cards[0].fields["Front"]);

    expect(cards).toHaveLength(1);
    expect(front.match(/&gt;/g)).toHaveLength(deepTopics.length);
    for (const name of deepTopics) {
      expect(front).toContain(name);
    }
    expect(front).toContain(question);
  });
});

describe("Parser - filtering and ordering", () => {
  test.each([
    ["code block", "```\nHidden :: Card\n```\n"],
    ["math block", "$$\nx :: y\n$$\n"],
    ["math inline", "$x :: y$\n"],
  ])("discards cards fully inside %s", (_name, file) => {
    expect(generate(file)).toHaveLength(0);
  });

  test("sorts generated cards by end offset", () => {
    const cards = generate("First :: one\n\nSecond :: two\n");

    expect(cards).toHaveLength(2);
    expect(cards[0].endOffset).toBeLessThan(cards[1].endOffset);
  });

  test("appends default Anki tag to all cards", () => {
    const defaultTag = "imported";
    const cards = generate("Q :: A\n", { defaultAnkiTag: defaultTag });

    expect(cards[0].tags).toContain(defaultTag);
  });
});

describe("Parser - public helper methods", () => {
  test("containsCode detects <code> blocks", () => {
    const parser = createParser();

    expect(parser.containsCode(["<code>x = 1</code>"])).toBe(true);
    expect(parser.containsCode(["plain text"])).toBe(false);
  });

  test("getCardsToDelete returns orphan block IDs", () => {
    const parser = createParser();
    const blockId = 1234567890123;

    expect(parser.getCardsToDelete(`text\n\n^${blockId}\n`)).toEqual([
      blockId,
    ]);
  });

  test("getAnkiIDsBlocks finds all block IDs", () => {
    const parser = createParser();
    const firstId = "1111111111111";
    const secondId = "2222222222222";
    const blocks = parser.getAnkiIDsBlocks(
      `a ^${firstId} b ^${secondId}\n`
    );

    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b[1])).toEqual([firstId, secondId]);
  });
});
