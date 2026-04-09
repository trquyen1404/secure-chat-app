import api from './axiosConfig';
import { processIncomingMessage } from './ratchetLogic';

let isSyncing = false;

/**
 * syncOfflineMessages
 * Fetches all undelivered messages and processes them through the E2EE pipeline.
 */
export async function syncOfflineMessages(masterKey, currentUser) {
  if (isSyncing) return;
  if (!masterKey || !currentUser) return;

  isSyncing = true;
  console.log('[OfflineSync] Starting background synchronization...');

  try {
    // 1. Fetch pending payloads from server
    // Note: Backend already sorts by createdAt ASC
    const response = await api.get('/api/messages/pending');
    const pendingMessages = response.data;

    if (pendingMessages.length === 0) {
      console.log('[OfflineSync] No pending messages found.');
      return;
    }

    console.log(`[OfflineSync] Found ${pendingMessages.length} pending messages.`);

    // 2. Group by senderId to optimize user info fetching
    const grouped = pendingMessages.reduce((acc, msg) => {
      if (!acc[msg.senderId]) acc[msg.senderId] = [];
      acc[msg.senderId].push(msg);
      return acc;
    }, {});

    const processedIds = [];

    // 3. Process each sender's queue
    for (const senderId of Object.keys(grouped)) {
      const messages = grouped[senderId];
      
      // [Fix] Strict chronological sorting to prevent Double Ratchet breakdown
      messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      
      // Fetch sender info (required for potential handshake adoption)
      let peerInfo = null;
      try {
        const userRes = await api.get('/api/users'); // For now, get all users
        // [Optimization] In a larger app, we'd fetch a specific user profile API
        peerInfo = userRes.data.find(u => u.id === senderId);
      } catch (err) {
        console.error(`[OfflineSync] Failed to fetch info for sender ${senderId}`, err);
      }

      for (const msg of messages) {
        try {
          const result = await processIncomingMessage(msg, masterKey, currentUser, peerInfo);
          console.log(`[OfflineSync] Msg ${msg.id} result: `, result);
          if (result.success || result.content === null) {
            processedIds.push(msg.id);
          } else {
            console.warn(`[OfflineSync] Message ${msg.id} failed logic: ${result.content}`);
            // Even if failed, if it's a version error, we might optionally skip it, but let's see.
          }
        } catch (err) {
          console.error(`[OfflineSync] Critical Error processing message ${msg.id}:`, err);
        }
      }
    }

    // 4. Acknowledge processed messages back to server
    if (processedIds.length > 0) {
      console.log(`[OfflineSync] Acknowledging ${processedIds.length} messages...`);
      await api.post('/api/messages/ack', { messageIds: processedIds });
    }

    console.log('[OfflineSync] Sync complete.');
  } catch (err) {
    console.error('[OfflineSync] Sync failed:', err);
  } finally {
    isSyncing = false;
  }
}
