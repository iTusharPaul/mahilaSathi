import {
  GroupChannel,
  OpenChannel,
  DirectChannel,
  BaseChannel,
  SendTextMessageParams,
  SendMessageParams,
  ChannelType,
} from '@nexconn/chat';
import { nexconnEngine } from './engine.js';
import { CustomMessageType } from '../lib/config.js';
import { api } from '../lib/api.js';

export type SupportedChannelType = 'group' | 'open' | 'direct';

export interface ChatMessageItem {
  id: string;
  channelType: SupportedChannelType;
  channelId: string;
  senderId: string;
  senderName?: string;
  messageType: string;
  content: any;
  sentTime: number;
}

export class NexconnChannelService {
  /**
   * Helper to instantiate the correct channel class per §6.1
   */
  private getChannelInstance(type: SupportedChannelType, targetId: string) {
    if (type === 'group') {
      return new GroupChannel(targetId);
    } else if (type === 'open') {
      return new OpenChannel(targetId);
    } else {
      return new DirectChannel(targetId);
    }
  }

  /**
   * Enters an OpenChannel (required before receiving open channel messages)
   */
  async enterOpenChannel(channelId: string): Promise<boolean> {
    if (nexconnEngine.isUsingSimulation()) {
      return true;
    }
    try {
      const channel = new OpenChannel(channelId);
      const res = await channel.enterChannel({ messageCount: 20 });
      return res.isOk;
    } catch (err) {
      console.warn('[Nexconn] enterOpenChannel error:', err);
      return false;
    }
  }

  /**
   * Leaves an OpenChannel
   */
  async leaveOpenChannel(channelId: string): Promise<boolean> {
    if (nexconnEngine.isUsingSimulation()) {
      return true;
    }
    try {
      const channel = new OpenChannel(channelId);
      const res = await channel.exitChannel();
      return res.isOk;
    } catch (err) {
      console.warn('[Nexconn] leaveOpenChannel error:', err);
      return false;
    }
  }

  /**
   * Sends a standard text message
   */
  async sendTextMessage(
    type: SupportedChannelType,
    targetId: string,
    text: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Rule R4: Backend enforcement of stranger DM restriction
    if (type === 'direct') {
      try {
        const perm = await api.checkDmPermission(targetId);
        if (!perm.allowed) {
          return { success: false, error: perm.reason || 'Stranger DMs are restricted per Rule R4' };
        }
      } catch (err: any) {
        return { success: false, error: err.message || 'Stranger DMs are restricted per Rule R4' };
      }
    }

    const senderId = nexconnEngine.getCurrentUserId() || 'unknown';

    if (nexconnEngine.isUsingSimulation()) {
      const simulatedMsg: ChatMessageItem = {
        id: `sim_msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        channelType: type,
        channelId: targetId,
        senderId,
        messageType: 'RC:TxtMsg',
        content: { content: text },
        sentTime: Date.now(),
      };
      this.saveLocalHistory(targetId, simulatedMsg);
      nexconnEngine.broadcastSimulatedMessage(simulatedMsg);
      return { success: true, messageId: simulatedMsg.id };
    }

    try {
      const channel = this.getChannelInstance(type, targetId);
      const params = new SendTextMessageParams({ text });
      const res = await channel.sendMessage(params);

      if (res.code === 0) {
        return { success: true, messageId: (res.data as any)?.messageId };
      }
      return { success: false, error: `Code ${res.code}` };
    } catch (err: any) {
      console.error('[Nexconn] sendTextMessage error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Sends a custom message registered with NCEngine (§6.2)
   */
  async sendCustomMessage<T extends Record<string, any>>(
    type: SupportedChannelType,
    targetId: string,
    messageType: CustomMessageType,
    content: T
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Rule R4: Backend enforcement of stranger DM restriction
    if (type === 'direct') {
      try {
        const perm = await api.checkDmPermission(targetId);
        if (!perm.allowed) {
          return { success: false, error: perm.reason || 'Stranger DMs are restricted per Rule R4' };
        }
      } catch (err: any) {
        return { success: false, error: err.message || 'Stranger DMs are restricted per Rule R4' };
      }
    }

    const senderId = nexconnEngine.getCurrentUserId() || 'unknown';

    if (nexconnEngine.isUsingSimulation()) {
      const simulatedMsg: ChatMessageItem = {
        id: `sim_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        channelType: type,
        channelId: targetId,
        senderId,
        messageType,
        content,
        sentTime: Date.now(),
      };
      this.saveLocalHistory(targetId, simulatedMsg);
      nexconnEngine.broadcastSimulatedMessage(simulatedMsg);
      return { success: true, messageId: simulatedMsg.id };
    }

    try {
      const channel = this.getChannelInstance(type, targetId);
      const params = new SendMessageParams<T>(content, messageType);
      const res = await channel.sendMessage(params);

      if (res.code === 0) {
        return { success: true, messageId: (res.data as any)?.messageId };
      }
      return { success: false, error: `Code ${res.code}` };
    } catch (err: any) {
      console.error('[Nexconn] sendCustomMessage error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Loads message history
   */
  async fetchHistory(
    type: SupportedChannelType,
    targetId: string,
    pageSize: number = 30
  ): Promise<ChatMessageItem[]> {
    if (nexconnEngine.isUsingSimulation()) {
      return this.getLocalHistory(targetId);
    }

    try {
      const channel = this.getChannelInstance(type, targetId);
      const query = BaseChannel.createMessagesQuery({
        channelIdentifier: channel.identifier,
        startTime: Date.now(),
        pageSize: Math.min(100, Math.max(1, pageSize)),
        isAscending: true, // chronological order
      });

      const { code, data } = await query.loadNextPage();
      if (code === 0 && data?.data) {
        return (data.data as any[]).map((m) => ({
          id: m.messageId || String(m.sentTime),
          channelType: type,
          channelId: targetId,
          senderId: m.senderUserId,
          messageType: m.messageType,
          content: m.content,
          sentTime: m.sentTime || Date.now(),
        }));
      }
      return [];
    } catch (err) {
      console.warn('[Nexconn] fetchHistory error, reading local fallback:', err);
      return this.getLocalHistory(targetId);
    }
  }

  // In-memory cache for Node/test environments + browser fallback
  private inMemoryHistory: Map<string, ChatMessageItem[]> = new Map();

  // --- Persistence helper for testing & offline multi-window simulation ---
  private getLocalHistory(channelId: string): ChatMessageItem[] {
    if (this.inMemoryHistory.has(channelId)) {
      return [...(this.inMemoryHistory.get(channelId) || [])];
    }
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(`nw_chat_${channelId}`);
        const parsed = raw ? JSON.parse(raw) : [];
        this.inMemoryHistory.set(channelId, parsed);
        return parsed;
      } catch {
        return [];
      }
    }
    return [];
  }

  private saveLocalHistory(channelId: string, msg: ChatMessageItem) {
    const current = this.getLocalHistory(channelId);
    current.push(msg);
    if (current.length > 100) current.splice(0, current.length - 100);
    this.inMemoryHistory.set(channelId, current);

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`nw_chat_${channelId}`, JSON.stringify(current));
      } catch {
        // ignore
      }
    }
  }
}

export const nexconnChannels = new NexconnChannelService();
