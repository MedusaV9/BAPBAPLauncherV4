export function splitWindowsArgs(input: string): string[] {
    const source = `${input ?? ""}`;
    if (!source.trim()) {
        return [];
    }

    const args: string[] = [];
    let current = "";
    let inQuotes = false;
    let tokenStarted = false;

    for (let index = 0; index < source.length; ) {
        const char = source[index];

        if ((char === " " || char === "\t") && !inQuotes) {
            if (tokenStarted) {
                args.push(current);
                current = "";
                tokenStarted = false;
            }
            index += 1;
            continue;
        }

        if (char === "\\") {
            let slashCount = 0;
            while (index < source.length && source[index] === "\\") {
                slashCount += 1;
                index += 1;
            }

            if (index < source.length && source[index] === "\"") {
                current += "\\".repeat(Math.floor(slashCount / 2));
                tokenStarted = true;
                if (slashCount % 2 === 0) {
                    inQuotes = !inQuotes;
                } else {
                    current += "\"";
                }
                index += 1;
            } else {
                current += "\\".repeat(slashCount);
                tokenStarted = true;
            }
            continue;
        }

        if (char === "\"") {
            inQuotes = !inQuotes;
            tokenStarted = true;
            index += 1;
            continue;
        }

        current += char;
        tokenStarted = true;
        index += 1;
    }

    if (tokenStarted) {
        args.push(current);
    }

    return args;
}
