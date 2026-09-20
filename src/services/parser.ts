import { ISettings } from "src/conf/settings";
import * as showdown from "showdown";
import { Regex } from "src/conf/regex";
import { Flashcard } from "../entities/flashcard";
import { Inlinecard } from "src/entities/inlinecard";
import { Spacedcard } from "src/entities/spacedcard";
import { Clozecard } from "src/entities/clozecard";
import { escapeMarkdown } from "src/utils";

export class Parser {
  private regex: Regex;
  private settings: ISettings;
  private htmlConverter: showdown.Converter;

  /**
   * Creates a new Parser instance.
   * @param regex The regex definitions used to recognize flashcards, built from the current settings.
   * @param settings The plugin settings that control card generation behavior.
   */
  constructor(regex: Regex, settings: ISettings) {
    this.regex = regex;
    this.settings = settings;
    this.htmlConverter = new showdown.Converter();
    this.htmlConverter.setOption("simplifiedAutoLink", true);
    this.htmlConverter.setOption("tables", true);
    this.htmlConverter.setOption("tasks", true);
    this.htmlConverter.setOption("strikethrough", true);
    this.htmlConverter.setOption("ghCodeBlocks", true);
    this.htmlConverter.setOption("requireSpaceBeforeHeadingText", true);
    this.htmlConverter.setOption("simpleLineBreaks", true);
  }

  /**
   * Parses a note and generates all the flashcards found in it.
   * Runs every card generator (multiline with tag, inline, spaced, cloze),
   * discards cards fully inside code/math blocks, sorts by end offset
   * and appends the default Anki tag if one is configured.
   * @param file The full content of the note.
   * @param deck The name of the target Anki deck.
   * @param vault The name of the Obsidian vault, used to build obsidian:// links.
   * @param note The path of the note, used as the Source field when sourceSupport is on.
   * @param globalTags Tags added to every generated card.
   * @returns The list of flashcards found in the note, sorted by end offset.
   */
  public generateFlashcards(
    file: string,
    deck: string,
    vault: string,
    note: string,
    globalTags: string[] = []
  ): Flashcard[] {
    const contextAware = this.settings.contextAwareMode;
    let cards: Flashcard[] = [];
    let headings: RegExpMatchArray[] = [];

    if (contextAware) {
      // https://regex101.com/r/agSp9X/4
      headings = [...file.matchAll(this.regex.headingsRegex)];
    }

    note = this.substituteObsidianLinks(`[[${note}]]`, vault);
    cards = cards.concat(
      this.generateCardsWithTag(file, headings, deck, vault, note, globalTags)
    );
    cards = cards.concat(
      this.generateInlineCards(file, headings, deck, vault, note, globalTags)
    );
    cards = cards.concat(
      this.generateSpacedCards(file, headings, deck, vault, note, globalTags)
    );
    cards = cards.concat(
      this.generateClozeCards(file, headings, deck, vault, note, globalTags)
    );

    // Filter out cards that are fully inside a code block, a math block or a math inline block
    const codeBlocks = [...file.matchAll(this.regex.obsidianCodeBlock)];
    const mathBlocks = [...file.matchAll(this.regex.mathBlock)];
    const mathInline = [...file.matchAll(this.regex.mathInline)];
    const blocksToFilter = [...codeBlocks, ...mathBlocks, ...mathInline];
    const rangesToDiscard = blocksToFilter.map(x => ([x.index, x.index + x[0].length]))
    cards = cards.filter(card => {
      const cardRange = [card.initialOffset, card.endOffset];
      const isInRangeToDiscard = rangesToDiscard.some(range => {
        return (
          cardRange[0] >= range[0] && cardRange[1] <= range[1]
        );
      });
      return !isInRangeToDiscard;
    });

    cards.sort((a, b) => a.endOffset - b.endOffset);

    const defaultAnkiTag = this.settings.defaultAnkiTag;
    if (defaultAnkiTag) {
      for (const card of cards) {
        card.tags.push(defaultAnkiTag);
      }
    }

    return cards;
  }

  /**
   * Gives back the ancestor headings of a line.
   * @param headings The list of all the headings available in a file.
   * @param line The line whose ancestors need to be calculated.
   * @param headingLevel The level of the first ancestor heading, i.e. the number of #.
   */
  private getContext(
    headings: RegExpMatchArray[],
    index: number,
    headingLevel: number
  ): string[] {
    const context: string[] = [];
    let currentIndex: number = index;
    let goalLevel = 6;

    let i = headings.length - 1;
    // Get the level of the first heading before the index (i.e. above the current line)
    if (headingLevel !== -1) {
      // This is the case of a #flashcard in a heading
      goalLevel = headingLevel - 1;
    } else {
      // Find first heading and its level
      // This is the case of a #flashcard in a paragraph
      for (i; i >= 0; i--) {
        if (headings[i].index < currentIndex) {
          currentIndex = headings[i].index;
          goalLevel = headings[i][1].length - 1;

          context.unshift(headings[i][2].trim());
          break;
        }
      }
    }

    // Search for the other headings
    for (i; i >= 0; i--) {
      const currentLevel = headings[i][1].length;
      if (currentLevel == goalLevel && headings[i].index < currentIndex) {
        currentIndex = headings[i].index;
        goalLevel = currentLevel - 1;

        context.unshift(headings[i][2].trim());
      }
    }

    return context;
  }

  /**
   * Generates spaced repetition cards from lines like "Question #flashcards-spaced".
   * The whole line before the tag becomes the card prompt.
   * @returns The list of Spacedcards found in the file.
   */
  private generateSpacedCards(
    file: string,
    headings: RegExpMatchArray[],
    deck: string,
    vault: string,
    note: string,
    globalTags: string[] = []
  ) {
    const contextAware = this.settings.contextAwareMode;
    const cards: Spacedcard[] = [];
    const matches = [...file.matchAll(this.regex.cardsSpacedStyle)];

    for (const match of matches) {
      const reversed = false;
      let headingLevel = -1;
      if (match[1]) {
        headingLevel =
          match[1].trim().length !== 0 ? match[1].trim().length : -1;
      }
      // Match.index - 1 because otherwise in the context there will be even match[1], i.e. the question itself
      const context = contextAware
        ? this.getContext(headings, match.index - 1, headingLevel)
        : "";

      const originalPrompt = match[2].trim();
      let prompt = contextAware
        ? [...context, match[2].trim()].join(
          `${this.settings.contextSeparator}`
        )
        : match[2].trim();
      let medias: string[] = this.getImageLinks(prompt);
      medias = medias.concat(this.getAudioLinks(prompt));
      prompt = this.parseLine(prompt, vault);

      const initialOffset = match.index;
      const endingLine = match.index + match[0].length;
      const tags: string[] = this.parseTags(match[4], globalTags);
      const id: number = match[5] ? Number(match[5]) : -1;
      const inserted: boolean = match[5] ? true : false;
      const fields: Record<string, string> = { Prompt: prompt };
      if (this.settings.sourceSupport) {
        fields["Source"] = note;
      }
      const containsCode = this.containsCode([prompt]);

      const card = new Spacedcard(
        id,
        deck,
        originalPrompt,
        fields,
        reversed,
        initialOffset,
        endingLine,
        tags,
        inserted,
        medias,
        containsCode
      );
      cards.push(card);
    }

    return cards;
  }

  /**
   * Replaces math expressions ($$...$$ and $...$) with unique placeholders
   * so they are not touched by cloze parsing, and gives back a function
   * that restores the original expressions.
   */
  private shieldMath(text: string): { shielded: string; restore: (s: string) => string } {
    const placeholders: string[] = [];
    const shielded = text.replace(/\$\$[\s\S]+?\$\$|\$[^$]+?\$/g, (m) => {
      const idx = placeholders.length;
      placeholders.push(m);
      return `\uE000MATH${idx}\uE000`;
    });
    const restore = (s: string) =>
      s.replace(/\uE000MATH(\d+)\uE000/g, (_, i) => placeholders[Number(i)]);
    return { shielded, restore };
  }

  /**
   * Generates cloze deletion cards from ==highlights== and {curly} syntax,
   * converting them to the Anki {{cN::...}} format. Math is shielded first
   * so its braces are not mistaken for cloze markers. Lines without any
   * cloze marker are skipped.
   * @returns The list of Clozecards found in the file.
   */
  private generateClozeCards(
    file: string,
    headings: RegExpMatchArray[],
    deck: string,
    vault: string,
    note: string,
    globalTags: string[] = []
  ) {
    const contextAware = this.settings.contextAwareMode;
    const cards: Clozecard[] = [];
    const matches = [...file.matchAll(this.regex.cardsClozeWholeLine)];

    for (const match of matches) {
      const reversed = false;
      let headingLevel = -1;
      if (match[1]) {
        headingLevel =
          match[1].trim().length !== 0 ? match[1].trim().length : -1;
      }
      const context = contextAware
        ? this.getContext(headings, match.index - 1, headingLevel)
        : "";

      const { shielded, restore } = this.shieldMath(match[2]);
      let clozeText = shielded.replace(this.regex.singleClozeCurly, (m, g1, g2, g3) => {
        if (g2) {
          return `{{c${g2}::${g3}}}`;
        } else {
          return `{{c1::${g3}}}`;
        }
      });
      clozeText = clozeText.replace(this.regex.singleClozeHighlight, "{{c1::$2}}");

      if (clozeText === shielded) {
        continue;
      }

      clozeText = restore(clozeText);
      const originalLine = match[2].trim();
      clozeText = contextAware
        ? [...context, clozeText.trim()].join(
          `${this.settings.contextSeparator}`
        )
        : clozeText.trim();
      let medias: string[] = this.getImageLinks(clozeText);
      medias = medias.concat(this.getAudioLinks(clozeText));
      clozeText = this.parseLine(clozeText, vault);

      const initialOffset = match.index;
      const endingLine = match.index + match[0].length;
      const tags: string[] = this.parseTags(match[4], globalTags);
      const id: number = match[5] ? Number(match[5]) : -1;
      const inserted: boolean = match[5] ? true : false;
      const fields: Record<string, string> = { Text: clozeText, Extra: "" };
      if (this.settings.sourceSupport) {
        fields["Source"] = note;
      }
      const containsCode = this.containsCode([clozeText]);

      const card = new Clozecard(
        id,
        deck,
        originalLine,
        fields,
        reversed,
        initialOffset,
        endingLine,
        tags,
        inserted,
        medias,
        containsCode
      );
      cards.push(card);
    }

    return cards;
  }

  /**
   * Generates inline cards from single lines like "Question :: Answer".
   * Lines starting with "cards-deck" or "tags" are treated as directives
   * and skipped. ":::" produces a reversed card.
   * @returns The list of Inlinecards found in the file.
   */
  private generateInlineCards(
    file: string,
    headings: RegExpMatchArray[],
    deck: string,
    vault: string,
    note: string,
    globalTags: string[] = []
  ) {
    const contextAware = this.settings.contextAwareMode;
    const cards: Inlinecard[] = [];
    const matches = [...file.matchAll(this.regex.cardsInlineStyle)];

    for (const match of matches) {
      if (
        match[2].toLowerCase().startsWith("cards-deck") ||
        match[2].toLowerCase().startsWith("tags")
      ) {
        continue;
      }

      const reversed: boolean = match[3] === this.settings.inlineSeparatorReverse;
      let headingLevel = -1;
      if (match[1]) {
        headingLevel =
          match[1].trim().length !== 0 ? match[1].trim().length : -1;
      }
      // Match.index - 1 because otherwise in the context there will be even match[1], i.e. the question itself
      const context = contextAware
        ? this.getContext(headings, match.index - 1, headingLevel)
        : "";

      const originalQuestion = match[2].trim();
      let question = contextAware
        ? [...context, match[2].trim()].join(
          `${this.settings.contextSeparator}`
        )
        : match[2].trim();
      let answer = match[4].trim();
      let medias: string[] = this.getImageLinks(question);
      medias = medias.concat(this.getImageLinks(answer));
      medias = medias.concat(this.getAudioLinks(answer));
      question = this.parseLine(question, vault);
      answer = this.parseLine(answer, vault);

      const initialOffset = match.index
      const endingLine = match.index + match[0].length;
      const tags: string[] = this.parseTags(match[5], globalTags);
      const id: number = match[6] ? Number(match[6]) : -1;
      const inserted: boolean = match[6] ? true : false;
      const fields: Record<string, string> = { Front: question, Back: answer };
      if (this.settings.sourceSupport) {
        fields["Source"] = note;
      }
      const containsCode = this.containsCode([question, answer]);

      const card = new Inlinecard(
        id,
        deck,
        originalQuestion,
        fields,
        reversed,
        initialOffset,
        endingLine,
        tags,
        inserted,
        medias,
        containsCode
      );
      cards.push(card);
    }

    return cards;
  }

  /**
   * Generates multiline cards from blocks like:
   *   Question
   *   #flashcards[-reverse]
   *   Answer (possibly multiple lines)
   * Embedded notes (![[note]]) found in the answer are replaced with their content.
   * @returns The list of Flashcards found in the file.
   */
  private generateCardsWithTag(
    file: string,
    headings: RegExpMatchArray[],
    deck: string,
    vault: string,
    note: string,
    globalTags: string[] = []
  ) {
    const contextAware = this.settings.contextAwareMode;
    const cards: Flashcard[] = [];
    const matches = [...file.matchAll(this.regex.flashscardsWithTag)];

    const embedMap = this.getEmbedMap();

    for (const match of matches) {
      const reversed: boolean =
        match[3].trim().toLowerCase() ===
        `#${this.settings.flashcardsTag}-reverse` ||
        match[3].trim().toLowerCase() ===
        `#${this.settings.flashcardsTag}/reverse`;
      const headingLevel = match[1].trim().length !== 0 ? match[1].length : -1;
      // Match.index - 1 because otherwise in the context there will be even match[1], i.e. the question itself
      const context = contextAware
        ? this.getContext(headings, match.index - 1, headingLevel).concat([])
        : "";

      const originalQuestion = match[2].trim();
      let question = contextAware
        ? [...context, match[2].trim()].join(
          `${this.settings.contextSeparator}`
        )
        : match[2].trim();
      let answer = match[5].trim();
      let medias: string[] = this.getImageLinks(question);
      medias = medias.concat(this.getImageLinks(answer));
      medias = medias.concat(this.getAudioLinks(answer));

      answer = this.getEmbedWrapContent(embedMap, answer);

      question = this.parseLine(question, vault);
      answer = this.parseLine(answer, vault);

      const initialOffset = match.index
      const endingLine = match.index + match[0].length;
      const tags: string[] = this.parseTags(match[4], globalTags);
      const id: number = match[6] ? Number(match[6]) : -1;
      const inserted: boolean = match[6] ? true : false;
      const fields: Record<string, string> = { Front: question, Back: answer };
      if (this.settings.sourceSupport) {
        fields["Source"] = note;
      }
      const containsCode = this.containsCode([question, answer]);

      const card = new Flashcard(
        id,
        deck,
        originalQuestion,
        fields,
        reversed,
        initialOffset,
        endingLine,
        tags,
        inserted,
        medias,
        containsCode
      );
      cards.push(card);
    }

    return cards;
  }

  /**
   * Checks whether any of the given strings contains an HTML code block.
   * Used to route cards containing code to a separate deck.
   * @param str The strings to check, usually already converted fields of a card.
   * @returns True if at least one string matches the code block regex.
   */
  public containsCode(str: string[]): boolean {
    for (const s of str) {
      if (s.match(this.regex.codeBlock)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Finds block IDs (^13 digits) that have no content above them anymore,
   * i.e. cards whose content was deleted from the note and that should be
   * removed from Anki as well.
   * @param file The full content of the note.
   * @returns The list of orphan block IDs.
   */
  public getCardsToDelete(file: string): number[] {
    // Find block IDs with no content above it
    return [...file.matchAll(this.regex.cardsToDelete)].map((match) => {
      return Number(match[1]);
    });
  }

  /**
   * Converts a single string into Anki HTML: substitutes image/audio/obsidian links,
   * converts math to Anki delimiters and finally renders markdown to HTML.
   * @param str The raw text of a card field.
   * @param vaultName The name of the Obsidian vault, used for obsidian:// links.
   */
  private parseLine(str: string, vaultName: string) {
    return this.htmlConverter.makeHtml(
      this.mathToAnki(
        this.substituteObsidianLinks(
          this.substituteImageLinks(this.substituteAudioLinks(str)),
          vaultName
        )
      )
    );
  }

  /**
   * Extracts image file names from wiki ![[image.png]] and
   * markdown ![alt](image.png) style links.
   * @returns The list of image file names referenced by the string.
   */
  private getImageLinks(str: string) {
    const wikiMatches = str.matchAll(this.regex.wikiImageLinks);
    const markdownMatches = str.matchAll(this.regex.markdownImageLinks);
    const links: string[] = [];

    for (const wikiMatch of wikiMatches) {
      links.push(wikiMatch[1]);
    }

    for (const markdownMatch of markdownMatches) {
      links.push(decodeURIComponent(markdownMatch[1]));
    }

    return links;
  }

  /**
   * Extracts audio file names from wiki ![[audio.mp3]] style links.
   * @returns The list of audio file names referenced by the string.
   */
  private getAudioLinks(str: string) {
    const wikiMatches = str.matchAll(this.regex.wikiAudioLinks);
    const links: string[] = [];

    for (const wikiMatch of wikiMatches) {
      links.push(wikiMatch[1]);
    }

    return links;
  }

  /**
   * Converts wiki [[note]] links into clickable obsidian:// URLs.
   * @param str The text to process.
   * @param vaultName The name of the Obsidian vault to link against.
   */
  private substituteObsidianLinks(str: string, vaultName: string) {
    const linkRegex = /\[\[(.+?)(?:\|(.+?))?\]\]/gim;
    vaultName = encodeURIComponent(vaultName);

    return str.replace(linkRegex, (match, filename, rename) => {
      const href = `obsidian://open?vault=${vaultName}&file=${encodeURIComponent(
        filename
      )}.md`;
      const fileRename = rename ? rename : filename;
      return `<a href="${href}">${fileRename}</a>`;
    });
  }

  /**
   * Converts wiki ![[image]] and markdown ![](image) links into <img> tags.
   */
  private substituteImageLinks(str: string): string {
    str = str.replace(this.regex.wikiImageLinks, "<img src='$1'>");
    str = str.replace(this.regex.markdownImageLinks, "<img src='$1'>");

    return str;
  }

  /**
   * Converts wiki ![[audio]] links into Anki [sound:...] references.
   */
  private substituteAudioLinks(str: string): string {
    return str.replace(this.regex.wikiAudioLinks, "[sound:$1]");
  }

  /**
   * Converts Obsidian math syntax ($$...$$ and $...$)
   * into the Anki delimiters \\[...\\] and \\(...\\),
   * escaping special characters inside the expression.
   */
  private mathToAnki(str: string) {
    str = str.replace(this.regex.mathBlock, function (match, p1, p2) {
      return "\\\\[" + escapeMarkdown(p2) + " \\\\]";
    });

    str = str.replace(this.regex.mathInline, function (match, p1, p2) {
      return "\\\\(" + escapeMarkdown(p2) + "\\\\)";
    });

    return str;
  }

  /**
   * Parses the tag portion of a card match into a tag list:
   * splits on "#", trims each tag and converts the Obsidian hierarchy
   * separator "/" into the Anki separator "::". Global tags come first.
   * @param str The matched tag string, e.g. " #tag1 #parent/tag2".
   * @param globalTags Tags that are added to every card.
   */
  private parseTags(str: string, globalTags: string[]): string[] {
    const tags: string[] = [...globalTags];

    if (str) {
      for (const tag of str.split("#")) {
        let newTag = tag.trim();
        if (newTag) {
          // Replace obsidian hierarchy tags delimeter \ with anki delimeter ::
          newTag = newTag.replace(this.regex.tagHierarchy, "::");
          tags.push(newTag);
        }
      }
    }

    return tags;
  }

  /**
   * Finds all Anki block IDs (^13 digits) in the note.
   * Used to detect inconsistencies between existing IDs and generated cards.
   * @param file The full content of the note.
   * @returns The list of raw regex matches for every block ID found.
   */
  public getAnkiIDsBlocks(file: string): RegExpMatchArray[] {
    return Array.from(file.matchAll(/\^(\d{13})\s*/gm));
  }

  /**
   * Builds a map of embedded notes currently rendered in the Obsidian DOM:
   * key is the embed source ("note name"), value is its content converted
   * back to markdown. Requires the Obsidian global activeDocument,
   * so it only works inside the app and not in tests without a mock.
   */
  private getEmbedMap() {

    // key：link url 
    // value： embed content parse from html document
    const embedMap = new Map<string, string>()

    const embedList = Array.from(activeDocument.documentElement.getElementsByClassName('internal-embed'));


    Array.from(embedList).forEach((el) => {
      // markdown-embed-content markdown-embed-page
      const embedValue = this.htmlConverter.makeMarkdown(this.htmlConverter.makeHtml(el.outerHTML).toString());

      const embedKey = el.getAttribute("src");
      if (embedKey) {
        embedMap.set(embedKey, embedValue);
      }

      // console.log("embedKey: \n" + embedKey);
      // console.log("embedValue: \n" + embedValue);
    });

    return embedMap;
  }

  /**
   * Appends the content of every embedded note (![[note]]) found in the
   * given text using the provided embed map (transclusion).
   * @param embedMap Map of embed sources to their markdown content.
   * @param embedContent The raw answer text possibly containing embeds.
   */
  private getEmbedWrapContent(embedMap: Map<string, string>, embedContent: string): string {
    let result: RegExpExecArray | null;
    while ((result = this.regex.embedBlock.exec(embedContent)) !== null) {
      // console.log("result[0]: " + result[0]);
      // console.log("embedMap.get(result[1]): " + embedMap.get(result[1]));
      embedContent = embedContent.concat(embedMap.get(result[1]) ?? "");
    }
    return embedContent;
  }

}
