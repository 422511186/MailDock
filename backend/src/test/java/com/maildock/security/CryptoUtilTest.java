package com.maildock.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CryptoUtilTest {

    private static final String KEY = "0123456789abcdef0123456789abcdef"; // 32 bytes

    @Test
    void encryptThenDecryptReturnsOriginalPlaintext() {
        CryptoUtil crypto = new CryptoUtil(KEY);

        String plaintext = "my-163-auth-code-ABCDEF";
        String cipher = crypto.encrypt(plaintext);

        assertNotEquals(plaintext, cipher, "ciphertext must differ from plaintext");
        assertEquals(plaintext, crypto.decrypt(cipher), "decrypt must recover the original plaintext");
    }

    @Test
    void encryptSamePlaintextTwiceProducesDifferentCiphertext() {
        CryptoUtil crypto = new CryptoUtil(KEY);

        String plaintext = "same-secret";
        String c1 = crypto.encrypt(plaintext);
        String c2 = crypto.encrypt(plaintext);

        assertNotEquals(c1, c2, "random IV must make each ciphertext unique");
        assertEquals(plaintext, crypto.decrypt(c1));
        assertEquals(plaintext, crypto.decrypt(c2));
    }

    @Test
    void tamperedCiphertextFailsAuthentication() {
        CryptoUtil crypto = new CryptoUtil(KEY);

        String cipher = crypto.encrypt("secret");
        // Flip the last character to corrupt the GCM tag / data
        char[] chars = cipher.toCharArray();
        chars[chars.length - 1] = (chars[chars.length - 1] == 'A') ? 'B' : 'A';
        String tampered = new String(chars);

        assertThrows(RuntimeException.class, () -> crypto.decrypt(tampered),
                "GCM authentication must reject tampered ciphertext");
    }

    @Test
    void rejectsKeyOfWrongLength() {
        assertThrows(IllegalArgumentException.class, () -> new CryptoUtil("too-short"),
                "key must be 32 bytes for AES-256");
    }
}
