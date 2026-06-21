function normalizeContent(rawContent: string): string {
    return `${rawContent ?? ""}`.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function normalizeMelonPreferencesContent(rawContent: string): string {
    const lines = normalizeContent(rawContent).split("\n");
    const output: string[] = [];
    let inConsoleSection = false;
    let skipInlineConsoleTable = false;
    let inAnySection = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (skipInlineConsoleTable) {
            if (trimmed.includes("}")) {
                skipInlineConsoleTable = false;
            }
            continue;
        }

        if (/^\s*Console\s*=\s*\{.*$/i.test(trimmed)) {
            if (!trimmed.includes("}")) {
                skipInlineConsoleTable = true;
            }
            continue;
        }

        const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
            const sectionName = sectionMatch[1].trim().toLowerCase();
            if (sectionName === "console") {
                inConsoleSection = true;
                continue;
            }
            inConsoleSection = false;
            inAnySection = true;
            output.push(line);
            continue;
        }

        if (inConsoleSection) {
            continue;
        }

        if (!inAnySection && /^(Enabled|ConsoleEnabled|console_enabled)\s*=/i.test(trimmed)) {
            continue;
        }

        output.push(line);
    }

    while (output.length && output[output.length - 1].trim() === "") {
        output.pop();
    }

    if (output.length) {
        output.push("");
    }
    output.push("[Console]");
    output.push("Enabled = true");
    return `${output.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

export function normalizeLoaderConfigContent(rawContent: string): string {
    const lines = normalizeContent(rawContent).split("\n");
    const output: string[] = [];
    let activeSection = "";
    let seenConsoleSection = false;
    let pendingConsoleValue = false;

    const pushConsoleValueIfNeeded = () => {
        if (pendingConsoleValue) {
            output.push("hide_console = false");
            pendingConsoleValue = false;
        }
    };

    for (const line of lines) {
        const trimmed = line.trim();
        const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
            pushConsoleValueIfNeeded();
            const sectionName = sectionMatch[1].trim().toLowerCase();
            if (sectionName === "console") {
                if (seenConsoleSection) {
                    activeSection = "console-duplicate";
                    continue;
                }
                seenConsoleSection = true;
                activeSection = "console";
                output.push("[console]");
                pendingConsoleValue = true;
                continue;
            }
            activeSection = sectionName;
            output.push(line);
            continue;
        }

        if (!activeSection && /^hide_console\s*=/i.test(trimmed)) {
            continue;
        }

        if (activeSection === "console") {
            if (/^hide_console\s*=/i.test(trimmed)) {
                continue;
            }
            if (trimmed && !trimmed.startsWith("#")) {
                pushConsoleValueIfNeeded();
            }
            output.push(line);
            continue;
        }

        if (activeSection === "console-duplicate") {
            continue;
        }

        output.push(line);
    }

    pushConsoleValueIfNeeded();
    while (output.length && output[output.length - 1].trim() === "") {
        output.pop();
    }

    if (!seenConsoleSection) {
        if (output.length) {
            output.push("");
        }
        output.push("[console]");
        output.push("hide_console = false");
    }

    return `${output.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}
