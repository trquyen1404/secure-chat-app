import api from './axiosConfig';
import { encryptData, decryptData, serializeSession } from './crypto';
import { getAllSessions, saveSession } from './ratchetStore';

let debounceTimer = null;
let isSyncing = false;

/**
 * Bundles and encrypts all local sessions and ratchet states.
 */
export async function bundleAndEncryptVault(masterKey) {
  console.log('[VAULT] Bundling sessions and history for sync...');
  const { getAllSessions, loadSession, getAllMessages } = await import('./ratchetStore');
  
  const rawSessions = await getAllSessions();
  
  // 1. Bundle Sessions
  const sessions = await Promise.all(rawSessions.map(async (s) => {
    try {
      const fullSession = await loadSession(s.userId, masterKey);
      if (!fullSession) return null;

      const { userId, ...state } = fullSession;
      const serializedState = await serializeSession(state);
      return { userId, ...serializedState };
    } catch (err) {
      console.warn(`[VAULT] Skipping session for ${s.userId}:`, err.message);
      return null;
    }
  }));
  
  // 2. Bundle Encrypted Messages (Historical Searchable Mirror)
  // [Scale] Pruning: Only include the most recent 500 messages in the instant-restore bundle.
  // Older messages remain on server but won't be part of the 'Omnipotent' mirror.
  const allMessages = await getAllMessages();
  const messages = allMessages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 500);
  
  console.log(`[VAULT] Bundling ${messages.length} messages (Pruned from total: ${allMessages.length})...`);

  const vaultBlob = {
    sessions: sessions.filter(s => s !== null),
    messages, 
    timestamp: Date.now(),
    version: '2.1' // Incremented version for metadata support
  };

  const encrypted = await encryptData(JSON.stringify(vaultBlob), masterKey);
  return JSON.stringify(encrypted); 
}

/**
 * Uploads the encrypted vault to the server.
 */
export async function uploadVault(masterKey) {
  if (isSyncing) {
    console.warn('[VAULT] Sync already in progress. Skipping.');
    return;
  }
  
  isSyncing = true;
  try {
    if (!masterKey) return;
    const encryptedVault = await bundleAndEncryptVault(masterKey);
    await api.post('/api/users/vault', { vaultData: encryptedVault });
    console.log('[VAULT] Upload successful.');
  } catch (error) {
    console.error('[VAULT] Upload failed:', error.message);
    throw error; 
  } finally {
    isSyncing = false;
  }
}

/**
 * Debounced version of uploadVault.
 */
export function debouncedUploadVault(masterKey, delay = 5000) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    uploadVault(masterKey).catch(() => {});
  }, delay);
}

/**
 * Downloads and restores the vault.
 * Supports onProgress(percentage) for UI progress bars.
 */
export async function downloadAndRestoreVault(masterKey, onProgress = null) {
  try {
    if (onProgress) onProgress(5); // Start progress
    console.log('[VAULT] Downloading vault...');
    const response = await api.get('/api/users/vault');
    const { vaultData } = response.data;
    
    if (onProgress) onProgress(20);

    if (!vaultData) {
      console.log('[VAULT] No vault found on server.');
      return false;
    }

    const { saveSession, bulkSaveMessages } = await import('./ratchetStore');
    const encrypted = JSON.parse(vaultData);
    const decrypted = await decryptData(encrypted.ciphertextB64, encrypted.ivB64, masterKey);
    const vaultBlob = JSON.parse(decrypted);

    if (onProgress) onProgress(40);

    // 1. Restore Sessions
    console.log(`[VAULT] Restoring ${vaultBlob.sessions?.length || 0} sessions...`);
    if (vaultBlob.sessions) {
      for (const session of vaultBlob.sessions) {
        const { userId, ...state } = session;
        if (!userId) continue;
        await saveSession(userId, state, masterKey);
      }
    }

    if (onProgress) onProgress(60);

    // 2. Restore Message History (Using Bulk Engine)
    console.log(`[VAULT] Restoring ${vaultBlob.messages?.length || 0} messages...`);
    if (vaultBlob.messages) {
      await bulkSaveMessages(vaultBlob.messages, null, (p) => {
        if (onProgress) onProgress(60 + Math.floor(p * 0.4));
      });
    }

    console.log('[VAULT] Restoration complete.');
    if (onProgress) onProgress(100);
    return true;
  } catch (error) {
    console.error('[VAULT] Restoration failed:', error);
    return false;
  }
}

