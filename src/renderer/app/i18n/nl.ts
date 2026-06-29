import type { StringKey } from "./en";

// Dutch translations. Missing keys fall back to English.
// NOTE: AI-generated — see the in-app warning in Settings.
const nl: Partial<Record<StringKey, string>> = {
    "nav.instances": "Instanties",
    "nav.mods": "Mods",
    "nav.launch": "Starten",
    "nav.radio": "Radio",
    "nav.tools": "Hulpmiddelen",
    "nav.settings": "Instellingen",

    "common.cancel": "Annuleren",
    "common.save": "Opslaan",
    "common.close": "Sluiten",
    "common.retry": "Opnieuw proberen",
    "common.loading": "Laden…",

    "settings.group.updates": "Updates",
    "settings.group.launch": "Starten",
    "settings.group.storage": "Opslag",
    "settings.group.manifest": "Manifestbron",
    "settings.group.motion": "Beweging en effecten",
    "settings.group.display": "Weergave",
    "settings.group.language": "Taal",
    "settings.group.startupWindow": "Opstarten en venster",
    "settings.group.security": "Beveiliging en hulpmiddelen",
    "settings.group.migration": "Migratie",

    "settings.language.label": "Taal",
    "settings.language.description": "Kies de weergavetaal van de launcher.",
    "settings.language.aiWarning":
        "Vertalingen zijn gemaakt door AI. Als je fouten vindt, meld ze dan op de Discord.",

    "settings.rift.label": "Rift-openingsanimatie",
    "settings.rift.description":
        "Laat het scherm openbarsten en de launcher bij het starten uit een rift tevoorschijn komen.",
    "settings.tray.label": "Bij sluiten minimaliseren naar systeemvak",
    "settings.tray.description":
        "Bij het sluiten blijft het venster actief in het systeemvak. Klik met de rechtermuisknop op het pictogram om af te sluiten.",

    "settings.uiScale.label": "Interfaceschaal",
    "settings.uiScale.description": "Maak de interface groter of kleiner.",

    "mods.translationWarning": "Mod-vertalingen zijn voorlopig geen functie.",
};

export default nl;
