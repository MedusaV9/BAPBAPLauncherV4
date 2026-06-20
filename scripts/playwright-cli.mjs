import { spawn } from "node:child_process";

const cliArgs = process.argv.slice(2);
function quoteWindowsArg(value) {
    if (!/[ \t"&|<>^]/.test(value)) {
        return value;
    }
    return `"${value.replace(/"/g, '""')}"`;
}

const child =
    process.platform === "win32"
        ? spawn(
            "cmd.exe",
            [
                "/d",
                "/s",
                "/c",
                ["npx", "--yes", "--package", "@playwright/cli", "playwright-cli", ...cliArgs]
                    .map(quoteWindowsArg)
                    .join(" "),
            ],
            {
                cwd: process.cwd(),
                stdio: "inherit",
                shell: false,
            }
        )
        : spawn("npx", ["--yes", "--package", "@playwright/cli", "playwright-cli", ...cliArgs], {
            cwd: process.cwd(),
            stdio: "inherit",
        });

child.on("exit", code => {
    process.exit(code ?? 1);
});
