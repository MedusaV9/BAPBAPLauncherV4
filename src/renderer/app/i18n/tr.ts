import type { StringKey } from "./en";

// Turkish translations. Missing keys fall back to English.
// NOTE: AI-generated — see the in-app warning in Settings.
const tr: Partial<Record<StringKey, string>> = {
    "nav.instances": "Örnekler",
    "nav.mods": "Modlar",
    "nav.launch": "Başlat",
    "nav.radio": "Radyo",
    "nav.tools": "Araçlar",
    "nav.settings": "Ayarlar",

    "common.cancel": "İptal",
    "common.save": "Kaydet",
    "common.close": "Kapat",
    "common.retry": "Yeniden dene",
    "common.loading": "Yükleniyor…",

    "settings.group.updates": "Güncellemeler",
    "settings.group.launch": "Başlatma",
    "settings.group.storage": "Depolama",
    "settings.group.manifest": "Manifest kaynağı",
    "settings.group.motion": "Hareket ve efektler",
    "settings.group.display": "Görüntü",
    "settings.group.language": "Dil",
    "settings.group.startupWindow": "Başlangıç ve pencere",
    "settings.group.security": "Güvenlik ve araçlar",
    "settings.group.migration": "Taşıma",

    "settings.language.label": "Dil",
    "settings.language.description": "Başlatıcının görüntü dilini seçin.",
    "settings.language.aiWarning":
        "Çeviriler yapay zeka tarafından yapılmıştır. Hata bulursanız lütfen Discord'da bildirin.",

    "settings.rift.label": "Yarık açılış animasyonu",
    "settings.rift.description":
        "Ekranı çatlatır ve başlatıcının açılışta bir yarıktan çıkmasını sağlar.",
    "settings.tray.label": "Kapatınca sistem tepsisine küçült",
    "settings.tray.description":
        "Pencere kapatıldığında sistem tepsisinde çalışmaya devam eder. Çıkmak için tepsi simgesine sağ tıklayın.",

    "settings.uiScale.label": "Arayüz ölçeği",
    "settings.uiScale.description": "Arayüzü büyütün veya küçültün.",

    "mods.translationWarning": "Mod çevirileri şimdilik bir özellik değildir.",
};

export default tr;
