import type { StringKey } from "./en";

// German translations. Missing keys fall back to English.
// NOTE: AI-generated — see the in-app warning in Settings.
const de: Partial<Record<StringKey, string>> = {
    "nav.instances": "Instanzen",
    "nav.mods": "Mods",
    "nav.launch": "Start",
    "nav.radio": "Radio",
    "nav.tools": "Werkzeuge",
    "nav.settings": "Einstellungen",

    "common.cancel": "Abbrechen",
    "common.save": "Speichern",
    "common.close": "Schließen",
    "common.retry": "Erneut versuchen",
    "common.loading": "Lädt…",

    "settings.group.updates": "Updates",
    "settings.group.launch": "Start",
    "settings.group.storage": "Speicher",
    "settings.group.manifest": "Manifest-Quelle",
    "settings.group.motion": "Bewegung & Effekte",
    "settings.group.display": "Anzeige",
    "settings.group.language": "Sprache",
    "settings.group.startupWindow": "Start & Fenster",
    "settings.group.security": "Sicherheit & Werkzeuge",
    "settings.group.migration": "Migration",

    "settings.language.label": "Sprache",
    "settings.language.description": "Wähle die Anzeigesprache des Launchers.",
    "settings.language.aiWarning":
        "Übersetzungen werden von KI erstellt. Wenn du Fehler findest, melde sie bitte im Discord.",

    "settings.rift.label": "Riss-Eröffnungsanimation",
    "settings.rift.description":
        "Lässt den Bildschirm aufbrechen und den Launcher beim Start aus einem Riss hervortreten.",
    "settings.tray.label": "Beim Schließen in den Infobereich minimieren",
    "settings.tray.description":
        "Beim Schließen läuft das Fenster im System-Infobereich weiter. Rechtsklick auf das Symbol zum Beenden.",

    "settings.uiScale.label": "UI-Skalierung",
    "settings.uiScale.description": "Mache die Oberfläche größer oder kleiner.",

    "mods.translationWarning": "Mod-Übersetzungen sind derzeit keine Funktion.",
};

export default de;
