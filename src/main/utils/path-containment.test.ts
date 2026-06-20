import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertInside,
  assertSafeExtension,
  DOCUMENT_ALLOWED_EXTENSIONS,
  FILESRC_ALLOWED_EXTENSIONS,
  isInside,
} from "./path-containment";

describe("path-containment", () => {
  const root = path.resolve("/workspace/project");

  describe("isInside", () => {
    it("returns true for a file directly inside root", () => {
      expect(isInside(root, path.join(root, "file.txt"))).toBe(true);
    });

    it("returns true for a file in a subdirectory", () => {
      expect(isInside(root, path.join(root, "sub", "file.txt"))).toBe(true);
    });

    it("returns true for the root itself", () => {
      expect(isInside(root, root)).toBe(true);
    });

    it("returns false for a path that traverses above root", () => {
      expect(isInside(root, path.join(root, "..", "outside.txt"))).toBe(false);
    });

    it("returns false for a sibling directory", () => {
      expect(isInside(root, path.resolve("/workspace/other/file.txt"))).toBe(
        false,
      );
    });

    it("returns false for a path that is a prefix but not a child", () => {
      // e.g. /workspace/project-extra should NOT match /workspace/project
      expect(
        isInside(root, path.resolve("/workspace/project-extra/file.txt")),
      ).toBe(false);
    });
  });

  describe("assertInside", () => {
    it("returns resolved path for valid contained path", () => {
      const target = path.join(root, "data", "test.json");
      const result = assertInside(root, target);
      expect(result).toContain("data");
      expect(result).toContain("test.json");
    });

    it("throws for path traversal", () => {
      expect(() =>
        assertInside(root, path.join(root, "..", "secret.txt")),
      ).toThrow(/outside the Rebalance workspace/);
    });

    it("includes label in error message when provided", () => {
      expect(() =>
        assertInside(root, path.join(root, "..", "secret.txt"), "fileSrc"),
      ).toThrow(/fileSrc/);
    });

    it("throws for absolute path outside root", () => {
      expect(() => assertInside(root, path.resolve("/etc/passwd"))).toThrow(
        /outside the Rebalance workspace/,
      );
    });
  });

  describe("assertSafeExtension", () => {
    it("passes for allowed extension", () => {
      expect(() =>
        assertSafeExtension("image.png", FILESRC_ALLOWED_EXTENSIONS),
      ).not.toThrow();
    });

    it("passes case-insensitively", () => {
      expect(() =>
        assertSafeExtension("image.PNG", FILESRC_ALLOWED_EXTENSIONS),
      ).not.toThrow();
    });

    it("throws for disallowed extension", () => {
      expect(() =>
        assertSafeExtension("script.exe", FILESRC_ALLOWED_EXTENSIONS),
      ).toThrow(/not allowed/);
    });

    it("throws for file with no extension", () => {
      expect(() =>
        assertSafeExtension("noext", FILESRC_ALLOWED_EXTENSIONS),
      ).toThrow(/not allowed/);
    });

    it("accepts .json for document operations", () => {
      expect(() =>
        assertSafeExtension("data.json", DOCUMENT_ALLOWED_EXTENSIONS),
      ).not.toThrow();
    });

    it("rejects non-json for document operations", () => {
      expect(() =>
        assertSafeExtension("data.xml", DOCUMENT_ALLOWED_EXTENSIONS),
      ).toThrow(/not allowed/);
    });

    it("works with array input", () => {
      expect(() =>
        assertSafeExtension("image.webp", [".png", ".webp"]),
      ).not.toThrow();
    });
  });

  describe("constant sets", () => {
    it("FILESRC_ALLOWED_EXTENSIONS contains expected image types", () => {
      expect(FILESRC_ALLOWED_EXTENSIONS.has(".png")).toBe(true);
      expect(FILESRC_ALLOWED_EXTENSIONS.has(".jpg")).toBe(true);
      expect(FILESRC_ALLOWED_EXTENSIONS.has(".jpeg")).toBe(true);
      expect(FILESRC_ALLOWED_EXTENSIONS.has(".webp")).toBe(true);
      expect(FILESRC_ALLOWED_EXTENSIONS.has(".gif")).toBe(true);
      expect(FILESRC_ALLOWED_EXTENSIONS.has(".svg")).toBe(true);
      expect(FILESRC_ALLOWED_EXTENSIONS.size).toBe(6);
    });

    it("DOCUMENT_ALLOWED_EXTENSIONS contains only .json", () => {
      expect(DOCUMENT_ALLOWED_EXTENSIONS.has(".json")).toBe(true);
      expect(DOCUMENT_ALLOWED_EXTENSIONS.size).toBe(1);
    });
  });
});
