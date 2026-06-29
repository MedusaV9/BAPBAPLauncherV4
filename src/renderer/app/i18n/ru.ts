import type { StringKey } from "./en";

// Russian translations. Missing keys fall back to English.
// NOTE: AI-generated — see the in-app warning in Settings.
const ru: Partial<Record<StringKey, string>> = {
    "nav.instances": "Сборки",
    "nav.mods": "Моды",
    "nav.launch": "Запуск",
    "nav.radio": "Радио",
    "nav.tools": "Инструменты",
    "nav.settings": "Настройки",

    "common.cancel": "Отмена",
    "common.save": "Сохранить",
    "common.close": "Закрыть",
    "common.retry": "Повторить",
    "common.loading": "Загрузка…",

    "settings.group.updates": "Обновления",
    "settings.group.launch": "Запуск",
    "settings.group.storage": "Хранилище",
    "settings.group.manifest": "Источник манифеста",
    "settings.group.motion": "Анимация и эффекты",
    "settings.group.display": "Экран",
    "settings.group.language": "Язык",
    "settings.group.startupWindow": "Запуск и окно",
    "settings.group.security": "Безопасность и инструменты",
    "settings.group.migration": "Миграция",

    "settings.language.label": "Язык",
    "settings.language.description": "Выберите язык интерфейса лаунчера.",
    "settings.language.aiWarning":
        "Переводы созданы ИИ. Если вы заметили ошибки, сообщите о них в Discord.",

    "settings.rift.label": "Анимация открытия разлома",
    "settings.rift.description":
        "Раскалывает экран, и при запуске лаунчер появляется из разлома.",
    "settings.tray.label": "Сворачивать в трей при закрытии",
    "settings.tray.description":
        "При закрытии окно остаётся работать в системном трее. Нажмите правой кнопкой по значку в трее, чтобы выйти.",

    "settings.uiScale.label": "Масштаб интерфейса",
    "settings.uiScale.description": "Увеличьте или уменьшите размер интерфейса.",

    "mods.translationWarning": "Перевод модов на данный момент не поддерживается.",
};

export default ru;
