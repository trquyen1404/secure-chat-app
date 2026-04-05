/**
 * ratchetStore.js — Persistent Storage for Double Ratchet States & Skipped Keys
 */

const DB_NAME = 'secure-chat-ratchet';
const DB_VERSION = 2; // Incremented for message store
const STORE_SESSIONS = 'sessions';
const STORE_SKIPPED_KEYS = 'skipped_keys';
const STORE_MESSAGES = 'decrypted_messages';

export async function initRatchetDB() {
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
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSession(userId, state) {
  const db = await initRatchetDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSIONS, 'readwrite');
    const store = transaction.objectStore(STORE_SESSIONS);
    store.put({ userId, ...state });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function loadSession(userId) {
  const db = await initRatchetDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSIONS, 'readonly');
    const store = transaction.objectStore(STORE_SESSIONS);
    const request = store.get(userId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeSkippedKey(userId, ratchetKey, n, key) {
  const db = await initRatchetDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SKIPPED_KEYS, 'readwrite');
    const store = transaction.objectStore(STORE_SKIPPED_KEYS);
    store.put({ userId, ratchetKey, n, key });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getAndDeleteSkippedKey(userId, ratchetKey, n) {
  const db = await initRatchetDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SKIPPED_KEYS, 'readwrite');
    const store = transaction.objectStore(STORE_SKIPPED_KEYS);
    const request = store.get([userId, ratchetKey, n]);
    request.onsuccess = () => {
      if (request.result) {
        store.delete([userId, ratchetKey, n]);
        resolve(request.result.key);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveDecryptedMessage(id, content) {
  const db = await initRatchetDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = transaction.objectStore(STORE_MESSAGES);
    store.put({ id, content, timestamp: Date.now() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getDecryptedMessage(id) {
  const db = await initRatchetDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_MESSAGES, 'readonly');
    const store = transaction.objectStore(STORE_MESSAGES);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result?.content || null);
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
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
