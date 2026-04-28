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

  // 3. Bundle KeyStore OPKs (for cross-device Double Ratchet adoption)
  const { getAllKeys, importRawKeys } = await import('./keyStore');
  const allKeys = await getAllKeys();
  const opkRecords = allKeys.filter(k => k.id.startsWith('opk_priv_'));
  console.log(`[VAULT] Bundling ${opkRecords.length} OPKs...`);

  const vaultBlob = {
    sessions: sessions.filter(s => s !== null),
    messages, 
    opks: opkRecords,
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

    const encrypted = JSON.parse(vaultData);
    const decrypted = await decryptData(encrypted.ciphertextB64, encrypted.ivB64, masterKey);
    const vaultBlob = JSON.parse(decrypted);

    if (onProgress) onProgress(40);

    // 3. Restore Sessions
    const { sessions, messages, opks, timestamp } = vaultBlob;
    const { saveSession, bulkSaveMessages } = await import('./ratchetStore');
    
    console.log(`[VAULT] Restoring ${sessions?.length || 0} sessions...`);
    if (sessions && Array.isArray(sessions)) {
      for (const session of sessions) {
        const { userId, ...state } = session;
        if (!userId) continue;
        await saveSession(userId, state, masterKey);
      }
    }
    if (onProgress) onProgress(60);

    // 4. Restore OPKs to KeyStore
    if (opks && Array.isArray(opks)) {
       const { importRawKeys } = await import('./keyStore');
       await importRawKeys(opks);
       console.log(`[VAULT] Restored ${opks.length} OPK records to KeyStore.`);
    }
    if (onProgress) onProgress(80);

    // 5. Restore Messages
    if (messages && Array.isArray(messages)) {
       await bulkSaveMessages(messages, masterKey, (p) => {
           if (onProgress) onProgress(80 + Math.floor(p * 0.2));
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

