/**
 * keyStore.js — IndexedDB storage for non-extractable CryptoKey objects.
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

export async function clearKeyStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => {
      console.log(`[KeyStore] Database ${DB_NAME} deleted successfully.`);
      resolve();
    };
    req.onerror = (e) => {
      console.error(`[KeyStore] Failed to delete database ${DB_NAME}:`, e.target.error);
      reject(e.target.error);
    };
    req.onblocked = () => {
      console.warn(`[KeyStore] Deletion of ${DB_NAME} is blocked. Close other tabs.`);
      resolve(); // Proceed anyway, or handle as needed
    };
  });
}

export async function hasKey(keyId) {
  const key = await loadKey(keyId);
  return key !== null;
}

// Aliases for consistency across components
export const getKey = loadKey;
export const setKey = saveKey;
