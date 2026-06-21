import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => {
    const app = { getPath: () => os.tmpdir() };
    return { default: { app }, app };
});

import { ConfigEditorService } from "./config-editor.service";
import type { InstalledInstance } from "../../../shared/manifest";

const tempRoots: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

async function makeInstanceDir(): Promise<string> {
    const dir = path.join(os.tmpdir(), `cfg-edit-${crypto.randomBytes(6).toString("hex")}`);
    await fs.mkdir(path.join(dir, "UserData"), { recursive: true });
    await fs.mkdir(path.join(dir, "Mods", "Config"), { recursive: true });
    tempRoots.push(dir);
    return dir;
}

function makeService(instancePath: string) {
    const instance = { id: "inst-1", path: instancePath } as InstalledInstance;
    const instances = {
        getById: vi.fn().mockResolvedValue(instance),
        assertMutable: vi.fn().mockResolvedValue(undefined),
    };
    return { service: new ConfigEditorService(instances as never), instances };
}

describe("ConfigEditorService path containment", () => {
    it("writes and reads a valid file inside UserData/", async () => {
        const dir = await makeInstanceDir();
        const { service } = makeService(dir);

        await service.write("inst-1", "UserData/Settings.cfg", "key=value\n");
        const content = await service.read("inst-1", "UserData/Settings.cfg");

        expect(content.content).toBe("key=value\n");
        expect(content.extension).toBe(".cfg");
        expect(await fs.readFile(path.join(dir, "UserData", "Settings.cfg"), "utf8")).toBe("key=value\n");
    });

    it("accepts each allowed extension under Mods/Config/", async () => {
        const dir = await makeInstanceDir();
        const { service } = makeService(dir);
        for (const ext of [".cfg", ".toml", ".json", ".ini"]) {
            await expect(service.write("inst-1", `Mods/Config/a${ext}`, "x")).resolves.toBeUndefined();
        }
    });

    it("rejects parent-traversal paths", async () => {
        const dir = await makeInstanceDir();
        const { service } = makeService(dir);
        await expect(service.write("inst-1", "UserData/../../escape.cfg", "x")).rejects.toThrow(/unsafe config path/i);
        await expect(service.read("inst-1", "UserData/../secret.cfg")).rejects.toThrow(/unsafe config path/i);
    });

    it("rejects absolute paths", async () => {
        const dir = await makeInstanceDir();
        const { service } = makeService(dir);
        await expect(service.write("inst-1", "C:/Windows/system.ini", "x")).rejects.toThrow(/unsafe config path/i);
    });

    it("rejects paths outside UserData/ or Mods/Config/", async () => {
        const dir = await makeInstanceDir();
        const { service } = makeService(dir);
        await expect(service.write("inst-1", "Mods/evil.cfg", "x")).rejects.toThrow(/must be inside/i);
        await expect(service.write("inst-1", "random.cfg", "x")).rejects.toThrow(/must be inside/i);
    });

    it("rejects disallowed extensions even inside an allowed root", async () => {
        const dir = await makeInstanceDir();
        const { service } = makeService(dir);
        await expect(service.write("inst-1", "UserData/payload.exe", "x")).rejects.toThrow(/unsupported config extension/i);
        await expect(service.write("inst-1", "UserData/noext", "x")).rejects.toThrow(/unsupported config extension/i);
    });

    it("rejects content exceeding the size limit", async () => {
        const dir = await makeInstanceDir();
        const { service } = makeService(dir);
        const tooBig = "a".repeat(1_000_001);
        await expect(service.write("inst-1", "UserData/big.cfg", tooBig)).rejects.toThrow(/exceeds max size/i);
    });

    it("checks mutability before writing (assertMutable is called)", async () => {
        const dir = await makeInstanceDir();
        const { service, instances } = makeService(dir);
        await service.write("inst-1", "UserData/ok.cfg", "x");
        expect(instances.assertMutable).toHaveBeenCalledOnce();
    });

    it("list returns only allowed-extension files under the two roots, sorted", async () => {
        const dir = await makeInstanceDir();
        await fs.writeFile(path.join(dir, "UserData", "z.cfg"), "1");
        await fs.writeFile(path.join(dir, "UserData", "ignore.txt"), "1");
        await fs.writeFile(path.join(dir, "Mods", "Config", "a.json"), "1");
        const { service } = makeService(dir);

        const entries = await service.list("inst-1");
        expect(entries.map(e => e.path)).toEqual(["Mods/Config/a.json", "UserData/z.cfg"]);
        expect(entries.find(e => e.path === "UserData/z.cfg")?.section).toBe("UserData");
    });
});
