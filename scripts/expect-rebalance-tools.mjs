import net from "node:net";
import path from "node:path";
import process from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const appDir = path.resolve(import.meta.dirname, "..");
const outputDir = path.join(appDir, "output", "expect");

function resolveExpectCliCommand() {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA?.trim();
    if (appData) {
      const powershellShim = path.join(appData, "npm", "expect-cli.ps1");
      if (existsSync(powershellShim)) {
        return powershellShim;
      }
      const cmdShim = path.join(appData, "npm", "expect-cli.cmd");
      if (existsSync(cmdShim)) {
        return cmdShim;
      }
    }
  }
  if (process.env.EXPECT_CLI_BIN?.trim()) {
    return process.env.EXPECT_CLI_BIN.trim();
  }
  return "expect-cli";
}

async function reservePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to reserve harness port.")));
        return;
      }

      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function spawnHarnessServer(port) {
  const env = {
    ...process.env,
    VITE_HARNESS_PORT: String(port),
  };

  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", "npm run dev:harness"], {
      cwd: appDir,
      env,
      stdio: "inherit",
      shell: false,
    });
  }

  return spawn("npm", ["run", "dev:harness"], {
    cwd: appDir,
    env,
    stdio: "inherit",
    shell: false,
  });
}

async function waitForUrl(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for harness at ${url}`);
}

function runExpect(baseUrl, instruction, logName) {
  return new Promise((resolve, reject) => {
    const expectCli = resolveExpectCliCommand();
    const expectArgs = ["-m", instruction, "-y"];
    const childEnv = {
      ...process.env,
      EXPECT_BASE_URL: baseUrl,
    };
    let child;
    if (process.platform === "win32" && expectCli.toLowerCase().endsWith(".ps1")) {
      child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          expectCli,
          ...expectArgs,
        ],
        {
          cwd: appDir,
          env: childEnv,
          shell: false,
        },
      );
    } else if (process.platform === "win32" && expectCli.toLowerCase().endsWith(".cmd")) {
      const quotedArgs = expectArgs
        .map(arg => `"${String(arg).replace(/"/g, '\\"')}"`)
        .join(" ");
      child = spawn(
        "cmd.exe",
        [
          "/d",
          "/s",
          "/c",
          `""${expectCli}" ${quotedArgs}"`,
        ],
        {
          cwd: appDir,
          env: childEnv,
          shell: false,
        },
      );
    } else {
      child = spawn(
        expectCli,
        expectArgs,
        {
          cwd: appDir,
          env: childEnv,
          shell: false,
        },
      );
    }

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", chunk => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr?.on("data", chunk => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", async (error) => {
      await mkdir(outputDir, { recursive: true });
      await writeFile(
        path.join(outputDir, `${logName}.log`),
        `Failed to launch ${expectCli}\n\n${String(error?.stack || error)}`,
        "utf8",
      );
      reject(error);
    });
    child.on("close", async code => {
      await mkdir(outputDir, { recursive: true });
      await writeFile(
        path.join(outputDir, `${logName}.log`),
        `${stdout}\n\n--- STDERR ---\n${stderr}`,
        "utf8",
      );
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(new Error(`expect-cli failed for ${logName} with exit code ${code ?? "unknown"}.`));
    });
  });
}

const scenarios = [
  {
    name: "rebalance-dashboard",
    instruction:
      "Open /rebalance.html?embedded=1&initialPage=dashboard&workspaceRoot=C:/Harness/Creator%20Kit%20Tools&profileLabel=Creator%20Kit%20Tools%20%2F%20build-2025-08-19-750068&track=bapbap&instanceSource=official-managed. Try to break the embedded dashboard: verify the left rail, current profile card, main hero, primary action buttons, and task cards all render without clipped text, overlapping sections, missing buttons, or console errors. Resize through the app if possible and check that the page still scrolls and remains usable.",
  },
  {
    name: "rebalance-editor",
    instruction:
      "Open /rebalance.html?embedded=1&initialPage=editor&workspaceRoot=C:/Harness/Creator%20Kit%20Tools&profileLabel=Creator%20Kit%20Tools%20%2F%20build-2025-08-19-750068&track=bapbap&instanceSource=official-managed. Adversarially test the Change editor UI: the left rail must stay readable, the current-file block must be visible, the file list must be clickable, the main edit header must be large and readable, and the preview card must not collapse, overlap, or drift off-screen. Watch for wrong typography scale, missing images/icons, clipped buttons, horizontal overflow, and console errors.",
  },
  {
    name: "rebalance-gamemode-swap",
    instruction:
      "Open /rebalance.html?embedded=1&initialPage=gamemode&workspaceRoot=C:/Harness/Creator%20Kit%20Tools&profileLabel=Creator%20Kit%20Tools%20%2F%20build-2025-08-19-750068&track=bapbap&instanceSource=official-managed. Try to break the Game Mode and Swap flows: verify navigation to Game Mode and Swap, confirm collection cards and field lists are usable, and ensure there are no blank states, clipped controls, unreadable labels, or console errors. In Swap specifically, treat it as a failure if there is no real character file loaded, no slot list, no source list, or only empty-state copy such as 'Open one character swap file', 'No swap slots', or 'No exported sources'. If a section is visible but not editable, call that out as a failure.",
  },
];

const port = await reservePort();
const baseUrl = `http://127.0.0.1:${port}`;
const harnessUrl = `${baseUrl}/harness.html?workspace=tools`;
const server = spawnHarnessServer(port);

try {
  await mkdir(outputDir, { recursive: true });
  console.log(`[expect-tools] Waiting for harness at ${harnessUrl}`);
  await waitForUrl(harnessUrl);
  for (const scenario of scenarios) {
    console.log(`[expect-tools] Running ${scenario.name}`);
    await runExpect(baseUrl, scenario.instruction, scenario.name);
  }
} finally {
  server.kill("SIGTERM");
}
