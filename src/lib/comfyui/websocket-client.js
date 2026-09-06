/**
 * ComfyUI WebSocket Client for receiving real-time node execution and progress events.
 */
export class ComfyWebSocketClient {
  constructor(serverUrl, clientId, events = {}) {
    this.serverUrl = serverUrl;
    this.clientId = clientId;
    this.events = events;
    this.ws = null;
    this.isExplicitlyClosed = false;
  }

  connect() {
    if (typeof window === "undefined") return;

    try {
      const wsUrl = this.serverUrl.replace(/^http/, "ws");
      const endpoint = `${wsUrl.replace(/\/$/, "")}/ws?clientId=${this.clientId}`;

      this.isExplicitlyClosed = false;
      this.ws = new WebSocket(endpoint);

      this.ws.onopen = () => {
        // WebSocket connected
      };

      this.ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (e) {
            console.error("Failed to parse ComfyUI WS message:", e);
          }
        }
      };

      this.ws.onerror = (err) => {
        this.events.onError?.(err);
      };

      this.ws.onclose = () => {
        this.events.onClose?.();
      };
    } catch (e) {
      console.error("Failed to establish WebSocket connection to ComfyUI:", e);
    }
  }

  disconnect() {
    this.isExplicitlyClosed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  handleMessage(message) {
    if (!message || !message.type) return;

    switch (message.type) {
      case "status":
        if (message.data && message.data.status) {
          this.events.onStatus?.(message.data.status);
        }
        break;
      case "execution_start":
        this.events.onExecutionStart?.(message.data);
        break;
      case "executing":
        this.events.onExecuting?.(message.data);
        break;
      case "progress":
        this.events.onProgress?.(message.data);
        break;
      case "executed":
        this.events.onExecuted?.(message.data);
        break;
      case "execution_error":
        this.events.onExecutionError?.(message.data);
        break;
      default:
        break;
    }
  }
}
