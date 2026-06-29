import type { StringKey } from "./en";

// Simplified Chinese translations. Missing keys fall back to English.
// NOTE: AI-generated — see the in-app warning in Settings.
const zh: Partial<Record<StringKey, string>> = {
    "nav.instances": "实例",
    "nav.mods": "模组",
    "nav.launch": "开始",
    "nav.radio": "电台",
    "nav.tools": "工具",
    "nav.settings": "设置",

    "common.cancel": "取消",
    "common.save": "保存",
    "common.close": "关闭",
    "common.retry": "重试",
    "common.loading": "加载中…",

    "settings.group.updates": "更新",
    "settings.group.launch": "启动",
    "settings.group.storage": "存储",
    "settings.group.manifest": "清单来源",
    "settings.group.motion": "动态与特效",
    "settings.group.display": "显示",
    "settings.group.language": "语言",
    "settings.group.startupWindow": "启动与窗口",
    "settings.group.security": "安全与工具",
    "settings.group.migration": "迁移",

    "settings.language.label": "语言",
    "settings.language.description": "选择启动器的显示语言。",
    "settings.language.aiWarning":
        "翻译由 AI 生成。如发现问题，请在 Discord 反馈。",

    "settings.rift.label": "裂隙开场动画",
    "settings.rift.description": "启动时让屏幕裂开，启动器从裂隙中浮现。",
    "settings.tray.label": "关闭时最小化到托盘",
    "settings.tray.description":
        "关闭窗口后程序会继续在系统托盘中运行。右键点击托盘图标即可退出。",

    "settings.uiScale.label": "界面缩放",
    "settings.uiScale.description": "放大或缩小界面。",
};

export default zh;
