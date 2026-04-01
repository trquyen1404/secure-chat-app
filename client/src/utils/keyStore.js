/**
 * keyStore.js — IndexedDB-based storage for non-extractable CryptoKey objects.
 *
 * Why IndexedDB instead of localStorage?
 * - CryptoKey objects (with extractable: false) cannot be serialised to a string,
 *   so localStorage is not an option.
 * - IndexedDB can store structured cloneables, which includes CryptoKey objects.
 * - A non-extractable key NEVER exists as plain text in JavaScript memory,
 *   making it immune to XSS-based key theft.
 */

const DB_NAME = 'SecureChatKeyStore';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function saveKey(keyId, cryptoKey) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(cryptoKey, keyId);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function loadKey(keyId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(keyId);
    req.onsuccess = (e) => resolve(e.target.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteKey(keyId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(keyId);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function hasKey(keyId) {
  const key = await loadKey(keyId);
  return key !== null;
}
