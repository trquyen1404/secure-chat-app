import { encryptData, decryptData, arrayBufferToBase64, base64ToArrayBuffer } from './crypto';

const DB_NAME = 'SecureChatKeyStore';
const DB_VERSION = 2; // Incremented for encryption support
const STORE_NAME = 'keys';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Saves a key. If masterKey is provided, it exports and encrypts the key.
 */
export async function saveKey(keyId, cryptoKey, masterKey = null) {
  const db = await openDB();
  let dataToSave = cryptoKey;

  if (masterKey && cryptoKey instanceof CryptoKey && cryptoKey.extractable) {
    try {
      const format = cryptoKey.type === 'private' ? 'pkcs8' : 'raw';
      const exported = await window.crypto.subtle.exportKey(format, cryptoKey);
      const encrypted = await encryptData(arrayBufferToBase64(exported), masterKey);
      dataToSave = { 
        isEncrypted: true, 
        encrypted, 
        keyType: cryptoKey.type, 
        algorithm: cryptoKey.algorithm,
        usages: cryptoKey.usages
      };
      console.debug(`[KeyStore] Key ${keyId} saved (ENCRYPTED)`);
    } catch (e) {
      console.warn(`[KeyStore] Failed to encrypt key ${keyId}, saving plain.`, e);
    }
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(dataToSave, keyId);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Loads a key. If masterKey is provided and data is encrypted, it decrypts and imports.
 */
export async function loadKey(keyId, masterKey = null) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(keyId);
    req.onsuccess = async (e) => {
      const result = e.target.result;
      if (!result) return resolve(null);

      if (result.isEncrypted && masterKey) {
        try {
          const decryptedB64 = await decryptData(result.encrypted.ciphertextB64, result.encrypted.ivB64, masterKey);
          const raw = base64ToArrayBuffer(decryptedB64);
          const format = result.keyType === 'private' ? 'pkcs8' : 'raw';
          const imported = await window.crypto.subtle.importKey(
            format, raw, result.algorithm, true, result.usages
          );
          resolve(imported);
        } catch (err) {
          console.error(`[KeyStore] Failed to decrypt key ${keyId}`, err);
          resolve(null);
        }
      } else {
        resolve(result);
      }
    };
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
      resolve();
    };
  });
}

export async function getAllKeys() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const reqKeys = store.getAllKeys();
    const reqData = store.getAll();
    
    tx.oncomplete = () => {
      const keys = reqKeys.result;
      const values = reqData.result;
      const result = keys.map((k, i) => ({ id: k, data: values[i] }));
      resolve(result);
    };
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function importRawKeys(keyRecords) {
  if (!keyRecords || keyRecords.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const record of keyRecords) {
      store.put(record.data, record.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function hasKey(keyId) {
  const key = await loadKey(keyId);
  return key !== null;
}

export const getKey = loadKey;
export const setKey = saveKey;
