import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import { Anki } from "src/services/anki";
import { escapeRegExp } from "src/utils";
import type { ISettings } from "src/conf/settings";
import type ObsidianFlashcard from "../../main";

export class SettingsTab extends PluginSettingTab {
  plugin: ObsidianFlashcard;

  constructor(app: App, plugin: ObsidianFlashcard) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem<keyof ISettings>[] {
    const plugin = this.plugin;

    const permissionDescription = createFragment();
    permissionDescription.append(
      "This needs to be done only one time. Open Anki and click the button to grant permission.",
      createEl("br"),
      "Be aware that AnkiConnect must be installed.",
    );

    return [
      {
        name: "Give Permission",
        desc: permissionDescription,
        render: (setting) => {
          setting.addButton((button) => {
            button.setButtonText("Grant Permission").onClick(() => {
              void new Anki()
                .requestPermission()
                .then((result) => {
                  if (result.permission === "granted") {
                    plugin.settings.ankiConnectPermission = true;
                    void plugin.saveData(plugin.settings);
                    new Notice("Anki Connect permission granted");
                  } else {
                    new Notice("AnkiConnect permission not granted");
                  }
                })
                .catch((error) => {
                  new Notice("Something went wrong, is Anki open?");
                  console.error(error);
                });
            });
          });
        },
      },
      {
        name: "Test Anki",
        desc: "Test that connection between Anki and Obsidian actually works.",
        render: (setting) => {
          setting.addButton((text) => {
            text.setButtonText("Test").onClick(() => {
              void new Anki()
                .ping()
                .then(() => new Notice("Anki works"))
                .catch(() => new Notice("Anki is not connected"));
            });
          });
        },
      },
      {
        name: "Context-aware mode",
        desc: "Add the ancestor headings to the question of the flashcard.",
        control: { type: "toggle", key: "contextAwareMode" },
      },
      {
        name: "Source support",
        desc: "Add to every card the source, i.e. the link to the original card. NOTE: Old cards made without source support cannot be updated.",
        control: { type: "toggle", key: "sourceSupport" },
      },
      {
        name: "Code highlight support",
        desc: "Add highlight of the code in Anki.",
        control: { type: "toggle", key: "codeHighlightSupport" },
      },
      {
        name: "Inline ID support",
        desc: "Add ID to end of line for inline cards.",
        control: { type: "toggle", key: "inlineID" },
      },
      {
        name: "Folder-based sub-decks",
        desc: "Create sub-decks based on folder structure under the deck specified below.",
        control: { type: "toggle", key: "folderBasedDeck" },
      },
      {
        name: "Deck name",
        desc: "Top-level deck for all cards. Folder-based sub-decks are created under this deck.",
        control: {
          type: "text",
          key: "deck",
          placeholder: "Deck::sub-deck",
          validate: (value) => {
            if (!value.length) {
              return "The deck name must be at least 1 character long";
            }
          },
        },
      },
      {
        name: "Ignored directories",
        desc: "Comma-separated list of directories to skip when generating cards (e.g. templates, daily-notes).",
        control: {
          type: "text",
          key: "ignoredDirectories",
          placeholder: "templates, daily-notes",
        },
      },
      {
        name: "Default Anki tag",
        desc: "This tag will be added to each generated card on Anki",
        render: (setting) => {
          setting.addText((text) => {
            text
              .setValue(plugin.settings.defaultAnkiTag)
              .setPlaceholder("Anki tag")
              .onChange((value) => {
                if (!value) new Notice("No default tags will be added");
                plugin.settings.defaultAnkiTag = value.toLowerCase();
                void plugin.saveData(plugin.settings);
              });
          });
        },
      },
      {
        type: "group",
        heading: "Cards identification",
        items: [
          {
            name: "Flashcards #tag",
            desc: "The tag to identify the flashcards in the notes (case-insensitive).",
            render: (setting) => {
              setting.addText((text) => {
                text
                  .setValue(plugin.settings.flashcardsTag)
                  .setPlaceholder("Card")
                  .onChange((value) => {
                    if (value) {
                      plugin.settings.flashcardsTag = value.toLowerCase();
                      void plugin.saveData(plugin.settings);
                    } else {
                      new Notice("The tag must be at least 1 character long");
                    }
                  });
              });
            },
          },
          {
            name: "Inline card separator",
            desc: "The separator to identifty the inline cards in the notes.",
            render: (setting) => {
              setting.addText((text) => {
                text
                  .setValue(plugin.settings.inlineSeparator)
                  .setPlaceholder("::")
                  .onChange((value) => {
                    if (
                      value.trim().length === 0 ||
                      value === plugin.settings.inlineSeparatorReverse
                    ) {
                      plugin.settings.inlineSeparator = "::";
                      if (value.trim().length === 0) {
                        new Notice(
                          "The separator must be at least 1 character long",
                        );
                      } else if (
                        value === plugin.settings.inlineSeparatorReverse
                      ) {
                        new Notice(
                          "The separator must be different from the inline reverse separator",
                        );
                      }
                    } else {
                      plugin.settings.inlineSeparator = escapeRegExp(
                        value.trim(),
                      );
                      new Notice("The separator has been changed");
                    }
                    void plugin.saveData(plugin.settings);
                  });
              });
            },
          },
          {
            name: "Inline reverse card separator",
            desc: "The separator to identifty the inline revese cards in the notes.",
            render: (setting) => {
              setting.addText((text) => {
                text
                  .setValue(plugin.settings.inlineSeparatorReverse)
                  .setPlaceholder(":::")
                  .onChange((value) => {
                    if (
                      value.trim().length === 0 ||
                      value === plugin.settings.inlineSeparator
                    ) {
                      plugin.settings.inlineSeparatorReverse = ":::";
                      if (value.trim().length === 0) {
                        new Notice(
                          "The separator must be at least 1 character long",
                        );
                      } else if (value === plugin.settings.inlineSeparator) {
                        new Notice(
                          "The separator must be different from the inline separator",
                        );
                      }
                    } else {
                      plugin.settings.inlineSeparatorReverse = escapeRegExp(
                        value.trim(),
                      );
                      new Notice("The separator has been changed");
                    }
                    void plugin.saveData(plugin.settings);
                  });
              });
            },
          },
        ],
      },
    ];
  }

  display(): void {
    const { containerEl } = this;
    const plugin = this.plugin;

    containerEl.empty();

    const description = createFragment()
    description.append(
      "This needs to be done only one time. Open Anki and click the button to grant permission.",
          createEl('br'),
        'Be aware that AnkiConnect must be installed.',
    )

    new Setting(containerEl)
      .setName("Give Permission")
      .setDesc(description)
      .addButton((button) => {
        button.setButtonText("Grant Permission").onClick(() => {

          void new Anki().requestPermission().then((result) => {
            if (result.permission === "granted") {
              plugin.settings.ankiConnectPermission = true;
              void plugin.saveData(plugin.settings);
              new Notice("Anki Connect permission granted");
            } else {
              new Notice("AnkiConnect permission not granted");
            }
          }).catch((error) => {
            new Notice("Something went wrong, is Anki open?");
            console.error(error);
          });
        });
      });
  

    new Setting(containerEl)
      .setName("Test Anki")
      .setDesc("Test that connection between Anki and Obsidian actually works.")
      .addButton((text) => {
        text.setButtonText("Test").onClick(() => {
          void new Anki()
            .ping()
            .then(() => new Notice("Anki works"))
            .catch(() => new Notice("Anki is not connected"));
        });
      });
  
    new Setting(containerEl)
      .setName("Context-aware mode")
      .setDesc("Add the ancestor headings to the question of the flashcard.")
      .addToggle((toggle) =>
        toggle.setValue(plugin.settings.contextAwareMode).onChange((value) => {
          plugin.settings.contextAwareMode = value;
          void plugin.saveData(plugin.settings);
        })
      );

    new Setting(containerEl)
      .setName("Source support")
      .setDesc(
        "Add to every card the source, i.e. the link to the original card. NOTE: Old cards made without source support cannot be updated."
      )
      .addToggle((toggle) =>
        toggle.setValue(plugin.settings.sourceSupport).onChange((value) => {
          plugin.settings.sourceSupport = value;
          void plugin.saveData(plugin.settings);
        })
      );

    new Setting(containerEl)
      .setName("Code highlight support")
      .setDesc("Add highlight of the code in Anki.")
      .addToggle((toggle) =>
        toggle
          .setValue(plugin.settings.codeHighlightSupport)
          .onChange((value) => {
            plugin.settings.codeHighlightSupport = value;
            void plugin.saveData(plugin.settings);
          })
      );
    new Setting(containerEl)
      .setName("Inline ID support")
      .setDesc("Add ID to end of line for inline cards.")
      .addToggle((toggle) =>
        toggle.setValue(plugin.settings.inlineID).onChange((value) => {
          plugin.settings.inlineID = value;
          void plugin.saveData(plugin.settings);
        })
      );

    new Setting(containerEl)
      .setName("Folder-based sub-decks")
      .setDesc("Create sub-decks based on folder structure under the deck specified below.")
      .addToggle((toggle) =>
        toggle.setValue(plugin.settings.folderBasedDeck).onChange((value) => {
          plugin.settings.folderBasedDeck = value;
          void plugin.saveData(plugin.settings);
        })
      );


    new Setting(containerEl)
      .setName("Deck name")
      .setDesc(
        "Top-level deck for all cards. Folder-based sub-decks are created under this deck."
      )
      .addText((text) => {
        text
          .setValue(plugin.settings.deck)
          .setPlaceholder("Deck::sub-deck")
          .onChange((value) => {
            if (value.length) {
              plugin.settings.deck = value;
              void plugin.saveData(plugin.settings);
            } else {
              new Notice("The deck name must be at least 1 character long");
            }
          });
      });

    new Setting(containerEl)
      .setName("Ignored directories")
      .setDesc(
        "Comma-separated list of directories to skip when generating cards (e.g. templates, daily-notes)."
      )
      .addText((text) => {
        text
          .setValue(plugin.settings.ignoredDirectories)
          .setPlaceholder("templates, daily-notes")
          .onChange((value) => {
            plugin.settings.ignoredDirectories = value;
            void plugin.saveData(plugin.settings);
          });
      });

      new Setting(containerEl)
        .setName("Default Anki tag")
        .setDesc("This tag will be added to each generated card on Anki")
        .addText((text) => {
          text
            .setValue(plugin.settings.defaultAnkiTag)
            .setPlaceholder("Anki tag")
            .onChange((value) => {
              if (!value) new Notice("No default tags will be added");
              plugin.settings.defaultAnkiTag = value.toLowerCase();
              void plugin.saveData(plugin.settings);
            });
        });

    new Setting(containerEl).setName("Cards Identification").setHeading();

    new Setting(containerEl)
      .setName("Flashcards #tag")
      .setDesc(
        "The tag to identify the flashcards in the notes (case-insensitive)."
      )
      .addText((text) => {
        text
          .setValue(plugin.settings.flashcardsTag)
          .setPlaceholder("Card")
          .onChange((value) => {
            if (value) {
              plugin.settings.flashcardsTag = value.toLowerCase();
              void plugin.saveData(plugin.settings);
            } else {
              new Notice("The tag must be at least 1 character long");
            }
          });
      });

     new Setting(containerEl)
      .setName("Inline card separator")
      .setDesc(
        "The separator to identifty the inline cards in the notes."
      )
      .addText((text) => {
        text
          .setValue(plugin.settings.inlineSeparator)
          .setPlaceholder("::")
          .onChange((value) => {
            // if the value is empty or is the same like the inlineseparatorreverse then set it to the default, otherwise save it
            if (value.trim().length === 0 || value === plugin.settings.inlineSeparatorReverse) {
              plugin.settings.inlineSeparator = "::";
              if (value.trim().length === 0) {
                new Notice("The separator must be at least 1 character long");
              } else if (value === plugin.settings.inlineSeparatorReverse) {
                new Notice("The separator must be different from the inline reverse separator");
              }
            } else {
              plugin.settings.inlineSeparator = escapeRegExp(value.trim());
              new Notice("The separator has been changed");
            }
            void plugin.saveData(plugin.settings);
          });
      });


     new Setting(containerEl)
      .setName("Inline reverse card separator")
      .setDesc(
        "The separator to identifty the inline revese cards in the notes."
      )
      .addText((text) => {
        text
          .setValue(plugin.settings.inlineSeparatorReverse)
          .setPlaceholder(":::")
          .onChange((value) => {
            // if the value is empty or is the same like the inlineseparatorreverse then set it to the default, otherwise save it
            if (value.trim().length === 0 || value === plugin.settings.inlineSeparator) {
              plugin.settings.inlineSeparatorReverse = ":::";
              if (value.trim().length === 0) {
                new Notice("The separator must be at least 1 character long");
              } else if (value === plugin.settings.inlineSeparator) {
                new Notice("The separator must be different from the inline separator");
              }
            } else {
              plugin.settings.inlineSeparatorReverse = escapeRegExp(value.trim());
              new Notice("The separator has been changed");
            }
            void plugin.saveData(plugin.settings);
          });
      });


  }
}
