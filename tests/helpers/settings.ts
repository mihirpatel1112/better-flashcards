import { ISettings } from "src/conf/settings";

export function createSettings(overrides: Partial<ISettings> = {}): ISettings {
  return {
    contextAwareMode: false,
    sourceSupport: false,
    codeHighlightSupport: true,
    inlineID: false,
    contextSeparator: " > ",
    deck: "Default",
    folderBasedDeck: false,
    flashcardsTag: "card",
    inlineSeparator: "::",
    inlineSeparatorReverse: ":::",
    defaultAnkiTag: "",
    ankiConnectPermission: false,
    ignoredDirectories: "",
    ...overrides,
  };
}
