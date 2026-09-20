import type { App, TFile } from "obsidian";

export interface AppMockOptions {
  fileContent?: string;
  fileCache?: Record<string, unknown>;
  vaultName?: string;
}

/**
 * Minimal fake of the Obsidian App surface used by CardsService:
 * vault reads/writes, vault name and the metadata cache.
 * Media loading is skipped because adapter is a plain object
 * (not a FileSystemAdapter instance). */
export function createAppMock(options: AppMockOptions = {}) {
  const fileContent = options.fileContent ?? "";
  const fileCache = options.fileCache ?? {};
  const vaultName = options.vaultName ?? "Vault";
  return {
    vault: {
      getName: jest.fn((): string => vaultName),
      read: jest.fn<Promise<string>, [unknown]>(async () => fileContent),
      modify: jest.fn<Promise<void>, [unknown, string]>(async () => undefined),
      readBinary: jest.fn<Promise<ArrayBuffer>, [unknown]>(
        async () => new ArrayBuffer(0)
      ),
      adapter: {},
    },
    metadataCache: {
      getFileCache: jest.fn<Record<string, unknown>, [unknown]>(
        () => fileCache
      ),
      getFirstLinkpathDest: jest.fn<null, [unknown, unknown]>(() => null),
    },
  };
}

export type AppMock = ReturnType<typeof createAppMock>;

export function createFileMock(
  overrides: { basename?: string; path?: string; parentPath?: string } = {}
) {
  return {
    basename: overrides.basename ?? "Note",
    path: overrides.path ?? "Note.md",
    parent: { path: overrides.parentPath ?? "/" },
  };
}

export type FileMock = ReturnType<typeof createFileMock>;

export function asApp(appMock: AppMock): App {
  return appMock as unknown as App;
}

export function asFile(fileMock: FileMock): TFile {
  return fileMock as unknown as TFile;
}
