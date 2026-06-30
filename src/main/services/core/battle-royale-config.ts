import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import electron from "electron";

const { app } = electron;

const BR_DIR = "BAPBAPBATTLEROYALE";
const BR_INI = "BapCustomServer.ini";

// Hardcoded server block — the launcher only supplies the per-user identity.
const SERVER_BLOCK = [
    "[Server]",
    "Host=ark.atomi23.de",
    "Port=5055",
    "UseHttps=false",
    "UseLocalProxy=true",
    "LocalProxyPort=5055",
].join("\r\n");

const ACCOUNT_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function getBattleRoyaleConfigPath(): string {
    return path.join(app.getPath("appData"), BR_DIR, BR_INI);
}

export function generateBrAccountId(): string {
    const bytes = randomBytes(12);
    let id = "";
    for (let i = 0; i < 12; i += 1) {
        id += ACCOUNT_ID_ALPHABET[bytes[i] % ACCOUNT_ID_ALPHABET.length];
    }
    return `custom-${id}`;
}

// Adopt an account id from an INI the game already wrote, so a returning
// player keeps their existing account instead of being orphaned onto a new one.
export function readExistingAccountId(iniPath: string): string | null {
    try {
        const raw = fs.readFileSync(iniPath, "utf8");
        const match = raw.match(/^\s*AccountId\s*=\s*(.+?)\s*$/m);
        const value = match?.[1]?.trim();
        return value && value.startsWith("custom-") ? value : null;
    } catch {
        return null;
    }
}

export function buildBapCustomServerIni(accountId: string, username: string): string {
    const safeUser = username.trim() || "Player";
    return [
        SERVER_BLOCK,
        "",
        "[Identity]",
        `AccountId=${accountId}`,
        `Username=${safeUser}`,
        "AutoGuestLogin=true",
        "",
    ].join("\r\n");
}

export function writeBattleRoyaleConfig(accountId: string, username: string): void {
    const iniPath = getBattleRoyaleConfigPath();
    fs.mkdirSync(path.dirname(iniPath), { recursive: true });
    fs.writeFileSync(iniPath, buildBapCustomServerIni(accountId, username), "utf8");
}
