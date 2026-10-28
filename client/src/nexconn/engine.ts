import {
  NCEngine,
  ConnectionStatusHandler,
  MessageHandler,
  ConnectionStatus,
  Message,
} from '@nexconn/chat';
import {
  CLIENT_CONFIG,
  NEXCONN_CUSTOM_MESSAGE_REGISTRATIONS,
  CustomMessageType,
} from '../lib/config.js';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

type StatusListener = (state: ConnectionState, code?: number) => void;
type RawMessageListener = (messages: Message<Record<string, any>>[]) => void;

class NexconnEngineManager {
  private initialized = false;
  private connected = false;
  private currentUserId: string | null = null;
  private currentState: ConnectionState = 'disconnected';
  private statusListeners: Set<StatusListener> = new Set();
  private messageListeners: Set<RawMessageListener> = new Set();
  private broadcastChannel: BroadcastChannel | null = null;
  private isSimulation = false;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.broadcastChannel = new BroadcastChannel('nightwise_nexconn_bus');
      this.broadcastChannel.onmessage = (event) => {
        if (event.data?.type === 'SIMULATED_MESSAGE' && this.isSimulation) {
          this.notifyMessageListeners([event.data.message]);
        }
      };
    }
  }

  /**
   * Initializes NCEngine once per app lifecycle
   */
  initialize(): void {
    if (this.initialized) return;

    const appKey = CLIENT_CONFIG.NEXCONN_APP_KEY;
    if (!appKey || appKey === 'YOUR_APP_KEY') {
      console.warn('[Nexconn] No valid VITE_NEXCONN_APP_KEY found. Running in sandbox BroadcastChannel mode.');
      this.isSimulation = true;
      this.initialized = true;
      return;
    }

    try {
      console.log(`[Nexconn] Initializing NCEngine with App Key: ${appKey.slice(0, 4)}***`);
      NCEngine.initialize({ appKey });

      // Register all NightWise custom messages BEFORE connect (§6.2)
      NCEngine.registerCustomMessages(NEXCONN_CUSTOM_MESSAGE_REGISTRATIONS);

      // Add connection status listener
      NCEngine.addConnectionStatusHandler(
        'nightwise-conn-handler',
        new ConnectionStatusHandler({
          onConnectionStatusChanged: ({ status, code }) => {
            console.log('[Nexconn] Connection status changed:', status, code);
            let state: ConnectionState = 'disconnected';
            if (status === ConnectionStatus.CONNECTED) {
              state = 'connected';
              this.connected = true;
            } else if (status === ConnectionStatus.CONNECTING) {
              state = 'connecting';
            } else if (status === ConnectionStatus.KICKED_OFFLINE_BY_OTHER_CLIENT) {
              state = 'error';
              this.connected = false;
            }
            this.currentState = state;
            this.notifyStatusListeners(state, code);
          },
        })
      );

      // Add central message listener
      NCEngine.addMessageHandler(
        'nightwise-msg-handler',
        new MessageHandler({
          onMessageReceived: ({ messages }) => {
            console.log('[Nexconn] Realtime messages received:', messages);
            this.notifyMessageListeners(messages as any);
          },
        })
      );

      this.initialized = true;
    } catch (err) {
      console.warn('[Nexconn] Failed to initialize NCEngine, falling back to sandbox mode:', err);
      this.isSimulation = true;
      this.initialized = true;
    }
  }

  /**
   * Connects to chat service using server-issued access token (§6.3)
   */
  async connect(token: string, userId: string): Promise<boolean> {
    this.initialize();
    this.currentUserId = userId;

    if (this.isSimulation) {
      this.currentState = 'connected';
      this.connected = true;
      this.notifyStatusListeners('connected', 0);
      return true;
    }

    try {
      this.currentState = 'connecting';
      this.notifyStatusListeners('connecting');

      const res = await NCEngine.connect({ token });
      if (res.code === 0) {
        console.log('[Nexconn] Connected successfully. User ID:', res.data?.userId);
        this.currentState = 'connected';
        this.connected = true;
        this.notifyStatusListeners('connected', 0);
        return true;
      } else {
        console.warn('[Nexconn] Connection failed with code:', res.code, 'Falling back to sandbox mode.');
        this.isSimulation = true;
        this.currentState = 'connected';
        this.connected = true;
        this.notifyStatusListeners('connected', 0);
        return true;
      }
    } catch (err) {
      console.warn('[Nexconn] Connect error, falling back to sandbox mode:', err);
      this.isSimulation = true;
      this.currentState = 'connected';
      this.connected = true;
      this.notifyStatusListeners('connected', 0);
      return true;
    }
  }

  disconnect(): void {
    if (!this.isSimulation) {
      try {
        NCEngine.disconnect();
      } catch (e) {
        // ignore
      }
    }
    this.connected = false;
    this.currentState = 'disconnected';
    this.notifyStatusListeners('disconnected');
  }

  getCurrentUserId(): string | null {
    if (!this.isSimulation) {
      return NCEngine.getCurrentUserId() || this.currentUserId;
    }
    return this.currentUserId;
  }

  getConnectionState(): ConnectionState {
    return this.currentState;
  }

  isUsingSimulation(): boolean {
    return this.isSimulation;
  }

  onStatusChange(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    fn(this.currentState);
    return () => this.statusListeners.delete(fn);
  }

  onRawMessages(fn: RawMessageListener): () => void {
    this.messageListeners.add(fn);
    return () => this.messageListeners.delete(fn);
  }

  private notifyStatusListeners(state: ConnectionState, code?: number) {
    for (const listener of this.statusListeners) {
      try {
        listener(state, code);
      } catch (e) {
        console.error(e);
      }
    }
  }

  private notifyMessageListeners(messages: Message<Record<string, any>>[]) {
    for (const listener of this.messageListeners) {
      try {
        listener(messages);
      } catch (e) {
        console.error(e);
      }
    }
  }

  /**
   * Internal simulation dispatcher for cross-tab multi-user test windows
   */
  broadcastSimulatedMessage(msg: any) {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ type: 'SIMULATED_MESSAGE', message: msg });
    }
    // Also deliver locally
    this.notifyMessageListeners([msg]);
  }
}

export const nexconnEngine = new NexconnEngineManager();
