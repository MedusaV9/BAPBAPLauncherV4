import type { StringKey } from "./en";

// Portuguese translations. Missing keys fall back to English.
// NOTE: AI-generated — see the in-app warning in Settings.
const pt: Partial<Record<StringKey, string>> = {
    "nav.instances": "Instâncias",
    "nav.mods": "Mods",
    "nav.launch": "Iniciar",
    "nav.radio": "Rádio",
    "nav.tools": "Ferramentas",
    "nav.settings": "Definições",

    "common.cancel": "Cancelar",
    "common.save": "Guardar",
    "common.close": "Fechar",
    "common.retry": "Tentar novamente",
    "common.loading": "A carregar…",

    "settings.group.updates": "Atualizações",
    "settings.group.launch": "Arranque",
    "settings.group.storage": "Armazenamento",
    "settings.group.manifest": "Origem do manifesto",
    "settings.group.motion": "Movimento e efeitos",
    "settings.group.display": "Visualização",
    "settings.group.language": "Idioma",
    "settings.group.startupWindow": "Arranque e janela",
    "settings.group.security": "Segurança e ferramentas",
    "settings.group.migration": "Migração",

    "settings.language.label": "Idioma",
    "settings.language.description": "Escolha o idioma de apresentação do launcher.",
    "settings.language.aiWarning":
        "As traduções são feitas por IA. Se encontrar erros, comunique-os no Discord.",

    "settings.rift.label": "Animação de abertura da fenda",
    "settings.rift.description":
        "Faz o ecrã estalar e o launcher surgir de uma fenda ao iniciar.",
    "settings.tray.label": "Minimizar para a bandeja ao fechar",
    "settings.tray.description":
        "Ao fechar, a janela continua em execução na bandeja do sistema. Clique com o botão direito no ícone para sair.",

    "settings.uiScale.label": "Escala da interface",
    "settings.uiScale.description": "Tornar a interface maior ou menor.",
};

export default pt;
