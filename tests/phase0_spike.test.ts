import { describe, it, expect } from 'vitest';
import { nexconnService } from '../server/src/services/nexconn.js';
import { nexconnEngine } from '../client/src/nexconn/engine.js';
import { nexconnChannels } from '../client/src/nexconn/channels.js';

describe('Phase 0 Spike: User Registration, Connection & Group Messaging', () => {
  it('issues tokens for two users via server API and exchanges a group message', async () => {
    // 1. Issue tokens for test users
    const user1TokenResp = await nexconnService.issueAccessToken('nw_test_user_1', 'Lotus-42');
    const user2TokenResp = await nexconnService.issueAccessToken('nw_test_user_2', 'Jasmine-17');

    expect(user1TokenResp.code).toBe(0);
    expect(user1TokenResp.token).toBeDefined();
    expect(user2TokenResp.code).toBe(0);
    expect(user2TokenResp.token).toBeDefined();

    // 2. Server creates a group channel
    const groupId = 'group_spike_test_1';
    const groupCreated = await nexconnService.createGroupChannel(
      groupId,
      'Spike Test Room',
      'nw_test_user_1',
      ['nw_test_user_2']
    );
    expect(groupCreated).toBe(true);

    // 3. User 1 connects on client
    const connected1 = await nexconnEngine.connect(user1TokenResp.token, 'nw_test_user_1');
    expect(connected1).toBe(true);

    // 4. Send message in group
    const sendResult = await nexconnChannels.sendTextMessage('group', groupId, 'Hello from Phase 0 spike!');
    expect(sendResult.success).toBe(true);
    expect(sendResult.messageId).toBeDefined();

    // 5. Verify message history retrieves the sent message
    const history = await nexconnChannels.fetchHistory('group', groupId);
    expect(history.length).toBeGreaterThan(0);
    expect(history[history.length - 1].content.content).toBe('Hello from Phase 0 spike!');
  });
});
