/**
 * Codex App Server WebSocket client.
 *
 * Communicates with a running Codex App Server via JSON-RPC 2.0 over WebSocket,
 * supporting turn/start, turn/steer, and event stream listening.
 */

// --- Types ---

export interface TurnInput {
  type: "text";
  text: string;
}

export interface TurnStartParams {
  threadId: string;
  input: TurnInput[];
}

export interface TurnSteerParams {
  threadId: string;
  input: TurnInput[];
  expectedTurnId: string;
}

export interface CodexEvent {
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

type EventCallback = (event: CodexEvent) => void;

// --- Client ---

export class CodexClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, {
    resolve: (result: Record<string, unknown>) => void;
    reject: (err: Error) => void;
  }>();
  private eventListeners: EventCallback[] = [];
  private reconnectUrl: string | null = null;
  private shouldReconnect = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Active thread and turn tracking */
  private _activeThreadId: string | null = null;
  private _activeTurnId: string | null = null;

  get activeThreadId(): string | null {
    return this._activeThreadId;
  }

  get activeTurnId(): string | null {
    return this._activeTurnId;
  }

  /** Connect to Codex App Server via WebSocket */
  async connect(wsUrl: string): Promise<void> {
    this.reconnectUrl = wsUrl;
    this.shouldReconnect = true;
    await this._connect(wsUrl);
  }

  private async _connect(wsUrl: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);

      ws.addEventListener("open", () => {
        process.stderr.write(`[codex-bridge] Connected to Codex App Server: ${wsUrl}\n`);
        this.ws = ws;
        resolve();
      });

      ws.addEventListener("message", (event) => {
        this.handleMessage(String(event.data));
      });

      ws.addEventListener("close", () => {
        this.ws = null;
        this._activeTurnId = null;
        process.stderr.write("[codex-bridge] WebSocket connection closed.\n");
        this.scheduleReconnect();
      });

      ws.addEventListener("error", (event) => {
        if (!this.ws) {
          reject(new Error(`WebSocket connection failed: ${wsUrl}`));
        } else {
          process.stderr.write(`[codex-bridge] WebSocket error: ${event}\n`);
        }
      });
    });
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || !this.reconnectUrl) return;
    process.stderr.write("[codex-bridge] Reconnecting in 5s...\n");
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this._connect(this.reconnectUrl!);
        // Re-initialize after reconnect
        await this.initialize();
      } catch {
        process.stderr.write("[codex-bridge] Reconnect failed.\n");
        this.scheduleReconnect();
      }
    }, 5000);
  }

  /** Disconnect and stop reconnecting */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /** Send JSON-RPC initialize handshake */
  async initialize(): Promise<Record<string, unknown>> {
    return this.request("initialize", {
      clientInfo: { name: "weixin-bridge", version: "0.1.0" },
    });
  }

  /** Start a new turn (when agent is idle) */
  async startTurn(params: TurnStartParams): Promise<{ turnId: string }> {
    const result = await this.request("turn/start", {
      threadId: params.threadId,
      input: params.input,
    });
    // turn/start may return { turn: { id: "..." } } or { turnId: "..." }
    const turn = result.turn as Record<string, unknown> | undefined;
    const turnId = (turn?.id || result.turnId || result.id || "") as string;
    if (!turnId) {
      process.stderr.write(
        `[codex-bridge] turn/start response: ${JSON.stringify(result)}\n`,
      );
    }
    this._activeThreadId = params.threadId;
    this._activeTurnId = turnId || null;
    return { turnId };
  }

  /** Steer an active turn (when agent is busy) */
  async steerTurn(params: TurnSteerParams): Promise<{ turnId: string }> {
    const result = await this.request("turn/steer", {
      threadId: params.threadId,
      input: params.input,
      expectedTurnId: params.expectedTurnId,
    });
    const turn = result.turn as Record<string, unknown> | undefined;
    const turnId = (turn?.id || result.turnId || result.id || "") as string;
    return { turnId };
  }

  /** Start a new thread */
  async createThread(): Promise<{ threadId: string }> {
    const result = await this.request("thread/start", {});
    // thread/start returns { thread: { id: "uuid", ... } }
    const thread = result.thread as Record<string, unknown> | undefined;
    const threadId = (thread?.id || result.threadId || result.id) as string;
    if (!threadId) {
      process.stderr.write(
        `[codex-bridge] thread/start response: ${JSON.stringify(result)}\n`,
      );
    }
    this._activeThreadId = threadId;
    return { threadId };
  }

  /** Register an event listener */
  onEvent(callback: EventCallback): void {
    this.eventListeners.push(callback);
  }

  /** Remove an event listener */
  offEvent(callback: EventCallback): void {
    this.eventListeners = this.eventListeners.filter((cb) => cb !== callback);
  }

  /** Check if connected */
  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // --- Internal ---

  private async request(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to Codex App Server");
    }

    const id = this.nextId++;
    const message: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(message));

      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  private handleMessage(data: string): void {
    let parsed: JsonRpcResponse | JsonRpcNotification;
    try {
      parsed = JSON.parse(data);
    } catch {
      process.stderr.write(`[codex-bridge] Invalid JSON from App Server: ${data.slice(0, 200)}\n`);
      return;
    }

    // JSON-RPC response (has id)
    if ("id" in parsed && parsed.id !== undefined) {
      const response = parsed as JsonRpcResponse;
      const pending = this.pending.get(response.id);
      if (pending) {
        this.pending.delete(response.id);
        if (response.error) {
          pending.reject(new Error(`${response.error.message} (code: ${response.error.code})`));
        } else {
          pending.resolve(response.result || {});
        }
      }
      return;
    }

    // JSON-RPC notification (no id)
    const notification = parsed as JsonRpcNotification;

    // Track turn lifecycle
    if (notification.method === "turn/started") {
      this._activeTurnId = (notification.params?.turnId as string) || null;
    } else if (notification.method === "turn/completed") {
      this._activeTurnId = null;
    }

    // Emit to listeners
    const event: CodexEvent = {
      method: notification.method,
      params: notification.params,
    };
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        process.stderr.write(`[codex-bridge] Event listener error: ${err}\n`);
      }
    }
  }
}
