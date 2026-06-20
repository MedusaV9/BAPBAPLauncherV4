import { describe, expect, it } from "vitest";
import { normalizeInstancesRootPath } from "./instances-root";

describe("normalizeInstancesRootPath", () => {
    it("maps a drive root to a launcher-owned instances folder", () => {
        expect(normalizeInstancesRootPath("E:\\", "C:\\Users\\Test\\AppData\\Roaming\\bapbap-launcher-v2\\instances"))
            .toBe("E:\\BAPBAP Launcher\\instances");
    });

    it("keeps an explicit nested folder and trims trailing separators", () => {
        expect(normalizeInstancesRootPath("D:\\Games\\BAPBAP\\instances\\", "C:\\fallback"))
            .toBe("D:\\Games\\BAPBAP\\instances");
    });

    it("falls back when the incoming value is empty", () => {
        expect(normalizeInstancesRootPath("", "C:\\Users\\Test\\AppData\\Roaming\\bapbap-launcher-v2\\instances"))
            .toBe("C:\\Users\\Test\\AppData\\Roaming\\bapbap-launcher-v2\\instances");
    });
});
