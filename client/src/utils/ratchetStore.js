import { encryptData, decryptData, serializeSession, deserializeSession } from './crypto';

const DB_NAME = 'secure-chat-ratchet';
const DB_VERSION = 2;
const STORE_SESSIONS = 'sessions';
const STORE_MESSAGES = 'decrypted_messages';

let dbHandle = null;

export async function initRatchetDB() {
  if (dbHandle) return dbHandle;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'userId' });
      }
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      dbHandle = request.result;
      // [Security] Handle unexpected closure
      dbHandle.onversionchange = () => {
        dbHandle.close();
        dbHandle = null;
      };
      resolve(dbHandle);
    };
    request.onerror = () => reject(request.error);
  });
}

export function closeRatchetDB() {
  if (dbHandle) {
    dbHandle.close();
    dbHandle = null;
    console.debug('[STORE] RatchetDB connection closed.');
  }
}

/**
 * Saves a session state. Encrypts if masterKey is provided.
 */
export async function saveSession(userId, state, masterKey = null) {
  const db = await initRatchetDB();
  let dataToSave = { userId, ...state };

  if (masterKey) {
    // [Fix] Serialize CryptoKeys to JWK before JSON.stringify
    const serialized = await serializeSession(state);
    const encrypted = await encryptData(JSON.stringify(serialized), masterKey);
    dataToSave = { userId, encrypted };
    console.debug(`[STORE] Session for ${userId} saved (ENCRYPTED + SERIALIZED)`);
  } else {
    console.warn(`[STORE] Session for ${userId} saved (PLAIN TEXT - NO MASTER KEY)`);
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSIONS, 'readwrite');
    const store = transaction.objectStore(STORE_SESSIONS);
    store.put(dataToSave);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Loads a session state. Decrypts if masterKey is provided.
 */
export async function loadSession(userId, masterKey = null) {
  const db = await initRatchetDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSIONS, 'readonly');
    const store = transaction.objectStore(STORE_SESSIONS);
    const request = store.get(userId);
    request.onsuccess = async () => {
      const result = request.result;
      if (!result) return resolve(null);

      if (result.encrypted && masterKey) {
        try {
          const decrypted = await decryptData(result.encrypted.ciphertextB64, result.encrypted.ivB64, masterKey);
          const serialized = JSON.parse(decrypted);
          // [Fix] Restore CryptoKeys from JWK
          const session = await deserializeSession(serialized);
          resolve({ userId, ...session });
        } catch (e) {
          console.error(`[STORE] Failed to decrypt/deserialize session for ${userId}`, e);
          resolve(null);
        }
      } else {
        resolve(result);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves a decrypted message. Encrypts content if masterKey is provided.
 */
export async function saveDecryptedMessage(id, contentOrObj, masterKey = null) {
  const db = await initRatchetDB();
  
  // Handle both legacy (just content string) and modern (metadata object) calls
  const isObject = typeof contentOrObj === 'object' && contentOrObj !== null && !ArrayBuffer.isView(contentOrObj);
  const content = isObject ? (contentOrObj.text || contentOrObj.content) : contentOrObj;
  
  let dataToSave = { 
    id, 
    content, 
    timestamp: isObject ? (contentOrObj.timestamp || Date.now()) : Date.now(),
    senderId: isObject ? contentOrObj.senderId : null,
    recipientId: isObject ? contentOrObj.recipientId : null
  };

  if (masterKey && content) {
    const encrypted = await encryptData(content, masterKey);
    dataToSave = { ...dataToSave, encrypted, content: null };
    console.debug(`[STORE] Message ${id} saved (ENCRYPTED with Metadata)`);
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORE_MESSAGES);
    store.put(dataToSave);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Rapidly restores a collection of messages within a single transaction.
 * [Performance] Parallelizes encryption before the transaction starts to avoid blocking the DB.
 */
export async function bulkSaveMessages(messages, masterKey = null, onProgress = null) {
  if (!messages || messages.length === 0) return;
  const db = await initRatchetDB();

  // 1. Pre-process (Encrypt) in parallel outside the transaction for max efficiency
  const total = messages.length;
  const processedData = await Promise.all(messages.map(async (msg, idx) => {
    const { id, content, encrypted, ...meta } = msg;
    const finalContent = content || msg.text;
    
    let toSave = { 
      id, 
      content: finalContent, 
      timestamp: msg.timestamp || Date.now(),
      senderId: msg.senderId || null,
      recipientId: msg.recipientId || null
    };

    // If already encrypted (from vault sync), just pass it through
    if (encrypted) {
       toSave = { ...toSave, encrypted, content: null };
    } else if (masterKey && finalContent) {
       // Otherwise, encrypt now
       const encData = await encryptData(finalContent, masterKey);
       toSave = { ...toSave, encrypted: encData, content: null };
    }
    
    if (onProgress && idx % 10 === 0) onProgress(Math.floor((idx / total) * 100));
    return toSave;
  }));

  // 2. Perform Single Transaction Write
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORE_MESSAGES);
    
    for (const data of processedData) {
      store.put(data);
    }

    transaction.oncomplete = () => {
      if (onProgress) onProgress(100);
      console.log(`[STORE] Bulk write successful: ${messages.length} messages.`);
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getDecryptedMessage(id, masterKey = null) {
  const db = await initRatchetDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_MESSAGES, 'readonly');
    const store = transaction.objectStore(STORE_MESSAGES);
    const request = store.get(id);
    request.onsuccess = async () => {
      const result = request.result;
      if (!result) return resolve(null);

      if (result.encrypted && masterKey) {
        try {
          const decrypted = await decryptData(result.encrypted.ciphertextB64, result.encrypted.ivB64, masterKey);
          resolve(decrypted);
        } catch (e) {
          console.error(`[STORE] Failed to decrypt message ${id}`, e);
          resolve(null);
        }
      } else {
        resolve(result.content || null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function updateDecryptedMessageId(oldId, newId) {
  if (!oldId || !newId || oldId === newId) return;
  const db = await initRatchetDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORE_MESSAGES);
    const getReq = store.get(oldId);
    getReq.onsuccess = () => {
      if (getReq.result) {
        const data = { ...getReq.result, id: newId };
        store.put(data);
        store.delete(oldId);
      }
      resolve();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function clearRatchetDB() {
  console.log('[STORE] Initiating safe database clear (Object Stores only)...');
  const db = await initRatchetDB();
  
  return new Promise((resolve, reject) => {
    try {
      // 1. Open a readwrite transaction across all tables
      const transaction = db.transaction([STORE_SESSIONS, STORE_MESSAGES], 'readwrite');
      
      transaction.oncomplete = () => {
        console.log('[STORE] RatchetDB stores cleared successfully.');
        resolve();
      };
      
      transaction.onerror = (e) => {
        console.error('[STORE] Transaction error during clear:', e.target.error);
        reject(e.target.error);
      };

      // 2. Clear each store individually
      transaction.objectStore(STORE_SESSIONS).clear();
      transaction.objectStore(STORE_MESSAGES).clear();
      
    } catch (err) {
      console.error('[STORE] Critical failure during clearRatchetDB:', err);
      // Fallback: If transaction fails, try deleting the whole DB as a last resort
      closeRatchetDB();
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }
  });
}

export async function getAllSessions() {
  const db = await initRatchetDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSIONS, 'readonly');
    const store = transaction.objectStore(STORE_SESSIONS);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function getAllMessages() {
  const db = await initRatchetDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_MESSAGES, 'readonly');
    const store = transaction.objectStore(STORE_MESSAGES);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
