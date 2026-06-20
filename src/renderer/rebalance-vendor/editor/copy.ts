/**
 * Canonical user-facing copy for Rebalance Studio.
 *
 * Phase 3 Task 10 — Single source of truth for labels, search placeholders,
 * helper text, and CTA copy. Addresses agent-19-copy-audit findings:
 *
 * - Inconsistent labels (Add vs Library, Help vs Tutorial vs Tour)
 * - "Find one X..." search placeholders
 * - Implementation details exposed (BAPBAPBalanceMod.dll, "embedded shell")
 * - Coaching helper text repeats
 * - "Receipts" non-standard term → "Import history"
 * - Game Mode abstract labels
 *
 * Rules:
 * - Verb + Object button labels: "Open Help", "Install Rebalance", "Search files"
 * - One noun per concept across the whole tool: file, block, value, collection, pack
 * - One canonical name per page; rail label === dashboard CTA === help link
 * - Hide implementation details (file paths, internal subsystems) behind disclosures
 * - Helper text: max 1 sentence unless action is destructive
 *
 * The scanner script `apps/bapbap-launcher/scripts/audit-copy.mjs` enforces
 * forbidden phrases.
 */

/* ============================================================================
   Canonical Page Names
   ============================================================================ */
export const PAGE_NAMES = {
  dashboard: "Home",
  editor: "Change",
  gamemode: "Game Mode",
  swap: "Swap",
  custom: "Create",
  library: "Add from Library",
  remove: "Remove",
  packs: "Packs",
  tutorial: "Help",
  settings: "Settings",
} as const;

/* ============================================================================
   Page Open Verbs (rail / dashboard CTAs / help links)
   ============================================================================ */
export const OPEN_VERBS = {
  dashboard: "Open Home",
  editor: "Open Change",
  gamemode: "Open Game Mode",
  swap: "Open Swap",
  custom: "Open Create",
  library: "Open Add from Library",
  remove: "Open Remove",
  packs: "Open Packs",
  tutorial: "Open Help",
  settings: "Open Settings",
} as const;

/* ============================================================================
   Search Placeholders — direct, never "Find one X..."
   ============================================================================ */
export const SEARCH_PLACEHOLDERS = {
  files: "Search files",
  sources: "Search sources",
  drafts: "Search drafts",
  augments: "Search augments",
  characters: "Search by character, slot, or name",
  effects: "Search HP, damage, zone, poison",
  packs: "Search packs",
  templates: "Search templates",
  collections: "Search collections",
  global: "Search anything (Ctrl+K)",
  values: "Search values",
} as const;

/* ============================================================================
   Empty / Recovery States
   ============================================================================ */
export const EMPTY_STATES = {
  noResults: "No matches yet.",
  noFilesMatch: "No files match your search.",
  clearSearch: "Clear search",
  showAllFiles: "Show all files",
  showAllValues: "Show all values",
  noEntriesYet: "No entries yet.",
  noHistoryYet: "No history yet — make some changes to see them here.",
} as const;

/* ============================================================================
   Common CTAs — verb + object
   ============================================================================ */
export const CTA = {
  // Saves & writes
  save: "Save",
  saveChanges: "Save changes",
  saveAndApply: "Save and apply",
  reload: "Reload",
  resetAll: "Reset all",
  resetSelected: "Reset selected",
  revert: "Revert",
  undo: "Undo",
  redo: "Redo",
  // Navigation
  back: "Back",
  cancel: "Cancel",
  close: "Close",
  done: "Done",
  // Power user
  copy: "Copy",
  copyValues: "Copy values",
  copyToClipboard: "Copy to clipboard",
  paste: "Paste",
  applyPreset: "Apply preset",
  applyDiff: "Apply diff",
  // File / browse
  browse: "Browse",
  changeFile: "Change file",
  selectFile: "Select file",
  openInExplorer: "Open in Explorer",
  // Pack workflow
  importPack: "Import pack",
  exportPack: "Export pack",
  installNow: "Install now",
  stageForLaunch: "Stage for next launch",
  importHistory: "Import history",
  // Ready / repair
  retry: "Retry",
  install: "Install Rebalance",
  installToProfile: "Install to this profile",
  openProfileFolder: "Open profile folder",
  verifyProfile: "Verify profile",
  showRequirement: "Show requirement",
  howToUnlock: "How to unlock",
  // Help / tour
  startTour: "Start tour",
  resumeTour: "Resume tour",
  skipTour: "Skip tour",
  // Compare
  compareWith: "Compare with…",
  pinSearch: "Pin search",
  // Multi-select
  selectMultiple: "Select multiple",
  selectAll: "Select all",
  deselectAll: "Deselect all",
} as const;

/* ============================================================================
   Status / Progress copy — plain user-facing, never internal
   ============================================================================ */
export const STATUS = {
  // Loading
  opening: "Opening Rebalance",
  loadingProfile: "Checking the selected profile",
  loadingData: "Loading editor data",
  saving: "Saving",
  saved: "Saved",
  reloading: "Reloading",
  // Errors
  couldNotOpen: "Could not open Rebalance",
  couldNotLoad: "Could not load this file",
  connectionLost: "Connection lost",
  // Save outcomes
  savedSuccessfully: "Saved successfully.",
  savedWithBackup: "Saved successfully. A backup was created automatically.",
  appliedNow: "Changes applied.",
  willApplyNextLaunch: "Restart required to apply.",
  willApplyAfterReload: "Reload required to apply.",
} as const;

/* ============================================================================
   Readiness Gate copy — Phase 3 Task 3
   ============================================================================ */
export const READINESS = {
  // Title — frames the action, not the error
  installTitle: "Install Rebalance to open this tool",
  installBody: "This tool opens after the Rebalance mod is installed in this profile.",
  // Sub-states
  errorTitle: "Could not check Rebalance",
  errorBody: "We hit an unexpected error while checking this profile. Try retrying, or check the launcher logs.",
  checkingTitle: "Checking your profile…",
  checkingBody: "Verifying the Rebalance mod, runtime exports, and write access in this profile.",
  // Sub-checks
  checks: {
    dll: "Rebalance mod installed",
    workspace: "Profile workspace ready",
    runtime: "Runtime data exported",
    write: "Workspace is writable",
  },
  // Implementation detail (only shown behind disclosure)
  technicalRequirement: "Mods\\BAPBAPBalanceMod.dll inside the selected profile's instance folder.",
} as const;

/* ============================================================================
   Embedded host status copy — Phase 3 Task 2
   ============================================================================ */
export const EMBEDDED_HOST = {
  loading: "Opening Rebalance",
  loadingDetail: "Reading the selected profile and loading editor data.",
  errorTitle: "Could not open Rebalance",
  connectionLost: "Connection lost — Rebalance is not responding.",
  retryRequest: "Retry",
  reloadShell: "Reload Rebalance",
  openLogs: "Open logs",
} as const;

/* ============================================================================
   Bootstrap warning copy — Phase 3 Task 1
   ============================================================================ */
export const BOOTSTRAP_WARNINGS = {
  radioUnavailable: "Radio unavailable",
  trustedTimeUnavailable: "Trusted time unavailable",
  packageCatalogUnavailable: "Package catalog unavailable",
  manifestsUnavailable: "Game versions unavailable",
  buildInfoUnavailable: "Build info unavailable",
  // Generic
  retry: "Retry",
  dismiss: "Dismiss",
} as const;

/* ============================================================================
   Section / Accordion titles — action-led, not abstract
   ============================================================================ */
export const SECTION_TITLES = {
  // Editor / Change
  quickEdit: "Quick edit",
  cardArt: "Card art",
  presentation: "Presentation",
  advanced: "Behavior and advanced",
  overrideMap: "Override map",
  needAnotherField: "Need another field?",
  fieldSummary: "Field summary",
  jumpToField: "Find a field",
  // Game Mode
  chooseAFile: "Choose a file",
  whyHidden: "Why this page hides some fields",
  searchAugments: "Search augments",
  // Add Library
  chooseFile: "Choose a file",
  addBlock: "Add a block",
  copyValue: "Copy a value",
  collections: "Collections",
  // Custom Builder
  startNameIcon: "Start with the name and icon.",
  add12Blocks: "Add 1–2 blocks.",
  addMoreOnlyIfNeeded: "Add more blocks only if needed.",
  // Packs
  packDetails: "Pack details and save location",
  importHistory: "Import history",
  // Settings
  workspaceFolders: "Workspace folders",
  themePreview: "Theme preview",
  appearance: "Appearance",
  motion: "Motion",
  // Dashboard
  editExisting: "Edit existing values",
  otherWorkflows: "Other workflows",
  workspaceBackups: "Workspace and backups",
  quickTools: "Quick tools",
  helpAndWalkthrough: "Help and walkthrough",
} as const;

/* ============================================================================
   Field provenance badges (Phase 3 Task 5)
   ============================================================================ */
export const PROVENANCE = {
  quick: "Quick",
  simple: "Simple",
  advanced: "Advanced",
  override: "Override",
} as const;

/* ============================================================================
   Smart filter chips (Phase 3 Task 16)
   ============================================================================ */
export const SMART_FILTERS = {
  modifiedOnly: "Modified only",
  hasOverrides: "Has overrides",
  recentlyChanged: "Recently changed",
  hasIcon: "Has icon",
  emptyValues: "Empty values",
} as const;

/* ============================================================================
   Confirmation dialogs (Phase 3 Task 11)
   ============================================================================ */
export const CONFIRM = {
  resetAll: {
    title: "Reset all values in this file?",
    body: "Every override on this file will be removed. The standard values from the runtime document will be restored.",
    confirm: "Reset all values",
    cancel: "Cancel",
  },
  applyDiff: {
    title: "Apply this diff to the current file?",
    body: "The selected differences will be merged into your current overrides.",
    confirm: "Apply diff",
    cancel: "Cancel",
  },
  discardChanges: {
    title: "Discard unsaved changes?",
    body: "Your unsaved edits to this file will be lost.",
    confirm: "Discard changes",
    cancel: "Keep editing",
  },
} as const;

/* ============================================================================
   Forbidden phrases — enforced by audit-copy.mjs
   ============================================================================ */
export const FORBIDDEN_PHRASES: readonly string[] = [
  "Find one ", // bad search placeholder
  "Receipts", // use "Import history" instead
  "BAPBAPBalanceMod.dll", // implementation detail — keep behind <details>
  "embedded shell", // technical wording — use "Rebalance"
  "syncing the editor workspace", // technical wording
  "View requirement", // weak; use "Show requirement"
];

/* ============================================================================
   Toast templates (Phase 3 Tasks 13, 14, 15, 16)
   ============================================================================ */
export const TOASTS = {
  fieldsReverted: (count: number) => `${count} ${count === 1 ? "field" : "fields"} reverted.`,
  fieldsCopied: (count: number) => `${count} ${count === 1 ? "value" : "values"} copied to clipboard.`,
  searchPinned: (query: string) => `Pinned search: ${query}`,
  searchUnpinned: "Search removed.",
  diffApplied: (count: number) => `${count} ${count === 1 ? "change" : "changes"} applied.`,
  workspaceFoldersCreated: "Workspace folders created.",
  historyJumped: "Restored to selected history point.",
  themeApplied: (themeName: string) => `Theme: ${themeName}`,
  presetReordered: "Preset order updated.",
} as const;

/* ============================================================================
   Type-safe accessor helpers
   ============================================================================ */
export type PageKey = keyof typeof PAGE_NAMES;
export type SearchPlaceholderKey = keyof typeof SEARCH_PLACEHOLDERS;
export type CTAKey = keyof typeof CTA;
export type StatusKey = keyof typeof STATUS;
