import api from './axiosConfig';
import { processIncomingMessage } from './ratchetLogic';
import { saveTheirSenderKey, loadTheirSenderKey } from './senderKeyStore';
import { decryptGroupMessage } from './senderKeyLogic';
import { saveDecryptedMessage } from './ratchetStore';

let isSyncing = false;

/**
 * syncOfflineMessages
 * Fetches all undelivered messages and processes them through the E2EE pipeline.
 * CRITICAL FIX: Also handles SENDER_KEY_DISTRIBUTION messages by saving the
 * decrypted group key to the local senderKeyStore, so that group messages
 * received offline can be decrypted after the user logs back in.
 */
export async function syncOfflineMessages(masterKey, currentUser) {
  if (isSyncing) return;
  if (!masterKey || !currentUser) return;

  isSyncing = true;
  console.log('[OfflineSync] Starting background synchronization...');

  try {
    // 1. Fetch pending payloads from server (sorted by createdAt ASC by backend)
    const response = await api.get('/api/messages/pending');
    const pendingMessages = response.data;

    if (pendingMessages.length === 0) {
      console.log('[OfflineSync] No pending messages found.');
      return;
    }

    console.log(`[OfflineSync] Found ${pendingMessages.length} pending messages.`);

    // 2. Sort ALL pending messages chronologically first.
    // This is critical: a SENDER_KEY_DISTRIBUTION must be processed BEFORE the
    // GROUP_MSG that follows it, or we won't have the key to decrypt the group message.
    pendingMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // 3. Fetch all users once to get peer info for handshake adoptions
    let allUsers = [];
    try {
      const userRes = await api.get('/api/users');
      allUsers = userRes.data;
    } catch (err) {
      console.error('[OfflineSync] Failed to fetch user list for peer resolution.', err);
    }

    const processedIds = [];

    // 4. Process each message in strict chronological order
    for (const msg of pendingMessages) {
      const peerInfo = allUsers.find(u => u.id === msg.senderId) || { id: msg.senderId };

      try {
        let result = { success: false, content: null };

        if (msg.type === 'GROUP_MSG') {
          // [Offline-E2EE] Support background decryption for group messages
          const senderKey = await loadTheirSenderKey(msg.groupId, msg.senderId, masterKey);
          if (senderKey) {
            try {
              const res = await decryptGroupMessage(msg, senderKey, msg.groupId);
              if (res.plaintext) {
                await saveDecryptedMessage(msg.id, res.plaintext, masterKey);
                await saveTheirSenderKey(msg.groupId, msg.senderId, res.updatedState, masterKey);
                result = { success: true, content: res.plaintext };
              }
            } catch (grpErr) {
              console.warn(`[Offline-E2EE] Group decryption failed for msg ${msg.id}`, grpErr.message);
            }
          }
        } else {
          // 1-1 message or SENDER_KEY_DISTRIBUTION
          result = await processIncomingMessage(msg, masterKey, currentUser, peerInfo);
        }
        
        // [CRITICAL FIX] If this is a group key distribution, save the key to our local store.
        if (result.success && result.content && msg.type === 'SENDER_KEY_DISTRIBUTION') {
          try {
            const distributionData = JSON.parse(result.content);
            const { groupId, chainKeyB64, signaturePublicKeyB64 } = distributionData;
            
            if (groupId && chainKeyB64 && signaturePublicKeyB64) {
              await saveTheirSenderKey(groupId, msg.senderId, {
                chainKeyB64,
                signaturePublicKeyB64,
                index: 0
              }, masterKey);
              console.log(`[OfflineSync] ✅ Saved Sender Key from ${msg.senderId} for group ${groupId}.`);
              // Dispatch event so open ChatWindows can re-render with the new key
              window.dispatchEvent(new CustomEvent('senderkey_received', {
                detail: { groupId, senderId: msg.senderId }
              }));
            }
          } catch (jsonErr) {
            console.error(`[OfflineSync] Malformed SENDER_KEY_DISTRIBUTION payload from ${msg.senderId}`, jsonErr);
          }
        }

        if (result.success || result.content === null) {
          processedIds.push(msg.id);
        } else {
          console.warn(`[OfflineSync] Message ${msg.id} failed logic: ${result.content}`);
        }
      } catch (err) {
        console.error(`[OfflineSync] Critical Error processing message ${msg.id}:`, err);
      }
    }

    // 5. Acknowledge all processed messages back to server
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
