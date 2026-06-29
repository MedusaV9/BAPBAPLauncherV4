// English base dictionary — the source of truth for all UI strings.
// Other languages fall back to these keys when a translation is missing.
// Keys are namespaced by surface: nav.*, settings.*, launch.*, etc.
const en = {
    // Top navigation
    "nav.instances": "Instances",
    "nav.mods": "Mods",
    "nav.launch": "Start",
    "nav.radio": "Radio",
    "nav.tools": "Tools",
    "nav.settings": "Settings",

    // Common actions
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.close": "Close",
    "common.retry": "Retry",
    "common.loading": "Loading…",

    // Settings — groups
    "settings.group.updates": "Updates",
    "settings.group.launch": "Launch",
    "settings.group.storage": "Storage",
    "settings.group.manifest": "Manifest source",
    "settings.group.motion": "Motion & effects",
    "settings.group.display": "Display",
    "settings.group.language": "Language",
    "settings.group.startupWindow": "Startup & window",
    "settings.group.security": "Security & tools",
    "settings.group.migration": "Migration",

    // Settings — language
    "settings.language.label": "Language",
    "settings.language.description": "Choose the launcher display language.",
    "settings.language.aiWarning":
        "Translations are made by AI. If you find issues please report them to the Discord.",

    // Settings — startup & window
    "settings.rift.label": "Rift opening animation",
    "settings.rift.description":
        "Crack the screen open and let the launcher emerge from a rift on launch.",
    "settings.tray.label": "Minimize to tray on close",
    "settings.tray.description":
        "Closing the window keeps it running in the system tray. Right-click the tray icon to quit.",

    // Settings — display
    "settings.uiScale.label": "UI scale",
    "settings.uiScale.description": "Make the interface larger or smaller.",

    // Mods
    "mods.translationWarning": "Mod translations are not a feature for the time being.",
} as const;

export type StringKey = keyof typeof en;
export default en;
