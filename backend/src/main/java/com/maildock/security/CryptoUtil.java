package com.maildock.security;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * AES-256-GCM 对称加密，用于加密敏感信息（例如 163 邮箱授权码）。
 *
 * <p>密文格式为 Base64(IV || 密文 || GCM 校验标签)。每次调用 {@link #encrypt(String)}
 * 都会生成全新的随机 IV，因此对同一明文加密两次会得到不同的密文。GCM 属于认证加密，
 * 任何对密文的篡改都会在 {@link #decrypt(String)} 时被检测出来。
 */
public final class CryptoUtil {

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int KEY_LENGTH_BYTES = 32; // AES-256，密钥需为 32 字节
    private static final int IV_LENGTH_BYTES = 12;  // GCM 推荐的 IV 长度
    private static final int TAG_LENGTH_BITS = 128; // GCM 校验标签长度

    private final SecretKeySpec keySpec;
    private final SecureRandom random = new SecureRandom();

    public CryptoUtil(String key) {
        byte[] keyBytes = key.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length != KEY_LENGTH_BYTES) {
            throw new IllegalArgumentException(
                    "密钥长度必须为 " + KEY_LENGTH_BYTES + " 字节（AES-256），实际为 " + keyBytes.length + " 字节");
        }
        this.keySpec = new SecretKeySpec(keyBytes, "AES");
    }

    public String encrypt(String plaintext) {
        try {
            // 生成随机 IV，保证相同明文每次加密结果不同
            byte[] iv = new byte[IV_LENGTH_BYTES];
            random.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, keySpec, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

            // 将 IV 与密文拼接：IV 放在最前面，解密时再取出
            byte[] combined = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(encrypted, 0, combined, iv.length, encrypted.length);

            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new RuntimeException("加密失败", e);
        }
    }

    public String decrypt(String ciphertext) {
        try {
            byte[] combined = Base64.getDecoder().decode(ciphertext);
            if (combined.length < IV_LENGTH_BYTES) {
                throw new IllegalArgumentException("密文长度过短");
            }

            // 从拼接数据中取出前置的 IV 和后续的真实密文
            byte[] iv = new byte[IV_LENGTH_BYTES];
            System.arraycopy(combined, 0, iv, 0, IV_LENGTH_BYTES);
            byte[] encrypted = new byte[combined.length - IV_LENGTH_BYTES];
            System.arraycopy(combined, IV_LENGTH_BYTES, encrypted, 0, encrypted.length);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, keySpec, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            byte[] decrypted = cipher.doFinal(encrypted);

            return new String(decrypted, StandardCharsets.UTF_8);
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("解密失败", e);
        }
    }
}
