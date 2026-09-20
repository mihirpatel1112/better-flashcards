/**
 * Mock of the browser XMLHttpRequest tailored to AnkiConnect.
 *
 * The Anki service (src/services/anki.ts) talks to AnkiConnect with raw
 * XMLHttpRequest, which does not exist in the jest node environment.
 * This mock records every outgoing request and answers with a programmed
 * responder, so service methods can be tested without a running Anki.
 */

export interface AnkiConnectRequest {
  action: string;
  version: number;
  params: Record<string, unknown>;
}

export type AnkiResponder = (
  request: AnkiConnectRequest
) => Record<string, unknown>;

const requests: AnkiConnectRequest[] = [];
let responder: AnkiResponder = () => ({ result: null, error: null });
let connectionDown = false;

class MockXMLHttpRequest {
  public responseText = "";
  public method = "";
  public url = "";
  private listeners: Record<string, Array<() => void>> = {};

  public addEventListener(type: string, listener: () => void): void {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  public open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  public send(body: string): void {
    const request = JSON.parse(body) as AnkiConnectRequest;
    requests.push(request);
    if (connectionDown) {
      this.dispatch("error");
      return;
    }
    this.responseText = JSON.stringify(responder(request));
    this.dispatch("load");
  }

  private dispatch(type: string): void {
    for (const listener of this.listeners[type] ?? []) {
      listener();
    }
  }
}

/**
 * Single entry point to the mock. Import this object in tests and call
 * its methods - e.g. `AnkiConnectMock.respondWith(6)` - so it is always
 * clear which collaborator a call belongs to.
 */
export const AnkiConnectMock = {
  /** Installs the mock as global XMLHttpRequest. */
  install(): void {
    Object.assign(globalThis, { XMLHttpRequest: MockXMLHttpRequest });
  },

  /** Clears recorded requests and restores the default responder. */
  reset(): void {
    requests.length = 0;
    responder = () => ({ result: null, error: null });
    connectionDown = false;
  },

  /** Sets a custom responder for upcoming requests. */
  setResponder(next: AnkiResponder): void {
    responder = next;
  },

  /** Answers every upcoming request with the same result/error pair. */
  respondWith(result: unknown, error: unknown = null): void {
    responder = () => ({ result, error });
  },

  /** Simulates Anki being unreachable (triggers the xhr "error" event). */
  setConnectionDown(down: boolean): void {
    connectionDown = down;
  },

  /** All requests recorded since the last reset, in order. */
  get requests(): AnkiConnectRequest[] {
    return requests;
  },
};
