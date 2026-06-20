import path from "node:path";

/**
 * Allowed image extensions for fileSrc requests.
 */
export const FILESRC_ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
]);

/**
 * Allowed extensions for document operations.
 */
export const DOCUMENT_ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([
  ".json",
]);

/**
 * Normalize a resolved path for platform-consistent comparison.
 * On Windows, lowercases drive letters and normalizes backslashes.
 */
function normalizePath(resolvedPath: string): string {
  // Normalize separators to platform default
  let normalized = path.normalize(resolvedPath);

  // On Windows, lowercase the drive letter for case-insensitive comparison
  if (process.platform === "win32" && /^[A-Z]:/i.test(normalized)) {
    normalized = normalized[0].toLowerCase() + normalized.slice(1);
  }

  return normalized;
}

/**
 * Check whether `targetPath` is contained within `root`.
 * Returns true if the resolved target starts with `resolved root + path.sep`,
 * or equals the root exactly (for directory references).
 */
export function isInside(root: string, targetPath: string): boolean {
  const resolvedRoot = normalizePath(path.resolve(root));
  const resolvedTarget = normalizePath(path.resolve(targetPath));

  return (
    resolvedTarget === resolvedRoot ||
    resolvedTarget.startsWith(resolvedRoot + path.sep)
  );
}

/**
 * Assert that `targetPath` is contained within `root`.
 * Throws if the resolved target escapes the root directory.
 *
 * @param root - The root directory to contain paths within
 * @param targetPath - The path to validate
 * @param label - Optional label for the error message (e.g. "fileSrc", "document")
 * @returns The resolved and normalized target path
 */
export function assertInside(
  root: string,
  targetPath: string,
  label?: string,
): string {
  const resolvedRoot = normalizePath(path.resolve(root));
  const resolvedTarget = normalizePath(path.resolve(targetPath));

  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(resolvedRoot + path.sep)
  ) {
    const desc = label ? `${label} ` : "";
    throw new Error(
      `Refusing ${desc}outside the Rebalance workspace: ${targetPath}`,
    );
  }

  return resolvedTarget;
}

/**
 * Assert that the file extension of `targetPath` is in the allowed set.
 * Comparison is case-insensitive.
 *
 * @param targetPath - The file path to check
 * @param allowed - Set or array of allowed extensions (e.g. [".png", ".jpg"])
 */
export function assertSafeExtension(
  targetPath: string,
  allowed: ReadonlySet<string> | string[],
): void {
  const ext = path.extname(targetPath).toLowerCase();
  const allowedSet =
    allowed instanceof Set ? allowed : new Set(allowed);

  if (!ext || !allowedSet.has(ext)) {
    throw new Error(
      `File extension "${ext || "(none)"}" is not allowed. Allowed: ${[...allowedSet].join(", ")}`,
    );
  }
}
