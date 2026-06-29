import type { StringKey } from "./en";

// Japanese translations. Missing keys fall back to English.
// NOTE: AI-generated — see the in-app warning in Settings.
const ja: Partial<Record<StringKey, string>> = {
    "nav.instances": "インスタンス",
    "nav.mods": "MOD",
    "nav.launch": "スタート",
    "nav.radio": "ラジオ",
    "nav.tools": "ツール",
    "nav.settings": "設定",

    "common.cancel": "キャンセル",
    "common.save": "保存",
    "common.close": "閉じる",
    "common.retry": "再試行",
    "common.loading": "読み込み中…",

    "settings.group.updates": "アップデート",
    "settings.group.launch": "起動",
    "settings.group.storage": "ストレージ",
    "settings.group.manifest": "マニフェストの提供元",
    "settings.group.motion": "モーションとエフェクト",
    "settings.group.display": "表示",
    "settings.group.language": "言語",
    "settings.group.startupWindow": "起動とウィンドウ",
    "settings.group.security": "セキュリティとツール",
    "settings.group.migration": "移行",

    "settings.language.label": "言語",
    "settings.language.description": "ランチャーの表示言語を選択します。",
    "settings.language.aiWarning":
        "翻訳はAIによって作成されています。問題を見つけた場合はDiscordで報告してください。",

    "settings.rift.label": "リフト オープニング アニメーション",
    "settings.rift.description":
        "起動時に画面を割り、ランチャーがリフトから現れます。",
    "settings.tray.label": "閉じるときにトレイに最小化",
    "settings.tray.description":
        "ウィンドウを閉じてもシステムトレイで動作し続けます。終了するにはトレイアイコンを右クリックしてください。",

    "settings.uiScale.label": "UIスケール",
    "settings.uiScale.description": "インターフェースを拡大または縮小します。",

    "mods.translationWarning": "MODの翻訳は現時点では対応していません。",
};

export default ja;
