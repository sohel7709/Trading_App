'use strict';

const crypto = require('crypto');

// Algorithm: AES-256-GCM (Authenticated Encryption with Associated Data)
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

// Ensure 32-byte key from ENCRYPTION_SECRET or secure fallback
function getEncryptionKey() {
    const secret = process.env.ENCRYPTION_SECRET 
        || process.env.JWT_ACCESS_SECRET 
        || 'zerodha_institute_secure_encryption_key_2026';
    return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Encrypt plaintext string with AES-256-GCM
 * Output format: "enc:iv_hex:auth_tag_hex:ciphertext_hex"
 */
function encrypt(plaintext) {
    if (plaintext === null || plaintext === undefined || plaintext === '') {
        return plaintext;
    }
    const str = String(plaintext);
    // Avoid double encryption
    if (str.startsWith('enc:')) {
        return str;
    }

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

    let encrypted = cipher.update(str, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt AES-256-GCM formatted ciphertext string
 * If input is not encrypted with "enc:", returns input as-is for backward compatibility.
 */
function decrypt(ciphertext) {
    if (!ciphertext || typeof ciphertext !== 'string' || !ciphertext.startsWith('enc:')) {
        return ciphertext;
    }

    try {
        const parts = ciphertext.split(':');
        if (parts.length !== 4) {
            return ciphertext;
        }

        const [, ivHex, authTagHex, encryptedHex] = parts;
        const key = getEncryptionKey();
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        console.error('[CryptoService] Decryption failed:', err.message);
        return null;
    }
}

/**
 * Check if a string is encrypted
 */
function isEncrypted(value) {
    return typeof value === 'string' && value.startsWith('enc:');
}

module.exports = {
    encrypt,
    decrypt,
    isEncrypted,
};
