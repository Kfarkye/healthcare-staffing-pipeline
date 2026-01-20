/**
 * AES-GCM Encryption Utility for Client-Side Zero-Knowledge Storage
 * 
 * Flow:
 * 1. Generate an exportable 256-bit AES-GCM key.
 * 2. Encrypt JSON data using the key and a random 12-byte IV.
 * 3. Return a package containing the IV and Ciphertext.
 * 4. User stores the ID in the DB and keeps the key in the URL hash.
 */

export interface EncryptedPackage {
    ciphertext: string; // Base64
    iv: string; // Base64
}

/**
 * Generates a random cryptographic key for AES-GCM
 */
export async function generateKey(): Promise<CryptoKey> {
    return await window.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true, // exportable
        ['encrypt', 'decrypt']
    );
}

/**
 * Exports a CryptoKey to a URL-safe Base64 string
 */
export async function exportKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey('raw', key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Imports a CryptoKey from a URL-safe Base64 string
 */
export async function importKey(keyStr: string): Promise<CryptoKey> {
    const raw = atob(keyStr.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    return await window.crypto.subtle.importKey(
        'raw',
        bytes,
        'AES-GCM',
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts a string using AES-GCM
 */
export async function encryptData(data: string, key: CryptoKey): Promise<EncryptedPackage> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(data);

    const ciphertext = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded
    );

    return {
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
        iv: btoa(String.fromCharCode(...iv))
    };
}

/**
 * Decrypts an EncryptedPackage using AES-GCM
 */
export async function decryptData(pkg: EncryptedPackage, key: CryptoKey): Promise<string> {
    const iv = new Uint8Array(atob(pkg.iv).split('').map(c => c.charCodeAt(0)));
    const ciphertext = new Uint8Array(atob(pkg.ciphertext).split('').map(c => c.charCodeAt(0)));

    const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
    );

    return new TextDecoder().decode(decrypted);
}
