/**
 * Aught2 Pickleball — Real-Time WebSocket Client
 *
 * Manages WebSocket connection to backend with:
 * - JWT authentication
 * - Exponential backoff auto-reconnection
 * - Heartbeat ping/pong (every 25s)
 * - Typed event subscription and delivery
 * - Disconnect & cleanup on logout
 */
/* eslint-disable no-console */

export interface WebSocketEvent<T = Record<string, unknown>> {
  type: string;
  data: T;
  club_id?: string | null;
  user_id?: string | null;
  timestamp: string;
}

export type WebSocketEventListener<T = Record<string, unknown>> = (
  event: WebSocketEvent<T>
) => void;

export class WebSocketClient {
  private url: string;
  private tokenProvider: () => Promise<string | null>;
  private socket: WebSocket | null = null;
  private isExplicitlyClosed = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelayMs = 1500;
  private maxReconnectDelayMs = 15000;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<string, Set<WebSocketEventListener>> = new Map();
  private onConnectListeners: Set<() => void> = new Set();
  private isConnected = false;

  constructor(
    wsUrl: string,
    tokenProvider: () => Promise<string | null>
  ) {
    this.url = wsUrl;
    this.tokenProvider = tokenProvider;
  }

  public connect(): void {
    this.isExplicitlyClosed = false;
    this.initiateConnection();
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    this.clearTimers();
    if (this.socket) {
      try {
        this.socket.close();
      } catch (err) {
        console.warn('[WS] Error closing socket:', err);
      }
      this.socket = null;
    }
    this.isConnected = false;
  }

  public getConnected(): boolean {
    return this.isConnected;
  }

  public on(eventType: string, listener: WebSocketEventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  public onConnect(listener: () => void): () => void {
    this.onConnectListeners.add(listener);
    if (this.isConnected) {
      try {
        listener();
      } catch (err) {
        console.error('[WS] Error executing onConnect listener:', err);
      }
    }
    return () => {
      this.onConnectListeners.delete(listener);
    };
  }

  public send(action: string, payload: Record<string, unknown> = {}): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ action, ...payload }));
    }
  }

  private async initiateConnection(): Promise<void> {
    if (this.isExplicitlyClosed) return;

    this.clearTimers();
    try {
      const token = await this.tokenProvider();
      if (!token) {
        console.log('[WS] No access token available. Skipping WS connection.');
        return;
      }

      const fullUrl = `${this.url}?token=${encodeURIComponent(token)}`;
      console.log('[WS] Connecting to:', this.url);

      const ws = new WebSocket(fullUrl);
      this.socket = ws;

      ws.onopen = () => {
        console.log('[WS] Connected successfully');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startPing();

        this.onConnectListeners.forEach((listener) => {
          try {
            listener();
          } catch (err) {
            console.error('[WS] onConnect callback error:', err);
          }
        });
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.action === 'pong') {
            return;
          }

          if (parsed.type) {
            this.notifyListeners(parsed.type, parsed as WebSocketEvent);
            // Also notify wildcard listeners
            this.notifyListeners('*', parsed as WebSocketEvent);
          }
        } catch (err) {
          console.warn('[WS] Failed to parse message:', event.data, err);
        }
      };

      ws.onerror = (error) => {
        // Log cleanly to console without triggering React Native LogBox warning banner
        console.log('[WS] Socket error (connection recovery handled in onclose):', (error as any)?.message || error);
      };

      ws.onclose = (event) => {
        console.log('[WS] Disconnected, code:', event.code, 'reason:', event.reason);
        this.isConnected = false;
        this.socket = null;
        this.clearTimers();

        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.log('[WS] Connection initialization issue:', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.isExplicitlyClosed) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WS] Max reconnect attempts reached. Backing off to max delay.');
    }

    const delay = Math.min(
      this.baseReconnectDelayMs * Math.pow(1.5, this.reconnectAttempts),
      this.maxReconnectDelayMs
    );
    this.reconnectAttempts++;

    console.log(`[WS] Scheduling reconnect in ${delay}ms (attempt #${this.reconnectAttempts})`);
    this.reconnectTimeoutId = setTimeout(() => {
      this.initiateConnection();
    }, delay);
  }

  private startPing(): void {
    this.clearPing();
    this.pingIntervalId = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ action: 'ping' }));
      }
    }, 25000);
  }

  private clearPing(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  private clearTimers(): void {
    this.clearPing();
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  private notifyListeners(type: string, event: WebSocketEvent): void {
    const set = this.listeners.get(type);
    if (!set) return;

    set.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error(`[WS] Error in listener for event ${type}:`, err);
      }
    });
  }
}
