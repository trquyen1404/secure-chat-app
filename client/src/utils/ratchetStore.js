/**
 * ratchetStore.js — Persistent Storage for Double Ratchet States & Skipped Keys
 */

const DB_NAME = 'secure-chat-ratchet';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';
const STORE_SKIPPED_KEYS = 'skipped_keys';

export async function initRatchetDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'userId' });
      }
      if (!db.objectStoreNames.contains(STORE_SKIPPED_KEYS)) {
        db.createObjectStore(STORE_SKIPPED_KEYS, { keyPath: ['userId', 'ratchetKey', 'n'] });
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

export async function clearRatchetDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
