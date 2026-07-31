import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./workspace-secrets";

describe("workspace-secrets", () => {
  describe("encryptSecret + decryptSecret", () => {
    it("round-trips a plaintext string", () => {
      const plain = "cal_live_abc123_secret_key";
      const encrypted = encryptSecret(plain);
      expect(encrypted).not.toBe(plain);
      expect(decryptSecret(encrypted)).toBe(plain);
    });

    it("produces different ciphertexts for the same plaintext (unique IV)", () => {
      const plain = "my-secret-value";
      const a = encryptSecret(plain);
      const b = encryptSecret(plain);
      expect(a).not.toBe(b);
      // both should decrypt to the same value
      expect(decryptSecret(a)).toBe(plain);
      expect(decryptSecret(b)).toBe(plain);
    });

    it("handles empty string", () => {
      const encrypted = encryptSecret("");
      expect(decryptSecret(encrypted)).toBe("");
    });

    it("handles unicode / Vietnamese text", () => {
      const plain = "khóa bí mật 🔐 — tiếng Việt";
      const encrypted = encryptSecret(plain);
      expect(decryptSecret(encrypted)).toBe(plain);
    });

    it("handles long API keys (256+ chars)", () => {
      const plain = "cal_live_" + "x".repeat(256);
      const encrypted = encryptSecret(plain);
      expect(decryptSecret(encrypted)).toBe(plain);
    });
  });

  describe("decryptSecret error cases", () => {
    it('throws "Invalid encrypted secret" for payload < 28 bytes', () => {
      expect(() => decryptSecret("tooshort")).toThrow("Invalid encrypted secret");
    });

    it("throws on empty string", () => {
      expect(() => decryptSecret("")).toThrow("Invalid encrypted secret");
    });

    it("throws on tampered ciphertext (GCM auth)", () => {
      const encrypted = encryptSecret("test-secret");
      // Flip a byte in the middle of the base64url payload
      const chars = encrypted.split("");
      const mid = Math.floor(chars.length / 2);
      chars[mid] = chars[mid] === "A" ? "B" : "A";
      const tampered = chars.join("");
      expect(() => decryptSecret(tampered)).toThrow();
    });

    it("throws when decrypting with different key (via env)", () => {
      const plain = "test-value";
      const encrypted = encryptSecret(plain);
      // Override key for decrypt
      process.env.WORKSPACE_SECRETS_KEY = "a-different-key-0123456789abcde";
      try {
        expect(() => decryptSecret(encrypted)).toThrow();
      } finally {
        // Restore to test baseline
        process.env.WORKSPACE_SECRETS_KEY =
          "test-workspace-secrets-key-0123456789abcdef";
      }
    });
  });
});
