import { nexconnEngine } from './engine.js';

type PresenceListener = (onlineUserIds: string[]) => void;

class NexconnPresenceManager {
  private onlineUsers: Set<string> = new Set();
  private listeners: Set<PresenceListener> = new Set();

  constructor() {
    // In simulation mode or as enhancement, sync presence across tabs
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const channel = new BroadcastChannel('nightwise_presence_bus');
      channel.onmessage = (event) => {
        if (event.data?.type === 'USER_PING' && event.data.userId) {
          this.onlineUsers.add(event.data.userId);
          this.notify();
        }
      };

      // Emit heartbeat every 30s
      setInterval(() => {
        const uid = nexconnEngine.getCurrentUserId();
        if (uid) {
          channel.postMessage({ type: 'USER_PING', userId: uid });
        }
      }, 30000);
    }
  }

  isUserOnline(userId: string): boolean {
    return this.onlineUsers.has(userId);
  }

  getOnlineCount(): number {
    return this.onlineUsers.size;
  }

  onPresenceChange(fn: PresenceListener): () => void {
    this.listeners.add(fn);
    fn(Array.from(this.onlineUsers));
    return () => this.listeners.delete(fn);
  }

  private notify() {
    const list = Array.from(this.onlineUsers);
    for (const fn of this.listeners) {
      try {
        fn(list);
      } catch (e) {
        console.error(e);
      }
    }
  }
}

export const nexconnPresence = new NexconnPresenceManager();
