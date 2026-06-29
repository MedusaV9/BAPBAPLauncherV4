import type { StringKey } from "./en";

// French translations. Missing keys fall back to English.
// NOTE: AI-generated — see the in-app warning in Settings.
const fr: Partial<Record<StringKey, string>> = {
    "nav.instances": "Instances",
    "nav.mods": "Mods",
    "nav.launch": "Démarrer",
    "nav.radio": "Radio",
    "nav.tools": "Outils",
    "nav.settings": "Paramètres",

    "common.cancel": "Annuler",
    "common.save": "Enregistrer",
    "common.close": "Fermer",
    "common.retry": "Réessayer",
    "common.loading": "Chargement…",

    "settings.group.updates": "Mises à jour",
    "settings.group.launch": "Lancement",
    "settings.group.storage": "Stockage",
    "settings.group.manifest": "Source du manifeste",
    "settings.group.motion": "Mouvement et effets",
    "settings.group.display": "Affichage",
    "settings.group.language": "Langue",
    "settings.group.startupWindow": "Démarrage et fenêtre",
    "settings.group.security": "Sécurité et outils",
    "settings.group.migration": "Migration",

    "settings.language.label": "Langue",
    "settings.language.description": "Choisissez la langue d'affichage du launcher.",
    "settings.language.aiWarning":
        "Les traductions sont réalisées par IA. Si vous trouvez des erreurs, signalez-les sur le Discord.",

    "settings.rift.label": "Animation d'ouverture de faille",
    "settings.rift.description":
        "Fissure l'écran et fait émerger le launcher d'une faille au démarrage.",
    "settings.tray.label": "Réduire dans la barre d'état au lieu de fermer",
    "settings.tray.description":
        "À la fermeture, la fenêtre continue de tourner dans la barre d'état système. Clic droit sur l'icône pour quitter.",

    "settings.uiScale.label": "Échelle de l'interface",
    "settings.uiScale.description": "Agrandir ou réduire l'interface.",

    "mods.translationWarning": "La traduction des mods n'est pas une fonctionnalité pour le moment.",
};

export default fr;
