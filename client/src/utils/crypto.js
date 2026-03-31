import forge from 'node-forge';

// Generate RSA Key Pair
export const generateRSAKeyPair = () => {
  return new Promise((resolve, reject) => {
    forge.pki.rsa.generateKeyPair({ bits: 2048, workers: 2 }, (err, keypair) => {
      if (err) return reject(err);
      
      const publicKey = forge.pki.publicKeyToPem(keypair.publicKey);
      const privateKey = forge.pki.privateKeyToPem(keypair.privateKey);
      
      resolve({ publicKey, privateKey });
    });
  });
};

// Generate random AES key (32 bytes for AES-256)
export const generateAESKey = () => {
  return forge.random.getBytesSync(32);
};

// Generate random IV (16 bytes) encoded as Base64 to prevent JSON corruption
export const generateIV = () => {
  return forge.util.encode64(forge.random.getBytesSync(16));
};

// Encrypt plaintext with AES-256-CBC
export const encryptMessageAES = (message, aesKey, ivBase64) => {
  const cipher = forge.cipher.createCipher('AES-CBC', aesKey);
  const iv = forge.util.decode64(ivBase64);
  cipher.start({ iv: iv });
  cipher.update(forge.util.createBuffer(forge.util.encodeUtf8(message)));
  cipher.finish();
  return forge.util.encode64(cipher.output.getBytes());
};

// Decrypt ciphertext with AES-256-CBC
export const decryptMessageAES = (encryptedBase64, aesKey, ivBase64) => {
  try {
    const decipher = forge.cipher.createDecipher('AES-CBC', aesKey);
    const iv = forge.util.decode64(ivBase64);
    decipher.start({ iv: iv });
    decipher.update(forge.util.createBuffer(forge.util.decode64(encryptedBase64)));
    const result = decipher.finish(); 
    if (!result) throw new Error('Decryption finished but failed');
    return forge.util.decodeUtf8(decipher.output.getBytes());
  } catch (err) {
    console.error("AES Decryption error:", err);
    return "[Biến dạng/Decryption Failed]";
  }
};

// Encrypt AES key using RSA Public Key
export const encryptKeyRSA = (aesKeyStr, publicKeyPem) => {
  const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
  const encrypted = publicKey.encrypt(aesKeyStr, 'RSA-OAEP', {
    md: forge.md.sha256.create(),
    mgf1: {
      md: forge.md.sha1.create()
    }
  });
  return forge.util.encode64(encrypted);
};

// Decrypt AES key using RSA Private Key
export const decryptKeyRSA = (encryptedBase64, privateKeyPem) => {
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const decoded = forge.util.decode64(encryptedBase64);
  return privateKey.decrypt(decoded, 'RSA-OAEP', {
    md: forge.md.sha256.create(),
    mgf1: {
      md: forge.md.sha1.create()
    }
  });
};
