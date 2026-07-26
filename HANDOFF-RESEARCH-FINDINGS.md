# HANDOFF — BAPBAP Nexus V4 Research-Findings

**Datum:** 9. Juli 2026  
**Scope:** 10 abgeschlossene Fable-Research-Agents + 1 abgebrochener Main-Bug-Hunt  
**Repo:** `apps/bapbap-launcher-v4` (Root: BAPBAPLauncherV4)  
**Bereits umgesetzt:** [PR #3](https://github.com/Sonic0810/bapbap-nexus-v4/pull/3) (`fix/research-findings-batch`)

---

## 1. Executive Summary

Die Research-Welle hat **~150+ konkrete Befunde** über Bugs, Security, Performance und Code-Qualität geliefert. Drei übergreifende Themen dominieren:

1. **Battle Royale (Bundle-Instanz):** Update-Pipeline im Kern solide, aber End-to-End nicht produktionsreif; UI wich vom gewünschten Stil ab (Tags/Badges statt Grid-Update-Button). **Teilweise gefixt in PR #3.**

2. **Invalidierungs-Sturm:** Vier Agents unabhängig identifiziert — jeder Install-/Update-Progress-Tick (~6–7 Hz) invalidiert React-Query-Caches → volle Ordner-Rescans + `reg.exe`-Spawns + erzwungene Manifest-Refetches. **Teilweise gefixt in PR #3** (nur Terminal-Status).

3. **Vertrauensgrenzen / Security:** Dateisystem-Härtung (Zip-Slip, SHA-256 bei Installern) ist stark; echte Risiken liegen an **ungeprüften Renderer-Inputs** (`manifestUrl`, Rebalance-iframe mit vollem `v2Api`, `bap-audio://` ohne Containment). **Teilweise gefixt** (`manifestUrl`-Host-Allowlist).

**Größte verbleibende Hebel:** Streaming-ZIP-Extraktion (RAM/2-GiB-Cliff), Rebalance-iframe-Sandbox, JSZip → Worker/Stream, Dead-Code-Purge (~5.500 Zeilen), Video-Assets re-encoden (~350 MB).

---

## 2. Bereits gefixt in PR #3

| Fix | Datei(en) | Status |
|-----|-----------|--------|
| `.bapbap-instance.json` nach `applyUpdate` sync | `bundle-update.service.ts` | ✅ |
| Update-Button ins Profil-Grid (Standard-Stil) | `InstancesWorkspace.tsx` | ✅ |
| Gold-Badge + Gold-Update-Button im Hero entfernt | `InstancesWorkspace.tsx` | ✅ |
| Bundle-Karten: nur Titel (keine Version-Zeile) | `InstancesWorkspace.tsx` | ✅ |
| `instancesMigrateFromV3` IPC-Handler | `register-ipc.ts` | ✅ |
| Query-Invalidierung nur bei Terminal-Status | `eventBridge.ts` | ✅ |
| Steam-Registry-Cache 60s | `instance.service.ts` | ✅ |
| `manifestUrl` HTTPS + GitHub-Host-Allowlist | `settings-store.ts` | ✅ |
| Hintergrundvideo pausiert außerhalb Launch-Tab | `LaunchWorkspace.tsx` | ✅ |
| Splash-Minimum 5s → 2s | `AppShell.tsx` | ✅ |

**Tests:** 855/855 grün nach PR #3.

---

## 3. Kritisch / Hoch — Offene Bugs & Security

### 3.1 Security (Agent: IPC/Preload/Security)

| # | Schwere | Titel | Ort | Beschreibung |
|---|---------|-------|-----|--------------|
| S1 | **HIGH** | RCE-Kette via `manifestUrl` + Self-Update | `register-ipc.ts:117`, `settings-store.ts`, `manifest-client.ts:315`, `launcher-updater.service.ts:257-261` | Renderer kann `manifestUrl` setzen → Manifest ohne Host-Allowlist → Self-Update lädt/spawnt Installer. SHA-256 aus attacker-kontrolliertem Manifest = keine Authentizität. Auto-Install default an. **Teilfix:** GitHub-Host-Allowlist auf `settings.set`; Manifest-Fetch selbst noch ohne Allowlist. |
| S2 | **MEDIUM** | `bap-audio://` beliebiger Datei-Lesezugriff | `main.ts:264-273` | Protokoll liefert jede lokale Datei ohne Pfad-/Extension-Prüfung (im Gegensatz zu `fileSrc`). XSS/kompromittierter Renderer → Exfiltration. |
| S3 | **MEDIUM** | Rebalance-Allowlist umgehbar | `RebalanceEmbedPanel.tsx:115`, `rebalance-embed-helpers.ts:10-15` | iframe `sandbox="allow-scripts allow-same-origin"` → gleicher Origin → `window.parent.v2Api` direkt aufrufbar. Allowlist wirkungslos. |
| S4 | **MEDIUM** | Bridge-Containment vertraut `request.workspaceRoot` | `rebalance-backend.service.ts:167-176` | Nested `request.workspaceRoot` vom Aufrufer statt vertrauenswürdigem Root → `.json`-Schreibzugriff außerhalb Workspace. |
| S5 | **LOW/MED** | Keine Sender-Validierung auf IPC | `register-ipc.ts:315-324` | Jeder Frame kann jeden Kanal aufrufen. |
| S6 | **LOW/MED** | Kein `will-navigate`-Guard; `V2_ALLOW_REMOTE_RENDERER` | `main.ts:102-103, 211-217` | Fremd-URL mit vollem Preload möglich. |
| S7 | **LOW/MED** | SHA-256 optional bei Spiel-ZIPs / Mod-Content | `archive-download.service.ts:60-65`, `content.service.ts:409-413` | Fehlender Hash in Manifest = unverifizierter Download. |
| S8 | **LOW** | `diagnosticsReportStartupFatal` DoS | `register-ipc.ts:103-111` | Renderer kann `app.exit(1)` + beliebigen Dialogtext triggern. |

**Solide (keine Findings):** Zip-Slip (3 Implementierungen), Download-Host-Allowlist, SHA-256 bei MelonLoader/Bundles/Installer, ConfigEditor-Containment, ContentService-Pfad-Containment, `shell.openExternal` nur https, Fenster-Härtung.

### 3.2 Battle Royale Update — verbleibend (Agent: Update-Pipeline)

| # | Schwere | Titel | Beschreibung |
|---|---------|-------|--------------|
| BR1 | ~~HIGH~~ | Stale Update-Badge | **GEFIXT in PR #3** — `.bapbap-instance.json` wurde nicht aktualisiert |
| BR2 | **HIGH** | Fehlerzustände unsichtbar | `failed`, `disk-full`, `signature-mismatch` erreichen User nicht zuverlässig in UI |
| BR3 | **HIGH** | Kein Launch↔Update-Ausschluss | Instanz startbar während Update läuft |
| BR4 | **HIGH** | Nicht-atomarer Swap + toter Recovery | Crash mid-swap; `boot()`-Cleanup sucht Backups am falschen Ort |
| BR5 | **MEDIUM** | Parallele Updates / Quit mid-update | Kein globaler Mutex über Instanzen |
| BR6 | **MEDIUM** | `isDownloadable`/`archiveUrl` Gate | Installiertes Bundle kann „unavailable" werden — Verhalten unklar |

**Pipeline-Kern:** buildNumber-Vergleich → Staging-Download (SHA-256 Pflicht) → Backup/Copy-Swap (`Mods` + `UserData/BalanceMod`) — strukturell gut, End-to-End nicht produktionsreif.

### 3.3 Renderer-Bugs (Agent: Renderer/React)

| # | Schwere | Titel | Beschreibung |
|---|---------|-------|--------------|
| R1 | ~~HIGH~~ | Invalidierungs-Sturm | **Teilfix PR #3** — eventBridge nur Terminal |
| R2 | **HIGH** | Radio Same-Track-Advance Stall | Playback hängt bei gleichem Track-Wechsel |
| R3 | **MEDIUM** | Tools-Tab erlaubt Bundle-Instanzen | Sollte gefiltert sein |
| R4 | **MEDIUM** | Manifest-Refresh → stale Mod-Katalog | Cache-Invalidierung unvollständig |
| R5 | **MEDIUM** | Artwork-Fallback klemmt | Radio-UI |
| R6 | **LOW** | Totes FX/Three.js-Subsystem | ~4.700 Zeilen ungenutzt |

---

## 4. Battle Royale — UI (Agent: UI-Konsistenz)

### User-Anforderung
> Nur Titel + Update-Button, gleicher Stil wie andere Instances, keine Tags/Badges neben dem Namen.

### Status nach PR #3
| Punkt | Vorher | Nach PR #3 |
|-------|--------|------------|
| Gold-Badge neben Eyebrow im Hero | ❌ | ✅ entfernt |
| Gold-Update-Button im Hero | ❌ | ✅ entfernt |
| Update-Button im Profil-Grid | ❌ fehlte | ✅ Standard-Stil |
| Version-Zeile bei Bundle-Karte | ❌ | ✅ ausgeblendet |
| Gold-Akzent `#ffb800` | ❌ | ✅ → `#22d3ee` |
| Layers-Fallback-Icon | ❌ | ✅ → Package |
| Rename/Delete bei Bundle | sichtbar | ✅ ausgeblendet |
| `bundle:…` Versionsstring Launch-Tab | ❌ | ⚠️ noch prüfen |
| Update-Fehleranzeige im Grid | ❌ | ⚠️ noch offen |

---

## 5. Performance — Top-Hebel nach Impact

### 5.1 Runtime (höchster Impact)

| # | Impact | Thema | Ort | Konzept |
|---|--------|-------|-----|---------|
| P1 | **HOCH** | App-weite Re-Render-Kaskade | `AppShell` + `useAudioEngine` | Radio-State (~4s/7Hz) rendert alle Workspaces mit → `React.memo` auf Workspaces, Audio-State aus Shell decouplen |
| P2 | **HOCH** | JSZip vollpuffert Archive im RAM | `archive-download.service.ts:106-127`, `bundle.service.ts`, `bundle-update.service.ts` | >2 GiB = `ERR_FS_FILE_TOO_LARGE`; Event-Loop blockiert → Streaming-Extraktion (yauzl/Worker) |
| P3 | **HOCH** | Kein Resume/Range bei Downloads | `archive-download.service.ts:75-91` | Abbruch bei 95% = alles von vorn → `.part` + Range-Requests |
| P4 | **HOCH** | SHA-256 per Re-Read (doppelt/dreifach) | Downloader + `manifest-client-bundle-fetcher.ts:128-144` | Inline-Hashing im Download-Stream |
| P5 | **MED-HOCH** | Video dekodiert bei verstecktem Tab | `LaunchWorkspace.tsx` | **Teilfix PR #3** — Pause bei inactive workspace |
| P6 | **MED-HOCH** | ~350 MB Video-Assets | `launcher-*.mp4` | Re-encode 5–15 MB/Datei; oder on-demand |
| P7 | **MED** | Volume-Slider IPC pro Drag-Tick | `RadioWorkspace.tsx:571` | Draft/Commit-Pattern |
| P8 | **MED** | Radio Full-State-Emit + existsSync-Sturm | `radio.service.ts:681-729` | Delta-Events, Existenz cachen |
| P9 | **MED** | `getById` → voller `list()`-Walk | `instance.service.ts:382-389` | Instanz einmal auflösen, durchreichen |
| P10 | **MED** | Hero Ken-Burns 22s auf 3 Panels | `index.css`, `InstancesWorkspace.tsx` | `animation-play-state: paused` bei Ruhe |
| P11 | **MED** | CTA `box-shadow`-Puls | `index.css:385-405` | Nur `opacity`/`transform` animieren |

### 5.2 Startup & Installer

| # | Impact | Thema | Konzept |
|---|--------|-------|---------|
| P12 | **HOCH** | Splash 5s Minimum | **Teilfix PR #3** → 2s; ideal: an Bootstrap koppeln |
| P13 | **HOCH** | Sync electron-store in Service-Konstruktoren | RadioService baut State vor Fenster → defer |
| P14 | **HOCH** | 31 Runtime-Deps doppelt im Paket | Nur 4 gebraucht → electron-builder prune |
| P15 | **MED** | Sequenzielle Bootstrap-Kette | Parallelisieren (Manifest + Steam) |

### 5.3 Positiv (bereits gut)
- Kein Query-Polling (event-driven)
- Workspaces lazy-loaded
- Three.js nur im Rebalance-Entry, nicht Initial-Chunk
- Download-Progress an Quelle gedrosselt (150ms)
- Video-Backdrop memoized

---

## 6. Code-Qualität & Wartbarkeit (Agent: Code-Qualität)

### Top-5 Refactorings

1. **Dead-Code-Purge + Lint-Gate** — ~4.700 Zeilen FX-Engine (`effects/`, `fx-surface.tsx`), 7 tote Helper, `three`/`@dnd-kit` Dependencies, vestigiale Settings/IPC → `noUnusedLocals` + ESLint in `verify`
2. **Gemeinsame Zip-/Progress-/Error-Utils** — Dreifach-Duplikation in `archive-download`, `bundle`, `bundle-update` → `src/main/utils/zip-extract.ts`
3. **Typisierte IPC-Registrierung** — Kanal→Handler aus `V2Api` ableiten (hätte `migrateFromV3`-Bug verhindert)
4. **Content-State-Vertrag nach `shared/`** — `Record<string, any>` ersetzen; Renderer/Mock auf gleiche Helfer
5. **Harness-Angleichung** — `mock-api.ts` driftet von Produktion (`bundlesRevealed`, State-Key-Casing)

### Weitere Befunde

| Kategorie | Anzahl | Beispiele |
|-----------|--------|-----------|
| Duplizierte Logik | 10 | `ensureDirSafely` 3×, `toErrorMessage` 17×, Progress-Gate 3× |
| Tote IPC-Kanäle | 3 | `settingsUnlockSecretMods`, `settingsRevealBundles`, `bundleRemove` |
| Vestigiale Settings | 6 | `bundlesRevealed`, `leftRailCollapsed`, `debugShowEffectLab`, … |
| Test-Lücken | 5 | `register-ipc.ts`, `useAudioEngine.ts`, `AppShell.tsx` |
| Kein ESLint | — | Strukturelle Ursache für Dead-Code-Wachstum |
| TODO/FIXME | 0 | Sauber; aber irreführende Roadmap-Kommentare in Bundle-Services |

---

## 7. Empfohlene nächste Schritte (priorisiert)

### Sofort (Sprint 1)
1. ✅ ~~PR #3 mergen~~ — Battle Royale Badge, UI, Invalidierung, manifestUrl, Splash, Video
2. **BR2:** Bundle-Update-Fehlerzustände in UI anzeigen (`failed`, `disk-full`, `signature-mismatch`)
3. **BR3:** Launch blockieren während Bundle-Update läuft
4. **S1:** Manifest-Fetch-Host-Allowlist (nicht nur `settings.set`)
5. **S3/S4:** Rebalance-iframe — `allow-same-origin` entfernen oder IPC nicht ins iframe exposen

### Kurzfristig (Sprint 2)
6. **P2:** Streaming-ZIP-Extraktion (kritisch für >2 GiB Archive)
7. **P3/P4:** Resume-Support + Inline-SHA-256
8. **P1:** Workspace-Memoization + Audio-Engine decouplen
9. **BR4:** Atomarer Swap + funktionierender Crash-Recovery
10. **R2:** Radio Same-Track-Advance fixen
11. **S2:** `bap-audio://` Pfad-Containment

### Mittelfristig (Sprint 3)
12. Dead-Code-Purge (~5.500 Zeilen) + ESLint-Gate
13. Video-Assets re-encoden (~350 MB → ~30 MB)
14. electron-builder Dependency-Pruning
15. Typisierte IPC-Registry + Roundtrip-Tests
16. Gemeinsames `zip-extract.ts` + `toErrorMessage.ts`
17. Volume-Slider Draft/Commit
18. Radio Delta-Events statt Full-State
19. Main-Process-Bug-Hunt nachholen (abgebrochen)
20. Harness ↔ Produktion Contract-Tests

---

## 8. Agent-Abdeckungslücken

| Agent | ID | Status | Lücke |
|-------|-----|--------|-------|
| Bug-Hunt Main-Process | `87a9f9a2` | **ABGEBROCHEN** (User) | Core-Services (SettingsStore, InstanceService, ContentService, LaunchService, LauncherUpdaterService, ConfigEditor, Radio) nur teilweise durch IO/Security abgedeckt |
| PR-Fixes (×3) | `702745c6`, `7f4184a1`, `61ab2f18` | **FEHLER** (Billing) | Manuell in PR #3 umgesetzt |

### Abgeschlossene Agents (vollständig)

| Agent | ID | Kernergebnis |
|-------|-----|--------------|
| Renderer/React | `09cf7a70` | 2 HIGH, 5 MED, 8 LOW |
| BR Update-Pipeline | `1bc77ffd` | 14 Befunde, Kern solide / E2E nicht prod-ready |
| BR UI-Konsistenz | `b3aaa839` | 17 Abweichungen dokumentiert |
| Security | `705a1222` | 11 Findings, Zip-Slip/SHA solide |
| React Perf | `e81dbe2e` | Re-Render-Kaskade dominant |
| Effects/GPU | `621c4711` | Video + Ken-Burns + CTA-Puls; FX tot |
| Main IO/IPC | `6be9f1ef` | Radio-Playback Hot-Path, Sync-fs Startup |
| Startup/Size | `b356356b` | 5s Splash, 350 MB Videos, Dep-Bloat |
| Download/Radio | `028ee130` | JSZip RAM, kein Resume, doppeltes Hashing |
| Code-Qualität | `b591d483` | ~5.500 Zeilen Dead Code, 3× Zip-Dup |

---

## 9. Architektur-Referenz (Kurz)

```
Main (Services) ←IPC→ Preload (v2Api) ←→ Renderer (React Query + Zustand)
                              ↓
                    eventBridge.ts (Cache-Invalidierung)
```

**Bundle-Update-Flow:**
```
checkForUpdate (buildNumber) → download staging → SHA-256 → extract → backup Mods/UserData → copy swap → write .bundle-manifest.json + .bapbap-instance.json
```

**Kritische Dateien:**
- `src/main/services/vendored/bundle-update.service.ts`
- `src/main/services/vendored/bundle.service.ts`
- `src/renderer/app/workspaces/InstancesWorkspace.tsx`
- `src/renderer/app/query/eventBridge.ts`
- `src/main/ipc/register-ipc.ts`
- `src/main/main.ts` (Protokolle, Fenster)

---

*Erstellt aus 10 Research-Agent-Läufen. Nächster Bearbeiter: PR #3 reviewen/mergen, dann Sprint-1-Items aus Abschnitt 7.*
