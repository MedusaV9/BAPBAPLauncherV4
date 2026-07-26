# CLAUDE.md — BAPBAP Nexus (V4)

This file provides guidance to Claude Code when working with the BAPBAP Nexus codebase at `apps/bapbap-launcher-v4/` (V4, electron-vite). This is the ACTIVE development target — the legacy V2 (`apps/bapbap-launcher/`, webpack/ERB based) is only relevant for migration contexts.

## Commands (run from project root)

| Command | Action |
|---|---|
| `npm run dev` | Launch Electron with HMR (`electron-vite dev`) |
| `npm run dev:harness` | Standalone Vite dev (browser-only, no Electron) |
| `npm run build` | Build main + preload + renderer + sync rebalance-vendor |
| `npm run build:win` | Full build + Windows NSIS installer via electron-builder |
| `npm run build:linux` | Full build + Linux AppImage/deb via electron-builder |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | `vitest run` (all test files) |
| `npm run verify` | typecheck + test + build |
| `npm run verify:all` | verify + all Playwright smoke tests |
| Single file test | `npx vitest run src/main/services/bundle.service.test.ts` |
| Single test | `npx vitest run -- testNamePattern "should save and load"` |
| Watch mode | `npx vitest` |

**Linux Support**: Full cross-platform (Windows + Linux). Updater now supports AppImage/Linux updates. Windows build remains untouched and unchanged.

## Architecture

### Process Model (Electron 3-layer)

```
Main Process (Node.js)       Preload (contextBridge)        Renderer (React)
  Services (service layer)     v2Api object (V2Api type)     api.ts (Proxy → window.v2Api)
  ipcMain.handle()             ipcRenderer.invoke()          React Query hooks + eventBridge.ts
```

- **contextIsolation: true**, **sandbox: true**, **nodeIntegration: false**
- All IPC through typed channels in `src/shared/ipc.ts` (V2Api interface + IPC_CHANNELS constants)
- Windows are fanned out via `webContents.send()` + `eventBridge.ts` → `queryClient.setQueryData()`

### Source Layout

```
src/
  main/                   Electron main process
    main.ts               Entry: creates window, instantiates services, wires IPC
    ipc/register-ipc.ts   All IPC handler registrations
    services/
      core/               SettingsStoreService, InstanceService, ContentService, LaunchService,
                          LauncherUpdaterService, ConfigEditorService, RadioService
      vendored/           ManifestClient, ArchiveDownloadService, MelonLoaderService,
                          TrustedTimeService, RebalanceBackendService, BundleService,
                          BundleUpdateService, ManifestClientBundleFetcher
    rebalance-vendor/      Vendored Rebalance Studio backend (CJS, synced to dist)
      electron/*.cjs       Backend, shared, catalog, packs (vendored — DO NOT hand-edit)
      default-workspace/   Bundled default Rebalance workspace content
    bundles/               Bundle Instance fallback manifests (boss-rush, etc.)
  preload/
    index.ts               contextBridge.exposeInMainWorld("v2Api", ...)
  renderer/                React frontend
    app/
      shell/               AppShell (root), TopNav, SetupWizard, StartupSplash, UpdateBanner, useBootstrap
      workspaces/          InstancesWorkspace, LaunchWorkspace, ModsWorkspace,
                           RadioWorkspace, SettingsWorkspace, ToolsWorkspace
      query/               React Query hooks, eventBridge, queryClient, queryKeys
      stores/              Zustand stores (useShellStore, useRadioPlayerStore, useToolsStore)
      audio/               Two-deck audio engine (AudioEngine + useAudioEngine hook)
    components/            UI components (brand/, mods/, tools/, ui/)
      ui/dialog.tsx        Radix-based dialog with custom bap-dialog animations
      brand/               BapCard, BapButton, SectionHeading, StatusChip, Row, InputWell
      mods/                ModDetailDialog, ModSetsBar
      tools/               RebalanceEmbedPanel, ConfigEditorPanel
    effects/               Visual effects engine (canvas particles, Three.js, FX tokens)
    helpers/               Business logic (launch-ui, radio-shuffle, instances-ui, bundle-instance,
                           official-version-visibility, launcher-update-ui, unlock-ui)
    harness/               Browser-only test harness with mock API
    styles/
      index.css            Global styles: CSS variables, glass, nav-glass, bap-card, animations,
                           dialog keyframes, grain texture, hero drift
  shared/
    ipc.ts                 V2Api interface, IPC_CHANNELS, AppSettings, BundleSummary, shared types
    manifest.ts            ManifestIndex, OfficialVersionEntry, BundleEntry, InstalledInstance, etc.
    radio.ts               RadioState, RadioPlayback, RadioCollection types
    instances-root.ts      normalizeInstancesRootPath helper
    fx-settings.ts         Locked motion/FX settings preset
    setup.ts               CURRENT_SETUP_VERSION constant
```

### Startup Sequence

1. `app.whenReady()` → instantiate services in dependency order → `registerIpcHandlers(services)`
2. `LauncherUpdaterService.initialize()` — check for pending auto-install
3. `createMainWindow()` → BrowserWindow loads renderer (Vite dev URL or local file)
4. Renderer mounts `AppShell` → `useBootstrap()`: `splash → bootstrap → ready | fatal`
5. `useAudioEngine()` mounted at shell level for continuous radio across workspace switches

### Service Dependency Graph

```
SettingsStoreService ─── ManifestClient ─── TrustedTimeService
                        ├── ArchiveDownloadService ─── InstanceService ─── LaunchService
                        │                           └── ContentService
                        ├── MelonLoaderService
                        ├── RadioService
                        ├── LauncherUpdaterService
                        └── ManifestClientBundleFetcher ─── BundleUpdateService

BundleService (settings + manifests + downloader + melonLoader)
ConfigEditorService (instances only)
RebalanceBackendService (app + instances + launch + settings)
```

### Key Features & Their Flow

**Rebalance Studio**: Vendored iframe app (`rebalance.html`) embedded in Tools tab. IPC bridge via `postMessage` with allowlist (`REBALANCE_ALLOWED_COMMANDS`). Path-containment for security. Bootstrap with `workspaceRoot` from selected instance.

**Radio**: Two-deck HTMLAudioElement engine (crossfade). Backend reads manifest from GitHub, downloads/caches audio locally. Sync button triggers library refresh. Zustand store for UI state, React Query for backend state.

**Bundle Instances**: Third instance type (Battle Royale). Download + extract pipeline with SHA-256 verification, MelonLoader bootstrap. Auto-update via BundleUpdateService. Gated by `isDownloadable` flag (bundle ohne archiveUrl = unavailable).

**Launcher Self-Update**: Checks `manifest/launcher-updates.json` via ManifestClient. Downloads installer, verifies SHA-256, spawns detached NSIS installer, quiets app. Update badge integrated into TopNav as dropdown.

### State Management

- **React Query** — all main-process state (settings, manifests, instances, radio, mods, config)
  - Query keys in `queryKeys.ts`
  - Cache writes via `eventBridge.ts` (subscribes to `onXChanged` IPC events)
- **Zustand** — UI-local state only (shell, radio player UI, tools dialogs)

### Testing

- **Vitest** (unit/integration): files co-located as `*.test.ts(x)`
- **jsdom + @testing-library/react**: component tests
- **Playwright**: E2E smoke tests in `scripts/` directory
- Vitest config force-dedupes React; service tests in Node, component tests in jsdom

### Build Output

```
dist/main/main.cjs          Main process bundle
dist/preload/index.cjs       Preload bundle
dist/renderer/               Renderer (index.html + rebalance.html + assets)
  assets/launcher-*.mp4      Background videos for Start tab (~350 MB total)
release/                     Electron-builder output (NSIS installer, win-unpacked)
```

Post-build `sync:rebalance-vendor` copies `rebalance-vendor/` and `bundles/` into `dist/main/`.

### Key Conventions

- **ES Modules** everywhere (`"type": "module"`)
- **Strict TypeScript** in `tsconfig.json`
- **`@/` path alias** → `src/renderer/` (renderer only; main process uses relative)
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin
- **Constructor injection** for service dependencies in main process
- **IPC channel names** use `v2.` prefix
- **Env vars:** `V2_BUILD_TIMESTAMP`, `V2_USER_DATA_DIR`, `V2_ALLOW_MULTI_INSTANCE_FOR_TESTS`, `V2_DISABLE_DEVTOOLS`, `V2_ALLOW_REMOTE_RENDERER`, `V2_TOOLS_UNLOCK_CODE_SHA256`, `V2_BUNDLE_REVEAL_CODE_SHA256`
- **Bundles are gated by `archiveUrl`** on the remote manifest (no archiveUrl = unavailable/placeholder)
- **`manifest/` at repo root** is the source of truth for all update manifests (not in the app source)
