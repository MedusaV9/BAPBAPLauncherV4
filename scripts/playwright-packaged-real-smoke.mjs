import net from "node:net";
import { execSync, spawn } from "node:child_process";
import { access, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { constants as fsConstants } from "node:fs";
import { _electron as electron, chromium } from "playwright";

const appDir = path.resolve(import.meta.dirname, "..");
const artifactDir = path.join(appDir, "output", "playwright");
const packagedExeCandidates = [
  path.join(appDir, "release", "build", "win-unpacked", "BAPBAP Launcher V2.exe"),
  path.join(appDir, "release", "build-tools", "win-unpacked", "BAPBAP Launcher V2.exe"),
];
const packagedSmokeUserDataDir = path.join(appDir, "output", ".tmp", "packaged-real-user-data");
const toolsOnly = process.argv.includes("--tools-only");
const responsiveReview = process.env.V2_REVIEW_RESPONSIVE === "1";
const launcherUserDataSeedDir = process.env.APPDATA
  ? path.join(process.env.APPDATA, "bapbap-launcher-v2")
  : null;
const launcherSettingsFileName = "bapbap-launcher-v2.json";
const launcherRadioSettingsFileName = "bapbap-launcher-v2-radio.json";
const rebalanceRequiredRelativePath = path.join("Mods", "BAPBAPBalanceMod.dll");
const toolsUnlockCode = "ItsAMobileGame";
const playwrightTempProfilePrefix = "playwright_chromiumdev_profile-";

const viewports = responsiveReview
  ? [
      { label: "wide", width: 1600, height: 1200 },
      { label: "ultrawide", width: 3440, height: 1440 },
      { label: "laptop", width: 1440, height: 960 },
      { label: "compact", width: 1280, height: 900 },
      { label: "narrow", width: 1024, height: 768 },
    ]
  : [{ label: "default", width: 1600, height: 1200 }];

async function resolvePackagedExe() {
  for (const candidate of packagedExeCandidates) {
    if (await hasFile(candidate)) {
      return candidate;
    }
  }

  const fallbackRoots = [
    path.join(appDir, "release", "build"),
    path.join(appDir, "release", "build-tools"),
  ];
  for (const root of fallbackRoots) {
    try {
      const matches = await readdir(root, { recursive: true });
      const relativeMatch = matches.find((entry) => entry === path.join("win-unpacked", "BAPBAP Launcher V2.exe"));
      if (relativeMatch) {
        return path.join(root, relativeMatch);
      }
    } catch {
      // try next root
    }
  }
  throw new Error(
    `Packaged launcher not found. Checked:\n${packagedExeCandidates.join("\n")}\nRun npm --prefix apps/bapbap-launcher run build:win first.`,
  );
}

async function cleanupPlaywrightTempProfiles() {
  const tempRoot = process.env.TEMP || process.env.TMP;
  if (!tempRoot) {
    return;
  }

  let entries = [];
  try {
    entries = await readdir(tempRoot, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(playwrightTempProfilePrefix))
      .map((entry) => rm(path.join(tempRoot, entry.name), { recursive: true, force: true }).catch(() => undefined)),
  );
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
      const { port } = address;
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function spawnHarnessServer(port) {
  const env = {
    ...process.env,
    VITE_HARNESS_PORT: `${port}`,
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

async function waitForHarness(url, timeoutMs = 60_000) {
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

async function screenshot(target, fileName) {
  const owningPage = typeof target?.page === "function" ? target.page() : target;
  if (owningPage && typeof owningPage.mouse?.move === "function") {
    await settleForScreenshot(owningPage);
  }
  await target.screenshot({
    path: path.join(artifactDir, fileName),
    timeout: 90_000,
  });
}

async function settleForScreenshot(page) {
  const viewport = page.viewportSize();
  const targetX = viewport ? Math.max(16, viewport.width - 24) : 1500;
  const targetY = viewport ? Math.max(16, viewport.height - 24) : 1100;
  await page.mouse.move(targetX, targetY, { steps: 5 });
  await page.waitForTimeout(420);
}

async function writeArtifactJson(fileName, payload) {
  await writeFile(path.join(artifactDir, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function captureRebalanceLoadingDebug(page, viewport, reason = "loading-timeout") {
  const focusPanel = page.locator('[data-testid="tools-focus-panel"]');
  await screenshot(
    focusPanel,
    `real-exe-tools-${reason}-${viewport.label}-${viewport.width}x${viewport.height}.png`,
  ).catch(() => undefined);

  const debugState = await page.evaluate(async () => {
    const shell = document.querySelector('[data-testid="rebalance-embed-shell"]');
    const overlay = document.querySelector('[data-testid="rebalance-embed-overlay"]');
    const progress = document.querySelector('[data-testid="rebalance-embed-progress"]');
    const statusStrip = document.querySelector('[data-testid="rebalance-embed-status-strip"]');
    const embedHost = document.querySelector('[data-testid="rebalance-embed-shell"]');
    const embeddedRoot = document.querySelector('[data-testid="rebalance-embedded-root"]');
    const embeddedDrawer = document.querySelector('[data-testid="rebalance-embedded-rail"]');
    const embeddedTopbar = document.querySelector('[data-testid="rebalance-embedded-workspace-topbar"]');
    const embeddedToolStrip = document.querySelector(".rebalance-workspace-tool-strip");
    const embeddedLoadingShell = document.querySelector(".rebalance-embedded-loading-shell");
    const embeddedLoadingInline = document.querySelector(".rebalance-embedded-loading-inline");
    const rebalanceCard = document.querySelector('[data-testid="tools-card-rebalance-studio"]');
    const focusPanel = document.querySelector('[data-testid="tools-focus-panel"]');

    return {
      toolCardState: rebalanceCard?.getAttribute("data-tool-state") ?? null,
      focusPanelText: focusPanel?.textContent?.trim() ?? "",
      embedState: shell?.getAttribute("data-embed-state") ?? null,
      shellClassName: shell instanceof HTMLElement ? shell.className : null,
      overlayHidden: overlay?.getAttribute("aria-hidden") ?? null,
      progressPhase: progress?.getAttribute("data-phase") ?? null,
      bridgeReady: progress?.getAttribute("data-bridge-ready") ?? null,
      frameLoaded: progress?.getAttribute("data-frame-loaded") ?? null,
      progressNow: progress?.getAttribute("aria-valuenow") ?? null,
      statusStripText: statusStrip?.textContent?.trim() ?? "",
      embedHostClassName: embedHost instanceof HTMLElement ? embedHost.className : null,
      embedHostText: embedHost?.textContent?.trim().slice(0, 1200) ?? "",
      embedHostHtml: embedHost?.innerHTML?.slice(0, 4000) ?? "",
      embeddedRootExists: Boolean(embeddedRoot),
      embeddedRootPage: embeddedRoot?.getAttribute("data-page") ?? null,
      embeddedDrawerExists: Boolean(embeddedDrawer),
      embeddedTopbarExists: Boolean(embeddedTopbar),
      embeddedToolStripExists: Boolean(embeddedToolStrip),
      embeddedToolLabels: Array.from(document.querySelectorAll('[data-testid^="rebalance-embedded-workspace-tool-"]')).map((node) =>
        node.textContent?.trim() ?? "",
      ),
      embeddedLoadingShellText: embeddedLoadingShell?.textContent?.trim().slice(0, 1200) ?? "",
      embeddedLoadingInlineText: embeddedLoadingInline?.textContent?.trim().slice(0, 1200) ?? "",
    };
  }).catch(error => ({
    evaluationError: error instanceof Error ? error.message : String(error),
  }));

  await writeArtifactJson(
    `real-exe-tools-${reason}-${viewport.label}-${viewport.width}x${viewport.height}.json`,
    debugState,
  ).catch(() => undefined);
}

async function captureToolsGalleryDebug(page, viewport, reason = "gallery-timeout") {
  await screenshot(
    page.locator('[data-testid="tools-workspace"]'),
    `real-exe-tools-${reason}-${viewport.label}-${viewport.width}x${viewport.height}.png`,
  ).catch(() => undefined);

  const debugState = await page.evaluate(() => {
    const profileSelect = document.querySelector('[data-testid="tools-hero-card"] select');
    const toolCards = Array.from(document.querySelectorAll('[data-testid^="tools-card-"]')).map((node) => ({
      testId: node.getAttribute("data-testid"),
      state: node.getAttribute("data-tool-state"),
      text: node.textContent?.trim().slice(0, 300) ?? "",
      disabled: node instanceof HTMLButtonElement ? node.disabled : null,
    }));

    return {
      selectedProfileValue: profileSelect instanceof HTMLSelectElement ? profileSelect.value : null,
      selectedProfileLabel:
        profileSelect instanceof HTMLSelectElement
          ? profileSelect.options[profileSelect.selectedIndex]?.label ?? null
          : null,
      profileOptions:
        profileSelect instanceof HTMLSelectElement
          ? Array.from(profileSelect.options).map((option) => ({
              value: option.value,
              label: option.label,
              disabled: option.disabled,
            }))
          : [],
      toolCards,
      workspaceText: document.querySelector('[data-testid="tools-workspace"]')?.textContent?.trim().slice(0, 1600) ?? "",
    };
  }).catch((error) => ({
    evaluationError: error instanceof Error ? error.message : String(error),
  }));

  await writeArtifactJson(
    `real-exe-tools-${reason}-${viewport.label}-${viewport.width}x${viewport.height}.json`,
    debugState,
  ).catch(() => undefined);
}

async function prewarmRebalanceRoute(harnessBaseUrl) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const rebalanceUrl = new URL("/rebalance.html", harnessBaseUrl);
    rebalanceUrl.searchParams.set("embedded", "1");
    rebalanceUrl.searchParams.set("initialPage", "dashboard");
    rebalanceUrl.searchParams.set("workspaceRoot", "C:/Harness/Creator Kit Tools");
    rebalanceUrl.searchParams.set("profileLabel", "Creator Kit Tools / build-2025-08-19-750068");
    rebalanceUrl.searchParams.set("track", "bapbap");
    rebalanceUrl.searchParams.set("instanceSource", "official-managed");
    await page.goto(rebalanceUrl.toString(), {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await page.waitForTimeout(800);
  } finally {
    await browser.close();
  }
}

async function withPackagedPage(packagedExe, pageUrl, viewport, callback) {
  const electronApp = await electron.launch({
    executablePath: packagedExe,
    cwd: path.dirname(packagedExe),
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: pageUrl,
      V2_ALLOW_REMOTE_RENDERER: "1",
      V2_DISABLE_DEVTOOLS: "1",
      V2_USER_DATA_DIR: packagedSmokeUserDataDir,
    },
    timeout: 90_000,
  });

  try {
    const page = await resolveElectronAppWindow(electronApp);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await callback(page);
  } finally {
    await electronApp.close();
  }
}

async function withLocalPackagedPage(packagedExe, viewport, callback) {
  const electronApp = await electron.launch({
    executablePath: packagedExe,
    cwd: path.dirname(packagedExe),
    env: {
      ...process.env,
      V2_ALLOW_MULTI_INSTANCE_FOR_TESTS: "1",
      V2_DISABLE_DEVTOOLS: "1",
      V2_USER_DATA_DIR: packagedSmokeUserDataDir,
    },
    timeout: 90_000,
  });

  try {
    const page = await resolveElectronAppWindow(electronApp);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await callback(page);
  } finally {
    await electronApp.close();
  }
}

async function resolveElectronAppWindow(electronApp, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const windows = electronApp.windows();
    for (const candidate of windows) {
      try {
        await candidate.waitForLoadState("domcontentloaded", { timeout: 2_000 }).catch(() => undefined);
        if (await candidate.locator("#v2-root").count()) {
          return candidate;
        }
      } catch {
        // window might have closed while probing; keep looking
      }
    }

    try {
      await electronApp.waitForEvent("window", { timeout: 1_500 });
    } catch {
      // no new window yet; keep polling until timeout
    }
  }

  throw new Error("Could not resolve the packaged launcher main window.");
}

async function hasFile(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function countFilesRecursive(rootPath) {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      const nextPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
        total += await countFilesRecursive(nextPath);
      } else if (entry.isFile()) {
        total += 1;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function resolveUsableInstancesRoot(candidateRoots) {
  for (const candidateRoot of candidateRoots) {
    if (!candidateRoot) {
      continue;
    }
    try {
      const entries = await readdir(candidateRoot, { withFileTypes: true });
      if (entries.some(entry => entry.isDirectory())) {
        return candidateRoot;
      }
    } catch {
      // try next
    }
  }
  return null;
}

async function resolvePreferredToolsInstance(instancesRoot) {
  try {
    const entries = await readdir(instancesRoot, { withFileTypes: true });
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const instancePath = path.join(instancesRoot, entry.name);
      const metadata = await readJsonIfExists(path.join(instancePath, ".bapbap-instance.json"));
      const runtimeCount = await countFilesRecursive(path.join(instancePath, "UserData", "BalanceMod", "Runtime"));
      const hasDll = await hasFile(path.join(instancePath, rebalanceRequiredRelativePath));

      candidates.push({
        id: metadata?.id ?? entry.name,
        profileName: metadata?.profileName ?? metadata?.name ?? entry.name,
        gameVersion: metadata?.gameVersion ?? metadata?.version ?? "",
        track: metadata?.track ?? metadata?.officialTrack ?? "",
        officialManaged: Boolean(metadata?.officialManaged),
        instancePath,
        runtimeCount,
        hasDll,
      });
    }

    return (
      candidates
        .filter(candidate => candidate.hasDll)
        .sort((left, right) => {
          const leftScore =
            (left.officialManaged ? 1000 : 0) +
            (left.track === "bapbap" ? 200 : 0) +
            (/^standard$/i.test(left.profileName) ? 50 : 0) +
            left.runtimeCount;
          const rightScore =
            (right.officialManaged ? 1000 : 0) +
            (right.track === "bapbap" ? 200 : 0) +
            (/^standard$/i.test(right.profileName) ? 50 : 0) +
            right.runtimeCount;
          return rightScore - leftScore;
        })[0] ?? null
    );
  } catch {
    return null;
  }
}

async function normalizePackagedLauncherSettings() {
  const copiedInstancesRoot = path.join(packagedSmokeUserDataDir, "instances");
  const settingsPath = path.join(packagedSmokeUserDataDir, launcherSettingsFileName);
  const currentSettings = (await readJsonIfExists(settingsPath)) ?? {};
  const fallbackInstancesRoot = launcherUserDataSeedDir ? path.join(launcherUserDataSeedDir, "instances") : null;
  const usableInstancesRoot = await resolveUsableInstancesRoot([
    copiedInstancesRoot,
    typeof currentSettings?.instancesRoot === "string" ? currentSettings.instancesRoot : null,
    fallbackInstancesRoot,
  ]);
  const preferredInstance = usableInstancesRoot ? await resolvePreferredToolsInstance(usableInstancesRoot) : null;

  const normalizedSettings = {
    ...currentSettings,
    instancesRoot: usableInstancesRoot ?? copiedInstancesRoot,
    setupVersionCompleted: Math.max(Number(currentSettings?.setupVersionCompleted) || 0, 3),
    uiOnboardingCompleted: true,
    toolsUnlocked: true,
  };

  if (preferredInstance?.id) {
    normalizedSettings.launchDefaultProfileId = preferredInstance.id;
  }

  await writeFile(settingsPath, `${JSON.stringify(normalizedSettings, null, 2)}\n`, "utf8");
  return preferredInstance;
}

function normalizeActiveToolId(testId) {
  return testId
    ?.replace("rebalance-embedded-workspace-tool-", "")
    ?.replace("rebalance-embedded-nav-", "")
    ?.replace("rebalance-embedded-secondary-nav-", "")
    ?.replace("rebalance-embedded-utility-nav-", "") ?? "";
}

async function expectEmbeddedVisualAudit(frame, viewport, pageSelector, label, options = {}) {
  const maxChromeDepth = options.maxChromeDepth ?? 5;
  const audit = await frame.evaluate((selector) => {
    const pageRoot = document.querySelector(selector);
    const scope = document.querySelector('[data-testid="rebalance-embedded-root"]') ?? document.body;
    const root = pageRoot ?? scope;
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity || "1") > 0.02
      );
    };
    const visible = Array.from(scope.querySelectorAll("*")).filter(isVisible);
    const greenish = [];
    for (const element of visible) {
      const style = getComputedStyle(element);
      for (const property of ["color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"]) {
        const value = style[property];
        const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(value || "");
        if (!match) continue;
        const red = Number(match[1]);
        const green = Number(match[2]);
        const blue = Number(match[3]);
        const alpha = match[4] == null ? 1 : Number(match[4]);
        if (alpha < 0.16) continue;
        const isActuallyGreen = green > 115 && green > red + 28 && green > blue + 20;
        const isGreenTeal = green > 125 && blue > 75 && blue < 190 && green > red + 28 && green >= blue;
        if (isActuallyGreen || isGreenTeal) {
          greenish.push({
            className: Array.from(element.classList).slice(0, 4).join(" "),
            text: element.textContent?.trim().slice(0, 70) ?? "",
            property,
            value,
          });
        }
      }
    }

    const internalScrollables = Array.from(root.querySelectorAll("*")).filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (!isVisible(node)) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 42) return false;
      const style = getComputedStyle(node);
      const hasY = node.scrollHeight > node.clientHeight + 8 && /(auto|scroll)/.test(style.overflowY);
      const hasX = node.scrollWidth > node.clientWidth + 8 && /(auto|scroll)/.test(style.overflowX);
      return hasX || hasY;
    }).map((node) => ({
      className: Array.from(node.classList).slice(0, 4).join(" "),
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
    }));

    const buttons = Array.from(scope.querySelectorAll("button")).filter(isVisible);
    const overlaps = [];
    for (let index = 0; index < buttons.length; index += 1) {
      const leftButton = buttons[index];
      const leftRect = leftButton.getBoundingClientRect();
      for (let nextIndex = index + 1; nextIndex < buttons.length; nextIndex += 1) {
        const rightButton = buttons[nextIndex];
        const rightRect = rightButton.getBoundingClientRect();
        const width = Math.max(0, Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left));
        const height = Math.max(0, Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top));
        const area = width * height;
        if (area > 40) {
          overlaps.push({
            left: leftButton.textContent?.trim().slice(0, 60) || leftButton.getAttribute("data-testid") || "",
            right: rightButton.textContent?.trim().slice(0, 60) || rightButton.getAttribute("data-testid") || "",
            area: Math.round(area),
          });
        }
      }
    }

    const alphaFromCssColor = (value) => {
      if (!value || value === "transparent") return 0;
      const rgba = value.match(/rgba?\(([^)]+)\)/i);
      if (!rgba) return 1;
      const parts = rgba[1].split(",").map((part) => Number.parseFloat(part.trim()));
      return parts.length >= 4 ? parts[3] : 1;
    };
    const isChromeSurface = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 24) return false;
      const style = getComputedStyle(element);
      const borderVisible = ["Top", "Right", "Bottom", "Left"].some((side) => {
        const width = Number.parseFloat(style[`border${side}Width`] || "0");
        const alpha = alphaFromCssColor(style[`border${side}Color`]);
        return width > 0 && alpha > 0.08;
      });
      const backgroundVisible = alphaFromCssColor(style.backgroundColor) > 0.16 || style.backgroundImage !== "none";
      const shadowVisible = style.boxShadow !== "none";
      return borderVisible || backgroundVisible || shadowVisible;
    };
    const deepestChromeDepth = Array.from(root.querySelectorAll("*")).reduce((maxDepth, node) => {
      let depth = 0;
      let cursor = node;
      while (cursor instanceof HTMLElement && cursor !== root && cursor !== document.body) {
        if (isChromeSurface(cursor)) depth += 1;
        cursor = cursor.parentElement;
      }
      return Math.max(maxDepth, depth);
    }, 0);
    const rectFor = (node) => {
      if (!(node instanceof HTMLElement)) {
        return null;
      }
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0
        ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
        : null;
    };
    const intersects = (leftRect, rightRect) =>
      Boolean(
        leftRect &&
        rightRect &&
        leftRect.left < rightRect.right &&
        leftRect.right > rightRect.left &&
        leftRect.top < rightRect.bottom &&
        leftRect.bottom > rightRect.top,
      );
    const hostBackRect = rectFor(document.querySelector(".tools-back-button--compact"));
    const hostBackOverlapsTopbarControl = Boolean(
      hostBackRect &&
      Array.from(document.querySelectorAll([
        ".rebalance-workspace-topbar-toggle",
        ".rebalance-workspace-topbar-meta",
        ".rebalance-workspace-global-search-slot",
        ".rebalance-workspace-topbar-actions",
      ].join(","))).some((node) => intersects(hostBackRect, rectFor(node))),
    );

    return {
      hasPageRoot: Boolean(pageRoot),
      documentX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 4,
      topbarToolsVisible: Array.from(document.querySelectorAll('[data-testid^="rebalance-embedded-workspace-tool-"]')).some((node) => {
        if (!(node instanceof HTMLElement)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(node).display !== "none";
      }),
      greenish,
      internalScrollables,
      overlaps,
      deepestChromeDepth,
      hostBackOverlapsTopbarControl,
    };
  }, pageSelector);

  if (
    !audit.hasPageRoot ||
    audit.documentX ||
    audit.topbarToolsVisible ||
    audit.greenish.length > 0 ||
    audit.internalScrollables.length > 0 ||
    audit.overlaps.length > 0 ||
    audit.deepestChromeDepth > maxChromeDepth ||
    audit.hostBackOverlapsTopbarControl
  ) {
    throw new Error(`Embedded ${label} visual audit failed for ${viewport.label}: ${JSON.stringify(audit)}`);
  }

  await writeFile(
    path.join(artifactDir, `real-exe-tools-${label}-visual-audit-${viewport.label}-${viewport.width}x${viewport.height}.json`),
    `${JSON.stringify(audit, null, 2)}\n`,
    "utf8",
  );
}

async function assertEmbeddedResizeStable(page, frame, label, pageSelector, expectedPageKey) {
  if (!responsiveReview) {
    return;
  }

  const originalViewport = page.viewportSize() ?? { width: 1600, height: 1200 };
  const resizeViewports = [
    { label: "resize-compact", width: 1280, height: 900 },
    { label: "resize-narrow", width: 1024, height: 768 },
    { label: "resize-wide", width: 1600, height: 1200 },
  ];
  const states = [];

  for (const resizeViewport of resizeViewports) {
    await page.setViewportSize({ width: resizeViewport.width, height: resizeViewport.height });
    await frame.waitForTimeout(160);
    await frame.waitForFunction(
      ({ selector, pageKey }) => {
        const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
        const pageRoot = document.querySelector(selector);
        return Boolean(
          root instanceof HTMLElement &&
          root.dataset.page === pageKey &&
          pageRoot instanceof HTMLElement &&
          pageRoot.getBoundingClientRect().width > 0,
        );
      },
      { selector: pageSelector, pageKey: expectedPageKey },
      { timeout: 15_000 },
    );

    const state = await frame.evaluate(({ selector, pageKey, viewportLabel }) => {
      const scope = document.querySelector('[data-testid="rebalance-embedded-root"]') ?? document.body;
      const pageRoot = document.querySelector(selector);
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number.parseFloat(style.opacity || "1") > 0.02
        );
      };
      const buttons = Array.from(scope.querySelectorAll("button")).filter(isVisible);
      const overlaps = [];
      for (let index = 0; index < buttons.length; index += 1) {
        const left = buttons[index];
        const leftRect = left.getBoundingClientRect();
        for (let nextIndex = index + 1; nextIndex < buttons.length; nextIndex += 1) {
          const right = buttons[nextIndex];
          const rightRect = right.getBoundingClientRect();
          const width = Math.max(0, Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left));
          const height = Math.max(0, Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top));
          const area = width * height;
          if (area > 40) {
            overlaps.push({
              left: left.textContent?.trim().slice(0, 60) || left.getAttribute("data-testid") || "",
              right: right.textContent?.trim().slice(0, 60) || right.getAttribute("data-testid") || "",
              area: Math.round(area),
            });
          }
        }
      }
      const activePage = document.querySelector('[data-testid="rebalance-embedded-root"]')?.dataset.page ?? "";
      const topbar = document.querySelector('[data-testid="rebalance-embedded-workspace-topbar"]');
      const pageRect = pageRoot instanceof HTMLElement ? pageRoot.getBoundingClientRect() : null;
      const topbarRect = topbar instanceof HTMLElement ? topbar.getBoundingClientRect() : null;
      const hostBackButton = document.querySelector(".tools-back-button--compact");
      const profileMeta = document.querySelector(".rebalance-workspace-topbar-meta");
      const topbarToggle = document.querySelector(".rebalance-workspace-topbar-toggle");
      const hostBackRect = hostBackButton instanceof HTMLElement ? hostBackButton.getBoundingClientRect() : null;
      const profileRect = profileMeta instanceof HTMLElement ? profileMeta.getBoundingClientRect() : null;
      const toggleRect = topbarToggle instanceof HTMLElement ? topbarToggle.getBoundingClientRect() : null;
      const overlapsRect = (leftRect, rightRect) =>
        Boolean(
          leftRect &&
          rightRect &&
          leftRect.width > 0 &&
          rightRect.width > 0 &&
          leftRect.left < rightRect.right &&
          leftRect.right > rightRect.left &&
          leftRect.top < rightRect.bottom &&
          leftRect.bottom > rightRect.top,
        );
      const hostBackOverlapsProfile = Boolean(
        overlapsRect(hostBackRect, profileRect),
      );
      const hostBackOverlapsToggle = Boolean(
        overlapsRect(hostBackRect, toggleRect),
      );
      return {
        viewportLabel,
        activePage,
        expectedPageKey: pageKey,
        hasPageRoot: pageRoot instanceof HTMLElement,
        documentX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 4,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        pageWidth: pageRect?.width ?? 0,
        topbarWidth: topbarRect?.width ?? 0,
        overlaps,
        hostBackOverlapsProfile,
        hostBackOverlapsToggle,
      };
    }, { selector: pageSelector, pageKey: expectedPageKey, viewportLabel: resizeViewport.label });

    states.push(state);
  }

  await page.setViewportSize({ width: originalViewport.width, height: originalViewport.height });
  await frame.waitForTimeout(120);

  const failed = states.find((state) =>
    !state.hasPageRoot ||
    state.activePage !== state.expectedPageKey ||
    state.documentX ||
    state.pageWidth < Math.min(720, state.viewportWidth * 0.7) ||
    state.topbarWidth < Math.min(700, state.viewportWidth * 0.68) ||
    state.overlaps.length > 0 ||
    state.hostBackOverlapsProfile ||
    state.hostBackOverlapsToggle
  );
  if (failed) {
    throw new Error(`Embedded ${label} resize audit failed: ${JSON.stringify(states)}`);
  }

  await writeFile(
    path.join(artifactDir, `real-exe-tools-${label}-resize-audit.json`),
    `${JSON.stringify(states, null, 2)}\n`,
    "utf8",
  );
}

async function readActiveEmbeddedToolKeys(frame) {
  return await frame.evaluate(() =>
    Array.from(document.querySelectorAll("[data-page-active='true'][data-testid]"))
      .map((node) =>
        node
          .getAttribute("data-testid")
          ?.replace("rebalance-embedded-workspace-tool-", "")
          ?.replace("rebalance-embedded-nav-", "")
          ?.replace("rebalance-embedded-secondary-nav-", "")
          ?.replace("rebalance-embedded-utility-nav-", "") ?? "",
      )
      .filter(Boolean),
  );
}

async function waitForEmbeddedWorkspaceShell(frame, timeout = 60_000) {
  await frame.waitForSelector('[data-testid="rebalance-embedded-root"]', { timeout });
  await frame.waitForSelector('[data-testid="rebalance-embedded-workspace-topbar"]', { timeout });
  await frame.waitForSelector('[data-testid="rebalance-embedded-focus-toggle"]', { timeout });
  await frame.waitForSelector('[data-testid="rebalance-embedded-workspace-tool-editor"]', { state: "attached", timeout });
}

async function clickEmbeddedWorkspaceTool(frame, key) {
  await clickEmbeddedDrawerTool(frame, "rebalance-embedded-nav", key);
}

async function openEmbeddedDrawer(frame) {
  const drawerVisible = await frame.locator('[data-testid="rebalance-embedded-rail"]').isVisible().catch(() => false);
  if (drawerVisible) {
    return;
  }
  await frame.evaluate(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }).catch(() => undefined);
  await frame.waitForTimeout(120);
  await frame.locator('[data-testid="rebalance-embedded-focus-toggle"]').evaluate((element) => {
    (element instanceof HTMLElement ? element : element.parentElement)?.click();
  });
  await frame.waitForFunction(() => {
    const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
    return root instanceof HTMLElement && root.dataset.toolRailExpanded === "true";
  }, { timeout: 30_000 });
  await frame.waitForSelector('[data-testid="rebalance-embedded-rail"]', { timeout: 30_000 });
}

async function clickEmbeddedDrawerTool(frame, prefix, key) {
  await openEmbeddedDrawer(frame);
  const selector = `[data-testid="${prefix}-${key}"]`;
  await frame.waitForSelector(selector, { timeout: 30_000 });
  await frame.locator(selector).click({ force: true });
}

async function selectBestToolsProfile(page, preferredInstance) {
  const profileSelect = page.locator('[data-testid="tools-hero-card"] select');
  await profileSelect.waitFor({ state: "visible", timeout: 30_000 });
  const options = await profileSelect.evaluate((select) =>
    Array.from(select.options).map((option) => ({
      value: option.value,
      label: option.label,
      disabled: option.disabled,
    })),
  );

  const target =
    options.find((option) => option.value === preferredInstance?.id) ??
    options.find((option) => option.label.includes(preferredInstance?.profileName ?? "")) ??
    options.find((option) => /^standard\b/i.test(option.label)) ??
    options.find((option) => option.value && !option.disabled) ??
    null;

  if (!target?.value) {
    throw new Error(`No selectable tools profile was found: ${JSON.stringify(options)}`);
  }

  await profileSelect.selectOption(target.value);
  return target;
}

async function copySeedPathIfExists(sourcePath, destinationPath) {
  try {
    await access(sourcePath, fsConstants.F_OK);
  } catch {
    return false;
  }

  await cp(sourcePath, destinationPath, {
    recursive: true,
    force: true,
  });
  return true;
}

async function seedPackagedUserDataDir() {
  await rm(packagedSmokeUserDataDir, { recursive: true, force: true });
  await mkdir(packagedSmokeUserDataDir, { recursive: true });

  if (launcherUserDataSeedDir) {
    try {
      await access(launcherUserDataSeedDir, fsConstants.F_OK);
      await copySeedPathIfExists(
        path.join(launcherUserDataSeedDir, launcherSettingsFileName),
        path.join(packagedSmokeUserDataDir, launcherSettingsFileName),
      );
      await copySeedPathIfExists(
        path.join(launcherUserDataSeedDir, launcherRadioSettingsFileName),
        path.join(packagedSmokeUserDataDir, launcherRadioSettingsFileName),
      );
      await copySeedPathIfExists(
        path.join(launcherUserDataSeedDir, "instances"),
        path.join(packagedSmokeUserDataDir, "instances"),
      );
    } catch {
      // fall through to normalized empty seed
    }
  }

  return await normalizePackagedLauncherSettings();
}

async function assertEmbeddedToolHealthy(frame, viewportLabel) {
  await waitForEmbeddedWorkspaceShell(frame);
  await frame.waitForSelector('[data-testid="rebalance-editor-layout"]');
  const navCount = await frame.locator('[data-testid^="rebalance-embedded-workspace-tool-"]').count();
  if (navCount < 5) {
    throw new Error(`Workspace tool strip is incomplete for ${viewportLabel}: found ${navCount} tool items.`);
  }

  const shellState = await frame.evaluate(() => ({
    documentX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 4,
    fontsReady: document.fonts?.status ?? "unknown",
    topbarFontFamily: (() => {
      const element = document.querySelector(".rebalance-workspace-topbar-meta strong");
      return element ? window.getComputedStyle(element).fontFamily : "";
    })(),
  }));
  if (shellState.documentX) {
    throw new Error(`Embedded workspace has horizontal overflow for ${viewportLabel}.`);
  }
  const topbarUsesReadableTypography = /Archivo|Manrope|Inter|Geist|Satoshi/i.test(shellState.topbarFontFamily);
  if (shellState.fontsReady !== "loaded" || !topbarUsesReadableTypography) {
    throw new Error(`Embedded fonts are not ready for ${viewportLabel}: ${JSON.stringify(shellState)}`);
  }

  const editorState = await frame.evaluate(() => {
    const root = document.documentElement;
    const sidebar = document.querySelector('[data-testid="rebalance-editor-sidebar"]');
    const main = document.querySelector('[data-testid="rebalance-editor-main"]');
    const buttons = Array.from(document.querySelectorAll("button")).map((button) => button.textContent?.trim() ?? "");
    return {
      documentX: root.scrollWidth > root.clientWidth + 4,
      hasSidebar: Boolean(sidebar),
      hasMain: Boolean(main),
      hasPreview: Boolean(document.querySelector('[data-testid="rebalance-editor-preview"]')),
      fileRows: document.querySelectorAll('.task-record').length,
      hasBrowseFiles: buttons.some((label) => /browse files/i.test(label)),
      hasQuickEditTab: buttons.some((label) => /quick edit/i.test(label)),
    };
  });
  if (
    editorState.documentX ||
    !editorState.hasMain ||
    editorState.hasPreview ||
    (!editorState.hasSidebar && editorState.fileRows < 1) ||
    !editorState.hasBrowseFiles ||
    !editorState.hasQuickEditTab
  ) {
    throw new Error(`Embedded editor is unhealthy for ${viewportLabel}: ${JSON.stringify(editorState)}`);
  }
}

async function assertSwapPageHealthy(frame, viewportLabel) {
  await frame.waitForSelector('[data-testid="rebalance-page-swap"]', { timeout: 30_000 });
  await frame.waitForSelector('[data-testid="rebalance-swap-slot-list"]', { timeout: 30_000 });

  const swapState = await frame.evaluate(() => ({
    activePage: document.querySelector('[data-testid="rebalance-embedded-root"]')?.getAttribute("data-page"),
    slotCount: document.querySelectorAll('[data-testid="rebalance-swap-slot-card"]').length,
    sourceCount: document.querySelectorAll('[data-testid="rebalance-swap-source-card"]').length,
    hasEmptyState: Boolean(document.querySelector('[data-testid="rebalance-swap-empty"]')),
    hasSearch: Boolean(document.querySelector('input[aria-label="Search ability sources"]')),
    title: document.querySelector(".task-header .task-title")?.textContent?.trim() ?? "",
  }));

  if (swapState.activePage !== "swap") {
    throw new Error(`Embedded swap flow did not land on the swap page for ${viewportLabel}: ${JSON.stringify(swapState)}`);
  }
  if (swapState.slotCount < 1 || swapState.sourceCount < 1 || swapState.hasEmptyState || !swapState.hasSearch) {
    throw new Error(`Embedded swap flow is still empty or incomplete for ${viewportLabel}: ${JSON.stringify(swapState)}`);
  }
}

async function assertGlobalRebalanceSearchHealthy(frame, viewportLabel) {
  const trigger = frame.locator('[data-testid="rebalance-embedded-global-search-trigger"]');
  await trigger.waitFor({ state: "visible", timeout: 30_000 });
  await trigger.click();
  await frame.waitForSelector('[data-testid="rebalance-embedded-global-search-overlay"]', { timeout: 30_000 });

  const input = frame.getByLabel("Search all Rebalance data");
  await input.waitFor({ state: "visible", timeout: 30_000 });
  await input.fill("Anna ability");

  await frame.waitForFunction(() => {
    const overlay = document.querySelector('[data-testid="rebalance-embedded-global-search-overlay"]');
    const results = Array.from(document.querySelectorAll(".rebalance-global-search-result"));
    return Boolean(
      overlay instanceof HTMLElement &&
      results.some((node) => /anna\s*\/\s*ability swap/i.test(node.textContent ?? "")),
    );
  }, { timeout: 30_000 });

  const searchState = await frame.evaluate(() => {
    const overlay = document.querySelector('[data-testid="rebalance-embedded-global-search-overlay"]');
    const dialog = document.querySelector(".rebalance-global-search-dialog");
    const searchTrigger = document.querySelector('[data-testid="rebalance-embedded-global-search-trigger"]');
    const topbar = document.querySelector('[data-testid="rebalance-embedded-workspace-topbar"]');
    const results = Array.from(document.querySelectorAll(".rebalance-global-search-result")).map((node) => {
      const rect = node instanceof HTMLElement ? node.getBoundingClientRect() : null;
      return {
        text: node.textContent?.trim().replace(/\s+/g, " ").slice(0, 180) ?? "",
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
      };
    });
    const rectFor = (node) => {
      if (!(node instanceof HTMLElement)) {
        return null;
      }
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const triggerRect = rectFor(searchTrigger);
    const dialogRect = rectFor(dialog);
    const topbarRect = rectFor(topbar);
    const buttons = Array.from(overlay?.querySelectorAll("button") ?? []).filter((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      if (node.classList.contains("rebalance-global-search-backdrop")) {
        return false;
      }
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
    const overlaps = [];
    for (let index = 0; index < buttons.length; index += 1) {
      const left = buttons[index];
      const leftRect = left.getBoundingClientRect();
      for (let nextIndex = index + 1; nextIndex < buttons.length; nextIndex += 1) {
        const right = buttons[nextIndex];
        const rightRect = right.getBoundingClientRect();
        const width = Math.max(0, Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left));
        const height = Math.max(0, Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top));
        if (width * height > 40) {
          overlaps.push({
            left: left.textContent?.trim().slice(0, 80) || left.getAttribute("aria-label") || "",
            right: right.textContent?.trim().slice(0, 80) || right.getAttribute("aria-label") || "",
          });
        }
      }
    }
    return {
      hasOverlay: overlay instanceof HTMLElement,
      hasDialog: dialog instanceof HTMLElement,
      hasMotionBackdrop: Boolean(overlay?.querySelector("[data-motion-backdrop]")),
      hasMotionDialog: Boolean(overlay?.querySelector("[data-motion-dialog]")),
      motionResultCount: overlay?.querySelectorAll("[data-motion-result]").length ?? 0,
      documentX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 4,
      indexedText: document.querySelector(".rebalance-global-search-meta")?.textContent?.trim() ?? "",
      resultCount: results.length,
      hasAnnaAbility: results.some((result) => /anna\s*\/\s*ability swap/i.test(result.text)),
      hasUsefulResultSize: results.every((result) => result.width >= 240 && result.height >= 42),
      triggerRect,
      dialogRect,
      topbarRect,
      dialogFitsViewport: Boolean(dialogRect && dialogRect.left >= -1 && dialogRect.right <= window.innerWidth + 1),
      topbarStillPresent: Boolean(topbarRect && topbarRect.width > 0 && topbarRect.height > 0),
      topbarUsesMotionHook: Boolean(topbar?.hasAttribute("data-motion-topbar")),
      overlaps,
    };
  });

  if (
    !searchState.hasOverlay ||
    !searchState.hasDialog ||
    !searchState.hasMotionBackdrop ||
    !searchState.hasMotionDialog ||
    searchState.motionResultCount < 1 ||
    searchState.documentX ||
    searchState.resultCount < 1 ||
    !searchState.hasAnnaAbility ||
    !searchState.hasUsefulResultSize ||
    !searchState.dialogFitsViewport ||
    !searchState.topbarStillPresent ||
    !searchState.topbarUsesMotionHook ||
    searchState.overlaps.length > 0
  ) {
    throw new Error(`Embedded global Rebalance search regressed for ${viewportLabel}: ${JSON.stringify(searchState)}`);
  }

  await writeFile(
    path.join(artifactDir, `real-exe-tools-global-search-${viewportLabel}.json`),
    `${JSON.stringify(searchState, null, 2)}\n`,
    "utf8",
  );

  await frame.locator("button.rebalance-global-search-result", { hasText: /Anna\s*\/\s*Ability Swap/i }).first().click();
  await frame.waitForFunction(() => {
    const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
    return Boolean(
      root instanceof HTMLElement &&
      root.dataset.page === "swap" &&
      !document.querySelector('[data-testid="rebalance-embedded-global-search-overlay"]'),
    );
  }, { timeout: 30_000 });
  await assertSwapPageHealthy(frame, viewportLabel);
}

async function assertEditorAllValuesHealthy(frame, viewportLabel) {
  await frame.getByRole("button", { name: /^All values$/ }).click();
  await frame.waitForSelector(".task-value-browser--editor .task-value-browser-detail-shell", { timeout: 30_000 });
  await frame.waitForFunction(() => {
    const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
    const detail = document.querySelector(".task-value-browser--editor .task-value-browser-detail");
    const inspector = document.querySelector(".task-value-browser--editor .task-quick-control");
    return Boolean(root instanceof HTMLElement && root.dataset.page === "editor" && detail instanceof HTMLElement && inspector instanceof HTMLElement);
  }, { timeout: 30_000 });

  const allValuesState = await frame.evaluate(() => {
    const rectFor = (node) => {
      if (!(node instanceof HTMLElement)) {
        return null;
      }
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const pageRoot = document.querySelector('[data-testid="rebalance-page-editor"]');
    const browser = document.querySelector(".task-value-browser--editor");
    const shell = document.querySelector(".task-value-browser--editor .task-value-browser-detail-shell");
    const rail = document.querySelector(".task-value-browser--editor .task-value-browser-entry-rail");
    const detail = document.querySelector(".task-value-browser--editor .task-value-browser-detail");
    const inspector = document.querySelector(".task-value-browser--editor .task-quick-control");
    const metaValues = Array.from(document.querySelectorAll(".task-value-browser--editor .task-quick-control-meta em"))
      .map((node) => node.textContent?.trim() ?? "")
      .filter(Boolean);
    const shellRect = rectFor(shell);
    const railRect = rectFor(rail);
    const detailRect = rectFor(detail);
    const inspectorRect = rectFor(inspector);
    const browserRect = rectFor(browser);
    const sideBySide = Boolean(
      shellRect &&
      railRect &&
      detailRect &&
      detailRect.left >= railRect.right - 2 &&
      detailRect.width >= Math.min(420, window.innerWidth * 0.32) &&
      detailRect.right <= shellRect.right + 2
    );
    const stackedDetailAfterList = Boolean(
      shellRect &&
      railRect &&
      detailRect &&
      detailRect.top >= railRect.bottom - 2 &&
      detailRect.width >= shellRect.width - 8,
    );
    const stackedDetailBeforeList = Boolean(
      shellRect &&
      railRect &&
      detailRect &&
      railRect.top >= detailRect.bottom - 2 &&
      detailRect.width >= shellRect.width - 8,
    );
    const stacked = stackedDetailAfterList || stackedDetailBeforeList;
    return {
      hasPageRoot: pageRoot instanceof HTMLElement,
      documentX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 4,
      browserRect,
      shellRect,
      railRect,
      detailRect,
      inspectorRect,
      sideBySide,
      stacked,
      stackedDetailBeforeList,
      metaValues,
      metaUsesTruncation: metaValues.some((value) => value.includes("...") || value.includes("â€¦")),
      browserUsesAvailableWidth: Boolean(browserRect && pageRoot instanceof HTMLElement && browserRect.width >= pageRoot.getBoundingClientRect().width * 0.86),
      inspectorVisible: Boolean(inspectorRect && inspectorRect.width > 300 && inspectorRect.height > 100),
    };
  });

  if (
    !allValuesState.hasPageRoot ||
    allValuesState.documentX ||
    !allValuesState.browserUsesAvailableWidth ||
    (!allValuesState.sideBySide && !allValuesState.stacked) ||
    !allValuesState.inspectorVisible ||
    allValuesState.metaUsesTruncation
  ) {
    throw new Error(`Embedded editor All values regressed for ${viewportLabel}: ${JSON.stringify(allValuesState)}`);
  }

  const effectPickerState = await assertEditorEffectPickerHealthy(frame, viewportLabel);

  await writeFile(
    path.join(artifactDir, `real-exe-tools-editor-all-values-${viewportLabel}.json`),
    `${JSON.stringify({ ...allValuesState, effectPickerState }, null, 2)}\n`,
    "utf8",
  );
  await screenshot(frame, `real-exe-tools-editor-all-values-${viewportLabel}.png`);
}

async function assertEditorEffectPickerHealthy(frame, viewportLabel) {
  const addEffectButtons = frame.getByRole("button", { name: "Add effect" });
  const addEffectButtonCount = await addEffectButtons.count();
  if (!addEffectButtonCount) {
    return { skipped: true, reason: "No Add effect field in selected All values document." };
  }

  await addEffectButtons.first().click();
  await frame.getByRole("dialog", { name: "Choose SO effect" }).waitFor({ state: "visible", timeout: 15_000 });

  const effectPickerState = await frame.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Choose SO effect"]');
    const search = dialog?.querySelector('input[placeholder*="Search by name"]');
    const options = Array.from(dialog?.querySelectorAll(".task-effect-picker-results button") ?? []);
    const dialogRect = dialog instanceof HTMLElement ? dialog.getBoundingClientRect() : null;
    return {
      skipped: false,
      hasDialog: dialog instanceof HTMLElement,
      hasSearch: search instanceof HTMLInputElement,
      optionCount: options.length,
      firstOptionText: options[0]?.textContent?.trim() ?? "",
      documentX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 4,
      dialogInsideViewport: Boolean(
        dialogRect &&
        dialogRect.left >= -2 &&
        dialogRect.top >= -2 &&
        dialogRect.right <= window.innerWidth + 2 &&
        dialogRect.bottom <= window.innerHeight + 2
      ),
    };
  });

  if (
    !effectPickerState.hasDialog ||
    !effectPickerState.hasSearch ||
    effectPickerState.optionCount < 2 ||
    effectPickerState.documentX ||
    !effectPickerState.dialogInsideViewport
  ) {
    throw new Error(`Embedded editor Add effect picker regressed for ${viewportLabel}: ${JSON.stringify(effectPickerState)}`);
  }

  await screenshot(frame, `real-exe-tools-editor-effect-picker-${viewportLabel}.png`);
  const closeButtons = frame.getByRole("button", { name: "Close" });
  if (await closeButtons.count()) {
    await closeButtons.first().click();
  }
  return effectPickerState;
}

async function captureDirectRebalanceEffectPicker(harnessUrl, viewport) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const viewportLabel = `${viewport.label}-${viewport.width}x${viewport.height}`;

  try {
    const rebalanceUrl = new URL("/rebalance.html", harnessUrl);
    rebalanceUrl.searchParams.set("embedded", "1");
    rebalanceUrl.searchParams.set("initialPage", "editor");
    rebalanceUrl.searchParams.set("workspaceRoot", "C:/Harness/Creator Kit Tools");
    rebalanceUrl.searchParams.set("profileLabel", "Creator Kit Tools / build-2025-08-19-750068");
    rebalanceUrl.searchParams.set("track", "bapbap");
    rebalanceUrl.searchParams.set("instanceSource", "official-managed");

    await page.goto(rebalanceUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForSelector('[data-testid="rebalance-page-editor"]', { timeout: 45_000 });
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll("button")).map((button) => button.textContent?.replace(/\s+/g, " ").trim() ?? "");
      const title = document.querySelector(".task-header .task-title")?.textContent?.trim() ?? "";
      return title.length > 0 && buttons.includes("All values");
    }, { timeout: 30_000 });

    await page.getByRole("button", { name: "All values" }).click();
    await page.waitForFunction(() => {
      const bodyText = document.body.innerText;
      const buttons = Array.from(document.querySelectorAll("button")).map((button) => button.textContent?.replace(/\s+/g, " ").trim() ?? "");
      return /Burn effect|PassiveSO|StatusEffectSO/i.test(bodyText) && buttons.includes("Add effect");
    }, { timeout: 30_000 });

    await page.getByRole("button", { name: "Add effect" }).first().click();
    await page.getByRole("dialog", { name: "Choose SO effect" }).waitFor({ state: "visible", timeout: 15_000 });
    await page.getByPlaceholder("Search by name, id, source, or type...").fill("poison");

    const effectPickerState = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Choose SO effect"]');
      const search = dialog?.querySelector('input[placeholder*="Search by name"]');
      const options = Array.from(dialog?.querySelectorAll(".task-effect-picker-results button") ?? []);
      const dialogRect = dialog instanceof HTMLElement ? dialog.getBoundingClientRect() : null;
      const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
      const pageRoot = document.querySelector('[data-testid="rebalance-page-editor"]');
      const visibleText = document.body.innerText;
      return {
        hasDialog: dialog instanceof HTMLElement,
        hasSearch: search instanceof HTMLInputElement,
        optionCount: options.length,
        firstOptionText: options[0]?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        documentX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 4,
        dialogInsideViewport: Boolean(
          dialogRect &&
          dialogRect.left >= -2 &&
          dialogRect.top >= -2 &&
          dialogRect.right <= window.innerWidth + 2 &&
          dialogRect.bottom <= window.innerHeight + 2
        ),
        rootFontSize: root instanceof HTMLElement ? getComputedStyle(root).fontSize : null,
        htmlFontSize: getComputedStyle(document.documentElement).fontSize,
        pageWidth: pageRoot instanceof HTMLElement ? pageRoot.getBoundingClientRect().width : 0,
        viewportWidth: window.innerWidth,
        usesAvailableWidth: pageRoot instanceof HTMLElement ? pageRoot.getBoundingClientRect().width >= window.innerWidth * 0.86 : false,
        hasSearchedResult: /Status Poison|Poison/i.test(visibleText),
      };
    });

    if (
      !effectPickerState.hasDialog ||
      !effectPickerState.hasSearch ||
      effectPickerState.optionCount < 1 ||
      !effectPickerState.hasSearchedResult ||
      effectPickerState.documentX ||
      !effectPickerState.dialogInsideViewport ||
      !effectPickerState.usesAvailableWidth ||
      (viewport.width >= 2560 && Number.parseFloat(effectPickerState.htmlFontSize ?? "0") < 19)
    ) {
      throw new Error(`Direct Rebalance SO effect picker regressed for ${viewportLabel}: ${JSON.stringify(effectPickerState)}`);
    }

    await writeArtifactJson(`direct-rebalance-effect-picker-${viewportLabel}.json`, effectPickerState);
    await screenshot(page, `direct-rebalance-effect-picker-${viewportLabel}.png`);
  } finally {
    await browser.close();
  }
}

async function captureToolsFlow(packagedExe, harnessUrl, viewport) {
  const pageUrl = `${harnessUrl}?preset=messy-real&workspace=tools`;
  await withPackagedPage(packagedExe, pageUrl, viewport, async page => {
    await page.waitForSelector('[data-testid="tools-gallery-view"]');
    await screenshot(page.locator('[data-testid="tools-workspace"]'), `real-exe-tools-gallery-${viewport.label}-${viewport.width}x${viewport.height}.png`);

    const rebalanceCard = page.locator('[data-testid="tools-card-rebalance-studio"]');
    await rebalanceCard.click();
    await page.waitForSelector('[data-testid="tools-gate-panel"]');
    await screenshot(page.locator('[data-testid="tools-focus-panel"]'), `real-exe-tools-gate-${viewport.label}-${viewport.width}x${viewport.height}.png`);

    await page.locator('[data-testid="tools-back-button"]').click();
    await page.waitForSelector('[data-testid="tools-gallery-view"]');
    const profileSelect = page.locator(".tools-hero-card select");
    await profileSelect.waitFor({ state: "visible", timeout: 15_000 });
    const optionValues = await profileSelect.evaluate((select) =>
      Array.from(select.options)
        .map((option) => option.value)
        .filter(Boolean),
    );
    const defaultProfileValue = optionValues.find((value) => /standard/i.test(value)) ?? optionValues[0];
    if (!defaultProfileValue) {
      throw new Error("Harness tools flow did not expose any selectable profile values.");
    }
    await profileSelect.selectOption(defaultProfileValue);
    await page.waitForFunction(
      () => document.querySelector('[data-testid="tools-card-rebalance-studio"]')?.getAttribute("data-tool-state") === "ready",
      { timeout: 15_000 },
    );

    await rebalanceCard.click();
    await page.waitForSelector('[data-testid="rebalance-embed-shell"]');
    await page.waitForSelector(".rebalance-embed-shell.is-ready");
    const frame = page;

    await waitForEmbeddedWorkspaceShell(frame);
    await assertEmbeddedToolHealthy(frame, viewport.label);
    await assertGlobalRebalanceSearchHealthy(frame, viewport.label);
    await screenshot(
      page.locator('[data-testid="tools-focus-panel"]'),
      `real-exe-tools-editor-${viewport.label}-${viewport.width}x${viewport.height}.png`,
    );
    await clickEmbeddedWorkspaceTool(frame, "swap");
    await assertSwapPageHealthy(frame, viewport.label);
    await screenshot(
      page.locator('[data-testid="tools-focus-panel"]'),
      `real-exe-tools-swap-${viewport.label}-${viewport.width}x${viewport.height}.png`,
    );
  });
}

async function captureRealToolsFlow(packagedExe, viewport, preferredInstance) {
  await withLocalPackagedPage(packagedExe, viewport, async page => {
    await page.waitForSelector("#v2-root", { timeout: 90_000 });
    await page.waitForFunction(() => {
      const root = document.querySelector("#v2-root");
      return Boolean(root) && !root.classList.contains("is-startup-blocked");
    }, { timeout: 90_000 });

    let toolsRailButton = page.locator('[data-testid="rail-nav-tools"]');
    const toolsVisible = await toolsRailButton.isVisible().catch(() => false);
    if (!toolsVisible) {
      const settingsRailButton = page.locator('[data-testid="rail-nav-settings"]');
      await settingsRailButton.waitFor({ state: "visible", timeout: 30_000 });
      await settingsRailButton.click();

      const toolsCodeInput = page.locator('input[placeholder="Enter tools code"]');
      await toolsCodeInput.waitFor({ state: "visible", timeout: 30_000 });
      await toolsCodeInput.fill(toolsUnlockCode);
      await page.getByRole("button", { name: /^Unlock$/ }).click();
      await page.waitForFunction(
        () => Boolean(document.querySelector('[data-testid="rail-nav-tools"]')),
        { timeout: 30_000 },
      );
      toolsRailButton = page.locator('[data-testid="rail-nav-tools"]');
    }
    await toolsRailButton.waitFor({ state: "visible", timeout: 30_000 });
    await toolsRailButton.click();

    await page.waitForSelector('[data-testid="tools-gallery-view"]', { timeout: 30_000 });

    await selectBestToolsProfile(page, preferredInstance);

    try {
      await page.waitForFunction(() => {
        const card = document.querySelector('[data-testid="tools-card-rebalance-studio"]');
        return card?.getAttribute("data-tool-state") === "ready";
      }, { timeout: 60_000 });
    } catch (error) {
      await captureToolsGalleryDebug(page, viewport);
      throw error;
    }

    await screenshot(
      page.locator('[data-testid="tools-workspace"]'),
      `real-exe-tools-gallery-${viewport.label}-${viewport.width}x${viewport.height}.png`,
    );

    const rebalanceCard = page.locator('[data-testid="tools-card-rebalance-studio"]');
    await rebalanceCard.click();

    await page.waitForSelector('[data-testid="tools-focus-panel"]', { timeout: 30_000 });
    try {
      await page.waitForSelector(".rebalance-embed-shell.is-ready", { timeout: 60_000 });
    } catch (error) {
      await captureRebalanceLoadingDebug(page, viewport);
      throw error;
    }

    const frame = page;
    try {
      await waitForEmbeddedWorkspaceShell(frame, 60_000);
    } catch (error) {
      await captureRebalanceLoadingDebug(page, viewport, "workspace-timeout");
      throw error;
    }

    const homeAlreadyVisible = await frame.evaluate(() => {
      const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
      const homeRoot = document.querySelector('[data-testid="rebalance-page-dashboard"]');
      const launcherGrid = document.querySelector('[data-testid="rebalance-home-launcher-grid"]');
      const contextGrid = document.querySelector('[data-testid="rebalance-home-context-grid"]');
      return Boolean(
        root instanceof HTMLElement &&
        root.dataset.page === "dashboard" &&
        homeRoot instanceof HTMLElement &&
        launcherGrid instanceof HTMLElement &&
        contextGrid instanceof HTMLElement,
      );
    });
    if (!homeAlreadyVisible) {
      await clickEmbeddedWorkspaceTool(frame, "dashboard");
    }
    await frame.waitForFunction(() => {
      const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
      const homeRoot = document.querySelector('[data-testid="rebalance-page-dashboard"]');
      const launcherGrid = document.querySelector('[data-testid="rebalance-home-launcher-grid"]');
      const contextGrid = document.querySelector('[data-testid="rebalance-home-context-grid"]');
      return Boolean(
        root instanceof HTMLElement &&
        root.dataset.page === "dashboard" &&
        homeRoot instanceof HTMLElement &&
        launcherGrid instanceof HTMLElement &&
        contextGrid instanceof HTMLElement,
      );
    }, { timeout: 30_000 });
    await page.waitForTimeout(viewport.label === "narrow" ? 850 : 400);
    await screenshot(page, `real-exe-tools-home-${viewport.label}-${viewport.width}x${viewport.height}.png`);
    await expectEmbeddedVisualAudit(frame, viewport, '[data-testid="rebalance-page-dashboard"]', "home", { maxChromeDepth: 4 });
    if (viewport.label === "wide") {
      await assertEmbeddedResizeStable(page, frame, "home", '[data-testid="rebalance-page-dashboard"]', "dashboard");
    }

    const homeState = await frame.evaluate(() => {
      const homeRoot = document.querySelector('[data-testid="rebalance-page-dashboard"]');
      const pageBodyText = homeRoot instanceof HTMLElement ? homeRoot.innerText : document.body.innerText;
      const toolStrip = document.querySelector(".rebalance-workspace-topbar-strip");
      const topbarToolsVisible = toolStrip instanceof HTMLElement && getComputedStyle(toolStrip).display !== "none";
      const backButton = document.querySelector(".tools-back-button--compact");
      const profileMeta = document.querySelector(".rebalance-workspace-topbar-meta");
      const topbarToggle = document.querySelector(".rebalance-workspace-topbar-toggle");
      const backRect = backButton instanceof HTMLElement ? backButton.getBoundingClientRect() : null;
      const profileRect = profileMeta instanceof HTMLElement ? profileMeta.getBoundingClientRect() : null;
      const toggleRect = topbarToggle instanceof HTMLElement ? topbarToggle.getBoundingClientRect() : null;
      const overlapsRect = (leftRect, rightRect) =>
        Boolean(
          leftRect &&
          rightRect &&
          leftRect.width > 0 &&
          rightRect.width > 0 &&
          leftRect.left < rightRect.right &&
          leftRect.right > rightRect.left &&
          leftRect.top < rightRect.bottom &&
          leftRect.bottom > rightRect.top,
        );
      const hostBackOverlapsProfile = overlapsRect(backRect, profileRect);
      const hostBackOverlapsToggle = overlapsRect(backRect, toggleRect);
      const activePage = Array.from(document.querySelectorAll("[data-page-active='true'][data-testid]")).map((node) =>
        node
          .getAttribute("data-testid")
          ?.replace("rebalance-embedded-workspace-tool-", "")
          ?.replace("rebalance-embedded-nav-", "")
          ?.replace("rebalance-embedded-secondary-nav-", "")
          ?.replace("rebalance-embedded-utility-nav-", "") ?? "",
      ).filter(Boolean);
      return {
        hasHomeRoot: Boolean(homeRoot),
        activePage,
        documentX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 4,
        hasRecentFile: /recent file/i.test(pageBodyText),
        hasLastDraft: /last draft/i.test(pageBodyText),
        hasPrimaryChange: /open change|continue file|continue editing/i.test(pageBodyText),
        hasMaintenanceToggle: /open maintenance|hide maintenance/i.test(pageBodyText),
        hasMaintenanceActionsVisible: /create backup|restore standard data|open workspace|hide quick start hints/i.test(pageBodyText),
        topbarToolsVisible,
        hostBackOverlapsProfile,
        hostBackOverlapsToggle,
        idleConsoleDockVisible: Boolean(document.querySelector(".tools-rebalance-console-dock")),
      };
    });
    if (
      !homeState.hasHomeRoot ||
      homeState.documentX ||
      homeState.topbarToolsVisible ||
      homeState.hostBackOverlapsProfile ||
      homeState.hostBackOverlapsToggle ||
      homeState.idleConsoleDockVisible ||
      homeState.activePage.length !== 1 ||
      homeState.activePage[0] !== "dashboard" ||
      !homeState.hasRecentFile ||
      !homeState.hasLastDraft ||
      !homeState.hasPrimaryChange ||
      !homeState.hasMaintenanceToggle ||
      homeState.hasMaintenanceActionsVisible
    ) {
      throw new Error(`Embedded home workspace regressed for ${viewport.label}: ${JSON.stringify(homeState)}`);
    }
    await writeFile(
      path.join(artifactDir, `real-exe-tools-home-${viewport.label}-${viewport.width}x${viewport.height}.json`),
      `${JSON.stringify(homeState, null, 2)}\n`,
      "utf8",
    );

    await assertGlobalRebalanceSearchHealthy(frame, viewport.label);

    await clickEmbeddedWorkspaceTool(frame, "editor");
    await frame.waitForFunction(() => {
      const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
      const editorRoot = document.querySelector('[data-testid="rebalance-page-editor"]');
      const pageTitle = document.querySelector(".task-header .task-title");
      const buttons = Array.from(document.querySelectorAll("button")).map((button) => button.textContent?.trim() ?? "");
      return Boolean(
        root instanceof HTMLElement &&
        root.dataset.page === "editor" &&
        editorRoot instanceof HTMLElement &&
        pageTitle instanceof HTMLElement &&
        pageTitle.innerText.trim() &&
        !/choose a file/i.test(pageTitle.innerText.trim()) &&
        buttons.some((label) => /browse files/i.test(label)) &&
        buttons.some((label) => /quick edit/i.test(label)),
      );
    }, { timeout: 30_000 });
    await page.waitForTimeout(viewport.label === "narrow" ? 950 : 450);
    await screenshot(page, `real-exe-tools-editor-${viewport.label}-${viewport.width}x${viewport.height}.png`);
    await expectEmbeddedVisualAudit(frame, viewport, '[data-testid="rebalance-page-editor"]', "editor");
    if (viewport.label === "wide") {
      await assertEmbeddedResizeStable(page, frame, "editor", '[data-testid="rebalance-page-editor"]', "editor");
    }

    const editorState = await frame.evaluate(() => {
      const root = document.documentElement;
      const pageTitle = document.querySelector(".task-header .task-title");
      const pageBodyText = document.body.innerText;
      const buttons = Array.from(document.querySelectorAll("button")).map((button) => button.textContent?.trim() ?? "");
      return {
        documentX: root.scrollWidth > root.clientWidth + 4,
        activePage: Array.from(document.querySelectorAll("[data-page-active='true'][data-testid]")).map((node) =>
          node
            .getAttribute("data-testid")
            ?.replace("rebalance-embedded-workspace-tool-", "")
            ?.replace("rebalance-embedded-nav-", "")
            ?.replace("rebalance-embedded-secondary-nav-", "")
            ?.replace("rebalance-embedded-utility-nav-", "") ?? "",
        ).filter(Boolean),
        pageTitleText: pageTitle instanceof HTMLElement ? pageTitle.innerText.trim() : "",
        hasEditorPageMarker: Boolean(document.querySelector('[data-testid="rebalance-page-editor"]')),
        hasPreview: Boolean(document.querySelector('[data-testid="rebalance-editor-preview"]')),
        hasBrowseFiles: buttons.some((label) => /browse files/i.test(label)),
        hasQuickEdit: buttons.some((label) => /quick edit/i.test(label)),
        hasAllValues: buttons.some((label) => /all values/i.test(label)),
        hasRaw: buttons.some((label) => /^raw$/i.test(label)),
        standardCount: pageBodyText.match(/\bstandard\b/gi)?.length ?? 0,
        resetCount: pageBodyText.match(/reset to standard/gi)?.length ?? 0,
        hasHarnessText: /browser harness|creator kit|c:\/mock/i.test(pageBodyText),
        hasUnsavedMarker: /unsaved/i.test(pageBodyText),
      };
    });
    if (
      editorState.documentX ||
      editorState.hasHarnessText ||
      !editorState.hasEditorPageMarker ||
      editorState.activePage.length !== 1 ||
      editorState.activePage[0] !== "editor" ||
      !editorState.pageTitleText ||
      /choose a file/i.test(editorState.pageTitleText) ||
      editorState.hasPreview ||
      !editorState.hasBrowseFiles ||
      !editorState.hasQuickEdit ||
      !editorState.hasAllValues ||
      !editorState.hasRaw ||
      editorState.standardCount < 1 ||
      editorState.resetCount < 1
    ) {
      throw new Error(`Embedded editor workspace regressed for ${viewport.label}: ${JSON.stringify(editorState)}`);
    }
    await writeFile(
      path.join(artifactDir, `real-exe-tools-editor-${viewport.label}-${viewport.width}x${viewport.height}.json`),
      `${JSON.stringify(editorState, null, 2)}\n`,
      "utf8",
    );
    await assertEditorAllValuesHealthy(frame, viewport.label);

    await clickEmbeddedDrawerTool(frame, "rebalance-embedded-secondary-nav", "library");
    await frame.waitForFunction(() => {
      const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
      const pageRoot = document.querySelector('[data-testid="rebalance-library-layout"]');
      const buttons = Array.from(document.querySelectorAll(".task-segmented button")).map((node) => node.textContent?.trim() ?? "");
      return Boolean(
        root instanceof HTMLElement &&
        root.dataset.page === "library" &&
        pageRoot instanceof HTMLElement &&
        buttons.some((label) => /guided block/i.test(label)) &&
        buttons.some((label) => /copy stored value/i.test(label)),
      );
    }, { timeout: 30_000 });
    await frame.getByRole("button", { name: "Copy stored value" }).click();
    await frame.waitForFunction(() => {
      const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
      const pageRoot = document.querySelector('[data-testid="rebalance-library-layout"]');
      const optionList = document.querySelector('[data-testid="rebalance-library-option-list"]');
      const pageBodyText = document.body.innerText;
      const loading = /loading library results/i.test(pageBodyText);
      const optionCount = optionList?.querySelectorAll(".task-choice").length ?? 0;
      const hasEmptyState = /no library options match/i.test(pageBodyText);
      return Boolean(
        root instanceof HTMLElement &&
        root.dataset.page === "library" &&
        pageRoot instanceof HTMLElement &&
        !loading &&
        (optionCount > 0 || hasEmptyState),
      );
    }, { timeout: 30_000 });
    await page.waitForTimeout(viewport.label === "narrow" ? 850 : 500);
    await screenshot(page, `real-exe-tools-add-${viewport.label}-${viewport.width}x${viewport.height}.png`);
    await expectEmbeddedVisualAudit(frame, viewport, '[data-testid="rebalance-library-layout"]', "add");
    if (viewport.label === "wide") {
      await assertEmbeddedResizeStable(page, frame, "add", '[data-testid="rebalance-library-layout"]', "library");
    }

    const addState = await frame.evaluate(() => {
      const root = document.documentElement;
      const embeddedRoot = document.querySelector('[data-testid="rebalance-embedded-root"]');
      const pageTitle = document.querySelector(".task-header .task-title");
      const pageBodyText = document.body.innerText;
      const libraryOptionList = document.querySelector('[data-testid="rebalance-library-option-list"]');
      return {
        documentX: root.scrollWidth > root.clientWidth + 4,
        activePage: embeddedRoot instanceof HTMLElement ? embeddedRoot.dataset.page ?? "" : "",
        pageTitle: pageTitle instanceof HTMLElement ? pageTitle.innerText.trim() : "",
        hasGuidedBlock: /guided block/i.test(pageBodyText),
        hasCopyStoredValue: /copy stored value/i.test(pageBodyText),
        hasCopyExisting: /copy existing/i.test(pageBodyText),
        hasCreateDifferenceCopy:
          /create stays the place for brand-new augment cards with live preview/i.test(pageBodyText)
          || /add only edits an existing file\. use create when you want a brand-new augment card/i.test(pageBodyText),
        browseResultCount: libraryOptionList?.querySelectorAll(".task-choice").length ?? 0,
        hasFavoritesAction: /save to favorites|remove from favorites/i.test(pageBodyText),
        hasOpenSourceAction: /open source file/i.test(pageBodyText),
      };
    });
    if (
      addState.documentX ||
      addState.activePage !== "library" ||
      !addState.pageTitle ||
      /choose one target/i.test(addState.pageTitle) ||
      !addState.hasGuidedBlock ||
      !addState.hasCopyStoredValue ||
      !addState.hasCopyExisting ||
      !addState.hasCreateDifferenceCopy ||
      addState.browseResultCount < 1 ||
      !addState.hasFavoritesAction ||
      !addState.hasOpenSourceAction
    ) {
      throw new Error(`Embedded add workspace regressed for ${viewport.label}: ${JSON.stringify(addState)}`);
    }
    await writeFile(
      path.join(artifactDir, `real-exe-tools-add-${viewport.label}-${viewport.width}x${viewport.height}.json`),
      `${JSON.stringify(addState, null, 2)}\n`,
      "utf8",
    );

    await clickEmbeddedWorkspaceTool(frame, "gamemode");
    await frame.waitForFunction(() => {
      const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
      const pageRoot = document.querySelector('[data-testid="rebalance-page-gamemode"]');
      const sectionStack = document.querySelector(".task-gamemode-section-stack");
      const categoryLabels = document.body.innerText;
      return Boolean(
        root instanceof HTMLElement &&
        root.dataset.page === "gamemode" &&
        pageRoot instanceof HTMLElement &&
        sectionStack instanceof HTMLElement &&
        /rules/i.test(categoryLabels) &&
        /zone/i.test(categoryLabels) &&
        /bots/i.test(categoryLabels),
      );
    }, { timeout: 30_000 });
    await page.waitForTimeout(viewport.label === "narrow" ? 900 : 450);
    await screenshot(page, `real-exe-tools-gamemode-${viewport.label}-${viewport.width}x${viewport.height}.png`);
    await expectEmbeddedVisualAudit(frame, viewport, '[data-testid="rebalance-page-gamemode"]', "gamemode");
    if (viewport.label === "wide") {
      await assertEmbeddedResizeStable(page, frame, "gamemode", '[data-testid="rebalance-page-gamemode"]', "gamemode");
    }

    const gameModeState = await frame.evaluate(() => {
      const root = document.documentElement;
      const pageRoot = document.querySelector('[data-testid="rebalance-page-gamemode"]');
      const pageTitle = document.querySelector(".task-header .task-title");
      const sectionStack = document.querySelector(".task-gamemode-section-stack");
      const pageBodyText = document.body.innerText;
      const alphaFromCssColor = (value) => {
        if (!value || value === "transparent") return 0;
        const rgba = value.match(/rgba?\(([^)]+)\)/i);
        if (!rgba) return 1;
        const parts = rgba[1].split(",").map((part) => Number.parseFloat(part.trim()));
        return parts.length >= 4 ? parts[3] : 1;
      };
      const isChromeSurface = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width < 40 || rect.height < 24) return false;
        const style = getComputedStyle(element);
        const borderVisible = ["Top", "Right", "Bottom", "Left"].some((side) => {
          const width = Number.parseFloat(style[`border${side}Width`] || "0");
          const alpha = alphaFromCssColor(style[`border${side}Color`]);
          return width > 0 && alpha > 0.08;
        });
        const backgroundVisible = alphaFromCssColor(style.backgroundColor) > 0.16 || style.backgroundImage !== "none";
        const shadowVisible = style.boxShadow !== "none";
        return borderVisible || backgroundVisible || shadowVisible;
      };
      const deepestChromeDepth = Array.from(pageRoot?.querySelectorAll("*") ?? []).reduce((maxDepth, node) => {
        let depth = 0;
        let cursor = node;
        while (cursor instanceof HTMLElement && cursor !== pageRoot && cursor !== document.body) {
          if (isChromeSurface(cursor)) depth += 1;
          cursor = cursor.parentElement;
        }
        return Math.max(maxDepth, depth);
      }, 0);
      const internalScrollables = Array.from(pageRoot?.querySelectorAll("*") ?? []).filter((node) => {
        if (!(node instanceof HTMLElement)) {
          return false;
        }
        const style = getComputedStyle(node);
        const hasY = node.scrollHeight > node.clientHeight + 2 && /(auto|scroll)/.test(style.overflowY);
        const hasX = node.scrollWidth > node.clientWidth + 2 && /(auto|scroll)/.test(style.overflowX);
        return hasX || hasY;
      }).map((node) => ({
        className: Array.from(node.classList).slice(0, 4).join(" "),
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
      }));
      return {
        documentX: root.scrollWidth > root.clientWidth + 4,
        activePage: Array.from(document.querySelectorAll("[data-page-active='true'][data-testid]")).map((node) =>
          node
            .getAttribute("data-testid")
            ?.replace("rebalance-embedded-workspace-tool-", "")
            ?.replace("rebalance-embedded-nav-", "")
            ?.replace("rebalance-embedded-secondary-nav-", "")
            ?.replace("rebalance-embedded-utility-nav-", "") ?? "",
        ).filter(Boolean),
        pageTitle: pageTitle instanceof HTMLElement ? pageTitle.innerText.trim() : "",
        sectionInputs: sectionStack?.querySelectorAll("input, textarea, select").length ?? 0,
        hasUtilities: /utilities/i.test(pageBodyText),
        hasRules: /\brules\b/i.test(pageBodyText),
        hasZone: /\bzone\b/i.test(pageBodyText),
        hasLobby: /\blobby\b/i.test(pageBodyText),
        hasBots: /\bbots\b/i.test(pageBodyText),
        hasPresets: /\bpresets\b/i.test(pageBodyText),
        hasExperimental: /\bexperimental\b/i.test(pageBodyText),
        deepestChromeDepth,
        internalScrollables,
      };
    });
    if (
      gameModeState.documentX ||
      gameModeState.deepestChromeDepth > 5 ||
      gameModeState.internalScrollables.length > 0 ||
      gameModeState.activePage.length !== 1 ||
      gameModeState.activePage[0] !== "gamemode" ||
      !gameModeState.pageTitle ||
      /choose one source/i.test(gameModeState.pageTitle) ||
      gameModeState.sectionInputs < 1 ||
      !gameModeState.hasUtilities ||
      !gameModeState.hasRules ||
      !gameModeState.hasZone ||
      !gameModeState.hasLobby ||
      !gameModeState.hasBots ||
      !gameModeState.hasPresets ||
      !gameModeState.hasExperimental
    ) {
      throw new Error(`Embedded game mode workspace regressed for ${viewport.label}: ${JSON.stringify(gameModeState)}`);
    }
    await writeFile(
      path.join(artifactDir, `real-exe-tools-gamemode-${viewport.label}-${viewport.width}x${viewport.height}.json`),
      `${JSON.stringify(gameModeState, null, 2)}\n`,
      "utf8",
    );

    await clickEmbeddedWorkspaceTool(frame, "swap");
    await frame.waitForFunction(() => {
      const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
      const pageRoot = document.querySelector('[data-testid="rebalance-page-swap"]');
      const slotCards = document.querySelectorAll(".task-swap-slot");
      const sourceCards = document.querySelectorAll(".task-swap-source-card");
      return Boolean(
        root instanceof HTMLElement &&
        root.dataset.page === "swap" &&
        pageRoot instanceof HTMLElement &&
        slotCards.length > 0 &&
        sourceCards.length > 0,
      );
    }, { timeout: 30_000 });
    await page.waitForTimeout(viewport.label === "narrow" ? 850 : 400);
    await screenshot(page, `real-exe-tools-swap-${viewport.label}-${viewport.width}x${viewport.height}.png`);
    await expectEmbeddedVisualAudit(frame, viewport, '[data-testid="rebalance-page-swap"]', "swap");
    if (viewport.label === "wide") {
      await assertEmbeddedResizeStable(page, frame, "swap", '[data-testid="rebalance-page-swap"]', "swap");
    }

    const swapState = await frame.evaluate(() => {
      const root = document.documentElement;
      const pageRoot = document.querySelector('[data-testid="rebalance-page-swap"]');
      const pageTitle = document.querySelector(".task-header .task-title");
      const pageBodyText = document.body.innerText;
      const badgeLabels = Array.from(document.querySelectorAll(".task-swap-badge")).map((node) => node.textContent?.trim() ?? "");
      const sourceList = document.querySelector(".task-swap-source-list--studio");
      const sourceResults = document.querySelector(".task-swap-source-results");
      const sourceShell = document.querySelector(".task-swap-source-browser-shell");
      const sourceBody = document.querySelector(".task-swap-source-browser .task-section-body");
      const sourceCards = Array.from(document.querySelectorAll(".task-swap-source-card")).slice(0, 5);
      const pickRect = (node) => {
        if (!(node instanceof Element)) {
          return null;
        }
        const rect = node.getBoundingClientRect();
        return {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          bottom: rect.bottom,
        };
      };
      const pickStyle = (node, properties) => {
        if (!(node instanceof Element)) {
          return null;
        }
        const style = getComputedStyle(node);
        return Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]));
      };
      const internalScrollables = Array.from(pageRoot?.querySelectorAll("*") ?? []).filter((node) => {
        if (!(node instanceof HTMLElement)) {
          return false;
        }
        const style = getComputedStyle(node);
        const hasY = node.scrollHeight > node.clientHeight + 2 && /(auto|scroll)/.test(style.overflowY);
        const hasX = node.scrollWidth > node.clientWidth + 2 && /(auto|scroll)/.test(style.overflowX);
        return hasX || hasY;
      }).map((node) => ({
        className: Array.from(node.classList).slice(0, 4).join(" "),
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
      }));
      return {
        documentX: root.scrollWidth > root.clientWidth + 4,
        activePage: Array.from(document.querySelectorAll("[data-page-active='true'][data-testid]")).map((node) =>
          node
            .getAttribute("data-testid")
            ?.replace("rebalance-embedded-workspace-tool-", "")
            ?.replace("rebalance-embedded-nav-", "")
            ?.replace("rebalance-embedded-secondary-nav-", "")
            ?.replace("rebalance-embedded-utility-nav-", "") ?? "",
        ).filter(Boolean),
        pageTitle: pageTitle instanceof HTMLElement ? pageTitle.innerText.trim() : "",
        slotCount: document.querySelectorAll(".task-swap-slot").length,
        sourceCount: document.querySelectorAll(".task-swap-source-card").length,
        badgeLabels,
        hasInspectingBadge: badgeLabels.includes("Inspecting"),
        hasMeaningfulBadge: badgeLabels.some((label) =>
          ["Recommended", "Best match", "Compatible", "Same character", "Changed"].includes(label),
        ),
        hasSummaryActions: document.querySelectorAll(".task-swap-summary-actions button, .task-swap-summary-actions [role='button']").length >= 2,
        hasSourceDetailCard: Boolean(document.querySelector(".task-swap-source-detail-card")),
        hasEmptyState: /no swap slots|no exported sources|open one character swap file/i.test(pageBodyText),
        sourceListRect: pickRect(sourceList),
        sourceResultsRect: pickRect(sourceResults),
        sourceShellRect: pickRect(sourceShell),
        sourceBodyRect: pickRect(sourceBody),
        sourceListStyle: pickStyle(sourceList, ["display", "gap", "height", "max-height", "overflow-y", "content-visibility", "contain-intrinsic-size"]),
        sourceResultsStyle: pickStyle(sourceResults, ["display", "grid-template-rows", "height", "min-height", "overflow"]),
        internalScrollables,
        sourceCards: sourceCards.map((card) => ({
          text: card.textContent?.trim().slice(0, 160) ?? "",
          rect: pickRect(card),
          style: pickStyle(card, ["display", "height", "min-height", "overflow", "position", "padding-top", "padding-bottom"]),
        })),
      };
    });
    if (
      swapState.documentX ||
      swapState.activePage.length !== 1 ||
      swapState.activePage[0] !== "swap" ||
      !swapState.pageTitle ||
      /choose a character/i.test(swapState.pageTitle) ||
      swapState.slotCount < 1 ||
      swapState.sourceCount < 1 ||
      swapState.hasEmptyState ||
      !swapState.hasInspectingBadge ||
      !swapState.hasMeaningfulBadge ||
      !swapState.hasSummaryActions ||
      !swapState.hasSourceDetailCard ||
      swapState.internalScrollables.length > 0
    ) {
      throw new Error(`Embedded swap workspace regressed for ${viewport.label}: ${JSON.stringify(swapState)}`);
    }
    await writeFile(
      path.join(artifactDir, `real-exe-tools-swap-${viewport.label}-${viewport.width}x${viewport.height}.json`),
      `${JSON.stringify(swapState, null, 2)}\n`,
      "utf8",
    );

    await clickEmbeddedWorkspaceTool(frame, "custom");
    await frame.waitForFunction(() => {
      const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
      const pageRoot = document.querySelector('[data-testid="rebalance-page-custom"]');
      const stepPills = document.querySelectorAll(".task-create-guided-strip .task-step-pill");
      return Boolean(
        root instanceof HTMLElement &&
        root.dataset.page === "custom" &&
        pageRoot instanceof HTMLElement &&
        stepPills.length >= 5,
      );
    }, { timeout: 30_000 });
    await page.waitForTimeout(viewport.label === "narrow" ? 900 : 450);
    await screenshot(page, `real-exe-tools-create-${viewport.label}-${viewport.width}x${viewport.height}.png`);
    await expectEmbeddedVisualAudit(frame, viewport, '[data-testid="rebalance-page-custom"]', "create");
    if (viewport.label === "wide") {
      await assertEmbeddedResizeStable(page, frame, "create", '[data-testid="rebalance-page-custom"]', "custom");
    }

    const createState = await frame.evaluate(() => {
      const root = document.documentElement;
      const pageTitle = document.querySelector(".task-header .task-title");
      const pageBodyText = document.body.innerText;
      const stepLabels = Array.from(document.querySelectorAll(".task-create-guided-strip .task-step-pill")).map((node) => {
        const ariaLabel = node.getAttribute("aria-label");
        const title = node.getAttribute("title");
        const visibleText = node.textContent;
        return `${ariaLabel ?? ""} ${title ?? ""} ${visibleText ?? ""}`.trim();
      });
      return {
        documentX: root.scrollWidth > root.clientWidth + 4,
        activePage: Array.from(document.querySelectorAll("[data-page-active='true'][data-testid]")).map((node) =>
          node
            .getAttribute("data-testid")
            ?.replace("rebalance-embedded-workspace-tool-", "")
            ?.replace("rebalance-embedded-nav-", "")
            ?.replace("rebalance-embedded-secondary-nav-", "")
            ?.replace("rebalance-embedded-utility-nav-", "") ?? "",
        ).filter(Boolean),
        pageTitle: pageTitle instanceof HTMLElement ? pageTitle.innerText.trim() : "",
        stepCount: document.querySelectorAll(".task-create-guided-strip .task-step-pill").length,
        stepLabels,
        hasPreview: Boolean(document.querySelector(".task-workspace-preview--create .game-card-shell")),
        templateSrc: document.querySelector(".task-workspace-preview--create .task-inspect-card-template") instanceof HTMLImageElement
          ? document.querySelector(".task-workspace-preview--create .task-inspect-card-template").currentSrc
          : "",
        hasPreviewLead: Boolean(document.querySelector(".task-workspace-preview--create .task-preview-lead")),
        hasNameAndArt: stepLabels.some((label) => /name and art|basics/i.test(label)) || /name and art|basics/i.test(pageBodyText),
        hasAddBlocks: stepLabels.some((label) => /add blocks|blocks/i.test(label)) || /add blocks|blocks/i.test(pageBodyText),
        hasCardText: stepLabels.some((label) => /card text|text/i.test(label)) || /card text|text/i.test(pageBodyText),
        hasExtraValues: stepLabels.some((label) => /extra values|values/i.test(label)) || /extra values|values/i.test(pageBodyText),
        hasPlacement: stepLabels.some((label) => /placement|place/i.test(label)) || /placement|place/i.test(pageBodyText),
      };
    });
    if (
      createState.documentX ||
      createState.activePage.length !== 1 ||
      createState.activePage[0] !== "custom" ||
      createState.stepCount < 5 ||
      !createState.hasPreview ||
      !/inspect-card-template/i.test(createState.templateSrc) ||
      !createState.hasNameAndArt ||
      !createState.hasAddBlocks ||
      !createState.hasCardText ||
      !createState.hasExtraValues ||
      !createState.hasPlacement
    ) {
      throw new Error(`Embedded create workspace regressed for ${viewport.label}: ${JSON.stringify(createState)}`);
    }
    await writeFile(
      path.join(artifactDir, `real-exe-tools-create-${viewport.label}-${viewport.width}x${viewport.height}.json`),
      `${JSON.stringify(createState, null, 2)}\n`,
      "utf8",
    );

    await clickEmbeddedWorkspaceTool(frame, "packs");
    await frame.waitForFunction(() => {
      const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
      const pageRoot = document.querySelector('[data-testid="rebalance-packs-embedded"]');
      const pageBodyText = document.body.innerText;
      return Boolean(
        root instanceof HTMLElement &&
        root.dataset.page === "packs" &&
        pageRoot instanceof HTMLElement &&
        /installed/i.test(pageBodyText) &&
        /import/i.test(pageBodyText) &&
        /export/i.test(pageBodyText),
      );
    }, { timeout: 30_000 });
    await page.waitForTimeout(viewport.label === "narrow" ? 850 : 400);
    await screenshot(page, `real-exe-tools-packs-${viewport.label}-${viewport.width}x${viewport.height}.png`);
    await expectEmbeddedVisualAudit(frame, viewport, '[data-testid="rebalance-packs-embedded"]', "packs", { maxChromeDepth: 4 });
    if (viewport.label === "wide") {
      await assertEmbeddedResizeStable(page, frame, "packs", '[data-testid="rebalance-packs-embedded"]', "packs");
    }

    const packsState = await frame.evaluate(() => {
      const packsRoot = document.querySelector('[data-testid="rebalance-packs-embedded"]');
      const pageBodyText = packsRoot instanceof HTMLElement ? packsRoot.innerText : "";
      return {
        hasEmbeddedRoot: Boolean(packsRoot),
        activePage: Array.from(document.querySelectorAll("[data-page-active='true'][data-testid]")).map((node) =>
          node
            .getAttribute("data-testid")
            ?.replace("rebalance-embedded-workspace-tool-", "")
            ?.replace("rebalance-embedded-nav-", "")
            ?.replace("rebalance-embedded-secondary-nav-", "")
            ?.replace("rebalance-embedded-utility-nav-", "") ?? "",
        ).filter(Boolean),
        text: pageBodyText,
      };
    });
    if (
      !packsState.hasEmbeddedRoot ||
      packsState.activePage.length !== 1 ||
      packsState.activePage[0] !== "packs" ||
      !/installed/i.test(packsState.text) ||
      !/import/i.test(packsState.text) ||
      !/export/i.test(packsState.text)
    ) {
      throw new Error(`Embedded packs flow regressed for ${viewport.label}: ${JSON.stringify(packsState)}`);
    }

    await clickEmbeddedDrawerTool(frame, "rebalance-embedded-utility-nav", "tutorial");
    await frame.waitForFunction(() => {
      const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
      const pageRoot = document.querySelector('[data-testid="rebalance-tutorial-embedded"]');
      return Boolean(root instanceof HTMLElement && root.dataset.page === "tutorial" && pageRoot instanceof HTMLElement);
    }, { timeout: 30_000 });
    await page.waitForTimeout(viewport.label === "narrow" ? 850 : 350);
    await screenshot(page, `real-exe-tools-help-${viewport.label}-${viewport.width}x${viewport.height}.png`);
    await expectEmbeddedVisualAudit(frame, viewport, '[data-testid="rebalance-tutorial-embedded"]', "help");
    if (viewport.label === "wide") {
      await assertEmbeddedResizeStable(page, frame, "help", '[data-testid="rebalance-tutorial-embedded"]', "tutorial");
    }

    const helpState = await frame.evaluate(() => {
      const tutorialRoot = document.querySelector('[data-testid="rebalance-tutorial-embedded"]');
      const text = tutorialRoot instanceof HTMLElement ? tutorialRoot.innerText : "";
      return {
        hasEmbeddedRoot: Boolean(tutorialRoot),
        text,
      };
    });
    if (
      !helpState.hasEmbeddedRoot ||
      !/quick launcher|change|game mode|create|packs/i.test(helpState.text)
    ) {
      throw new Error(`Embedded help flow regressed for ${viewport.label}: ${JSON.stringify(helpState)}`);
    }

    await clickEmbeddedDrawerTool(frame, "rebalance-embedded-utility-nav", "settings");
    await frame.waitForFunction(() => {
      const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
      const pageRoot = document.querySelector('[data-testid="rebalance-settings-embedded"]');
      return Boolean(root instanceof HTMLElement && root.dataset.page === "settings" && pageRoot instanceof HTMLElement);
    }, { timeout: 30_000 });
    await page.waitForTimeout(viewport.label === "narrow" ? 850 : 350);
    await screenshot(page, `real-exe-tools-settings-${viewport.label}-${viewport.width}x${viewport.height}.png`);
    await expectEmbeddedVisualAudit(frame, viewport, '[data-testid="rebalance-settings-embedded"]', "settings");
    if (viewport.label === "wide") {
      await assertEmbeddedResizeStable(page, frame, "settings", '[data-testid="rebalance-settings-embedded"]', "settings");
    }
    const settingsState = await frame.evaluate(() => {
      const settingsRoot = document.querySelector('[data-testid="rebalance-settings-embedded"]');
      const buttons = Array.from(document.querySelectorAll("button")).map((button) => button.textContent?.trim() ?? "");
      return {
        hasEmbeddedRoot: Boolean(settingsRoot),
        hasBrowseButton: buttons.includes("Browse"),
        hasUseFolderButton: buttons.includes("Use this folder"),
        text: settingsRoot instanceof HTMLElement ? settingsRoot.innerText : "",
      };
    });
    if (
      !settingsState.hasEmbeddedRoot ||
      settingsState.hasBrowseButton ||
      settingsState.hasUseFolderButton ||
      !/maintenance/i.test(settingsState.text)
    ) {
      throw new Error(`Embedded settings regressed into standalone setup mode for ${viewport.label}: ${JSON.stringify(settingsState)}`);
    }

    await clickEmbeddedDrawerTool(frame, "rebalance-embedded-utility-nav", "tutorial");
    await frame.waitForFunction(() => {
      const root = document.querySelector('[data-testid="rebalance-embedded-root"]');
      const pageRoot = document.querySelector('[data-testid="rebalance-tutorial-embedded"]');
      return Boolean(root instanceof HTMLElement && root.dataset.page === "tutorial" && pageRoot instanceof HTMLElement);
    }, { timeout: 30_000 });
    const tutorialState = await frame.evaluate(() => {
      const tutorialRoot = document.querySelector('[data-testid="rebalance-tutorial-embedded"]');
      return {
        hasEmbeddedRoot: Boolean(tutorialRoot),
        text: tutorialRoot instanceof HTMLElement ? tutorialRoot.innerText : "",
      };
    });
    if (
      !tutorialState.hasEmbeddedRoot ||
      /confirm the game folder once/i.test(tutorialState.text) ||
      !/3-step flow/i.test(tutorialState.text) ||
      !/utilities/i.test(tutorialState.text)
    ) {
      throw new Error(`Embedded tutorial still shows standalone-first copy for ${viewport.label}: ${JSON.stringify(tutorialState)}`);
    }
    await expectProfileContext(frame, preferredInstance, viewport.label);
  });
}

async function expectProfileContext(frame, preferredInstance, viewportLabel) {
  if (!preferredInstance) {
    return;
  }
  const sessionText = await frame.evaluate(() => {
    const meta = document.querySelector(".rebalance-workspace-topbar-meta strong");
    return meta instanceof HTMLElement ? meta.innerText.trim() : "";
  });
  if (!sessionText.includes(preferredInstance.profileName) && !sessionText.includes(preferredInstance.gameVersion)) {
    throw new Error(`Embedded profile context does not match selected profile for ${viewportLabel}: ${sessionText}`);
  }
}

async function captureNonToolsFlow(packagedExe, harnessUrl, viewport) {
  const tasks = [
    { workspace: "instances", selector: '[data-testid="instances-workspace"]', file: `real-exe-instances-${viewport.label}-${viewport.width}x${viewport.height}.png` },
    { workspace: "launch", selector: '[data-testid="launch-workspace"]', file: `real-exe-launch-${viewport.label}-${viewport.width}x${viewport.height}.png` },
    { workspace: "settings", selector: '[data-testid="settings-workspace"]', file: `real-exe-settings-${viewport.label}-${viewport.width}x${viewport.height}.png` },
  ];

  for (const task of tasks) {
    await withPackagedPage(packagedExe, `${harnessUrl}?preset=messy-real&workspace=${task.workspace}`, viewport, async page => {
      await page.waitForSelector(task.selector);
      await screenshot(page, task.file);
    });
  }
}

async function captureToolsFlowWithAvailableData(packagedExe, harnessUrl, viewport, preferredInstance) {
  if (preferredInstance) {
    console.log(`packaged-real-smoke: local tools ${viewport.label} ${viewport.width}x${viewport.height}`);
    await captureRealToolsFlow(packagedExe, viewport, preferredInstance);
    return;
  }

  console.log(
    `packaged-real-smoke: harness tools ${viewport.label} ${viewport.width}x${viewport.height} ` +
      "(no local BAPBAPBalanceMod.dll profile found)",
  );
  await captureToolsFlow(packagedExe, harnessUrl, viewport);
}

async function main() {
  const packagedExe = await resolvePackagedExe();
  await cleanupPlaywrightTempProfiles();
  await rm(artifactDir, { recursive: true, force: true });
  await mkdir(artifactDir, { recursive: true });
  const preferredToolsInstance = await seedPackagedUserDataDir();

  const harnessPort = await reservePort();
  const harnessUrl = `http://127.0.0.1:${harnessPort}/harness.html`;
  const harnessProcess = spawnHarnessServer(harnessPort);

  try {
    await waitForHarness(`${harnessUrl}?workspace=tools`);
    await prewarmRebalanceRoute(harnessUrl);
    await new Promise(resolve => setTimeout(resolve, 1_500));

    for (const viewport of viewports) {
      await captureDirectRebalanceEffectPicker(harnessUrl, viewport);
      await captureToolsFlowWithAvailableData(packagedExe, harnessUrl, viewport, preferredToolsInstance);
      if (!toolsOnly) {
        console.log(`packaged-real-smoke: core workspaces ${viewport.label} ${viewport.width}x${viewport.height}`);
        await captureNonToolsFlow(packagedExe, harnessUrl, viewport);
      }
    }
  } finally {
    await rm(packagedSmokeUserDataDir, { recursive: true, force: true }).catch(() => undefined);
    if (process.platform === "win32" && harnessProcess.pid) {
      try {
        execSync(`cmd.exe /d /s /c "taskkill /PID ${harnessProcess.pid} /T /F >nul 2>nul"`, {
          cwd: appDir,
          stdio: "ignore",
        });
      } catch {
        // ignore
      }
    } else {
      harnessProcess.kill("SIGTERM");
    }
  }
}

await main().catch(error => {
  console.error(error?.stack || error);
  process.exit(1);
});
