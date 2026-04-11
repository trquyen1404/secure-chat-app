import { encryptData, decryptData } from './crypto';
import { serializeSenderKey, deserializeSenderKey } from './senderKeyLogic';

const DB_NAME = 'secure-chat-sender-keys';
const DB_VERSION = 1;
const STORE_MY_KEYS = 'my_keys';
const STORE_THEIR_KEYS = 'their_keys';

let dbHandle = null;

export async function initSenderKeyDB() {
  if (dbHandle) return dbHandle;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_MY_KEYS)) {
        db.createObjectStore(STORE_MY_KEYS, { keyPath: 'groupId' });
      }
      if (!db.objectStoreNames.contains(STORE_THEIR_KEYS)) {
        db.createObjectStore(STORE_THEIR_KEYS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      dbHandle = request.result;
      resolve(dbHandle);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves our own sender key for a group.
 */
export async function saveMySenderKey(groupId, state, masterKey) {
  if (!groupId) {
    console.warn('[SenderKeyStore] Attempted to saveMySenderKey without groupId');
    return;
  }
  const db = await initSenderKeyDB();
  const serialized = await serializeSenderKey(state);
  const encrypted = await encryptData(JSON.stringify(serialized), masterKey);
  const data = { groupId, encrypted };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MY_KEYS, 'readwrite');
    tx.objectStore(STORE_MY_KEYS).put(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Loads our own sender key for a group.
 */
export async function loadMySenderKey(groupId, masterKey) {
  if (!groupId) return null;
  const db = await initSenderKeyDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MY_KEYS, 'readonly');
    const req = tx.objectStore(STORE_MY_KEYS).get(groupId);
    req.onsuccess = async () => {
      if (!req.result) return resolve(null);
      try {
        const decrypted = await decryptData(req.result.encrypted.ciphertextB64, req.result.encrypted.ivB64, masterKey);
        const serialized = JSON.parse(decrypted);
        resolve(await deserializeSenderKey(serialized));
      } catch (e) {
        console.error(`[SenderKeyStore] Failed to decrypt my key for ${groupId}`, e);
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Saves a sender key received from someone else.
 */
export async function saveTheirSenderKey(groupId, senderId, state, masterKey) {
  if (!groupId || !senderId) return;
  const db = await initSenderKeyDB();
  const id = `${groupId}:${senderId}`;
  const serialized = await serializeSenderKey(state);
  const encrypted = await encryptData(JSON.stringify(serialized), masterKey);
  const data = { id, groupId, senderId, encrypted };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_THEIR_KEYS, 'readwrite');
    tx.objectStore(STORE_THEIR_KEYS).put(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Loads a sender key received from someone else.
 */
export async function loadTheirSenderKey(groupId, senderId, masterKey) {
  if (!groupId || !senderId) return null;
  const db = await initSenderKeyDB();
  const id = `${groupId}:${senderId}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_THEIR_KEYS, 'readonly');
    const req = tx.objectStore(STORE_THEIR_KEYS).get(id);
    req.onsuccess = async () => {
      if (!req.result) return resolve(null);
      try {
        const decrypted = await decryptData(req.result.encrypted.ciphertextB64, req.result.encrypted.ivB64, masterKey);
        const serialized = JSON.parse(decrypted);
        resolve(await deserializeSenderKey(serialized));
      } catch (e) {
        console.error(`[SenderKeyStore] Failed to decrypt their key for ${id}`, e);
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMySenderKey(groupId) {
  if (!groupId) return;
  const db = await initSenderKeyDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MY_KEYS, 'readwrite');
    tx.objectStore(STORE_MY_KEYS).delete(groupId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Deletes all "their" keys for a specific group (e.g. during rotation).
 */
export async function deleteGroupSenderKeys(groupId) {
  if (!groupId) return;
  const db = await initSenderKeyDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_THEIR_KEYS, 'readwrite');
    const index = tx.objectStore(STORE_THEIR_KEYS);
    const request = index.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.groupId === groupId) {
          cursor.delete();
        }
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function clearSenderKeyDB() {
  if (dbHandle) {
    dbHandle.close();
    dbHandle = null;
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
