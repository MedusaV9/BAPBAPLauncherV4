import { describe, it, expect, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { computeFileSha256, verifySha256, computeStringSha256 } from "./file-hash";

const TMP_DIR = path.join(__dirname, "__test_tmp__");

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

function writeTmpFile(name: string, content: string): string {
  ensureTmpDir();
  const filePath = path.join(TMP_DIR, name);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

afterAll(() => {
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

describe("computeFileSha256", () => {
  it("returns correct SHA-256 for known content", async () => {
    // SHA-256 of "hello\n" is well-known
    const filePath = writeTmpFile("hello.txt", "hello\n");
    const hash = await computeFileSha256(filePath);
    // echo -n "hello\n" | sha256sum → 5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03
    expect(hash).toBe("5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03");
  });

  it("returns correct SHA-256 for empty file", async () => {
    const filePath = writeTmpFile("empty.txt", "");
    const hash = await computeFileSha256(filePath);
    // SHA-256 of empty string
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("rejects for non-existent file", async () => {
    await expect(computeFileSha256(path.join(TMP_DIR, "nope.txt"))).rejects.toThrow();
  });
});

describe("verifySha256", () => {
  it("returns true when hash matches", async () => {
    const filePath = writeTmpFile("verify.txt", "test data");
    const hash = await computeFileSha256(filePath);
    expect(await verifySha256(filePath, hash)).toBe(true);
  });

  it("returns true for case-insensitive hash comparison", async () => {
    const filePath = writeTmpFile("case.txt", "test data");
    const hash = await computeFileSha256(filePath);
    expect(await verifySha256(filePath, hash.toUpperCase())).toBe(true);
  });

  it("returns false when hash does not match", async () => {
    const filePath = writeTmpFile("mismatch.txt", "some content");
    expect(await verifySha256(filePath, "0000000000000000000000000000000000000000000000000000000000000000")).toBe(false);
  });
});

describe("computeStringSha256", () => {
  it("returns correct hash for known input", () => {
    // SHA-256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(computeStringSha256("hello")).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("returns correct hash for empty string", () => {
    expect(computeStringSha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("is deterministic - same input always produces same output", () => {
    const input = "unlock-code-123";
    expect(computeStringSha256(input)).toBe(computeStringSha256(input));
  });

  it("different inputs produce different hashes", () => {
    expect(computeStringSha256("a")).not.toBe(computeStringSha256("b"));
  });
});
