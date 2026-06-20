import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/**
 * Compute the SHA-256 hash of a file using streaming reads.
 * Returns the hex-encoded hash string.
 */
export function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

/**
 * Verify that a file matches an expected SHA-256 hash.
 * Comparison is case-insensitive (both normalized to lowercase hex).
 */
export async function verifySha256(
  filePath: string,
  expectedHash: string,
): Promise<boolean> {
  const actual = await computeFileSha256(filePath);
  return actual.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Compute the SHA-256 hash of a string synchronously.
 * Used for unlock code hashing.
 * Returns the hex-encoded hash string.
 */
export function computeStringSha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
