import type { StringKey } from "./en";

// Spanish translations. Missing keys fall back to English.
// NOTE: AI-generated — see the in-app warning in Settings.
const es: Partial<Record<StringKey, string>> = {
    "nav.instances": "Instancias",
    "nav.mods": "Mods",
    "nav.launch": "Iniciar",
    "nav.radio": "Radio",
    "nav.tools": "Herramientas",
    "nav.settings": "Ajustes",

    "common.cancel": "Cancelar",
    "common.save": "Guardar",
    "common.close": "Cerrar",
    "common.retry": "Reintentar",
    "common.loading": "Cargando…",

    "settings.group.updates": "Actualizaciones",
    "settings.group.launch": "Inicio",
    "settings.group.storage": "Almacenamiento",
    "settings.group.manifest": "Origen del manifiesto",
    "settings.group.motion": "Movimiento y efectos",
    "settings.group.display": "Pantalla",
    "settings.group.language": "Idioma",
    "settings.group.startupWindow": "Inicio y ventana",
    "settings.group.security": "Seguridad y herramientas",
    "settings.group.migration": "Migración",

    "settings.language.label": "Idioma",
    "settings.language.description": "Elige el idioma de la interfaz del launcher.",
    "settings.language.aiWarning":
        "Las traducciones están hechas por IA. Si encuentras errores, repórtalos en el Discord.",

    "settings.rift.label": "Animación de apertura de grieta",
    "settings.rift.description":
        "Resquebraja la pantalla y deja que el launcher emerja de una grieta al iniciar.",
    "settings.tray.label": "Minimizar a la bandeja al cerrar",
    "settings.tray.description":
        "Al cerrar la ventana, esta sigue ejecutándose en la bandeja del sistema. Haz clic derecho en el icono de la bandeja para salir.",

    "settings.uiScale.label": "Escala de la interfaz",
    "settings.uiScale.description": "Agranda o reduce la interfaz.",

    "mods.translationWarning": "Las traducciones de mods no son una función por el momento.",
};

export default es;
