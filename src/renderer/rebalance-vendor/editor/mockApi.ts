import {
  cloneJson,
  materializeRuntimeDocument,
  toEditableOverrideMap,
} from "./document";
import type {
  BootstrapPayload,
  CatalogEntry,
  CatalogGroup,
  CreateCustomDraftRequest,
  DocumentPayload,
  GameModeIndexResponse,
  JsonObject,
  JsonValue,
  LibraryAllOptionEntry,
  LibraryEntryListResponse,
  LibraryEntryQuery,
  LibraryMetadataResponse,
  LibrarySlot,
  LibrarySuggestion,
  OperationCapability,
  OperationCapabilitiesResponse,
  RuntimeDocument,
  SaveDocumentRequest,
  SaveDocumentResponse,
  SnapshotBackupResponse,
  WorkspaceRepairResponse,
  WorkspaceRoots,
} from "./types";
import type { ConfigPackReceiptSummary, InstalledPackSummary } from "./configPacks";

const emptyOperations = { entries: [] };
const emptyOperationStatus = { appliedCount: 0, failedCount: 0, entries: [] };

const mockAtlasPath = (file: string) => `/mock-assetrip/${file}`;

const mockSpriteCatalog = {
  firewave: {
    previewPath: mockAtlasPath("sactx-4-2048x2048-DXT5_BC3-UIAtlas-fb1b03a1.png"),
    cropX: 191,
    cropY: 1328,
    cropWidth: 186,
    cropHeight: 150,
    sourceWidth: 2048,
    sourceHeight: 2048,
  },
  toxicTempo: {
    previewPath: mockAtlasPath("sactx-4-2048x2048-DXT5_BC3-UIAtlas-fb1b03a1.png"),
    cropX: 191,
    cropY: 1174,
    cropWidth: 190,
    cropHeight: 146,
    sourceWidth: 2048,
    sourceHeight: 2048,
  },
  damage: {
    previewPath: mockAtlasPath("sactx-4-2048x2048-DXT5_BC3-UIAtlas-fb1b03a1.png"),
    cropX: 528.02673,
    cropY: 1883.0761277160002,
    cropWidth: 166.89713,
    cropHeight: 164.84775,
    sourceWidth: 2048,
    sourceHeight: 2048,
  },
  poison: {
    previewPath: mockAtlasPath("sactx-4-2048x2048-DXT5_BC3-UIAtlas-fb1b03a1.png"),
    cropX: 1998,
    cropY: 375,
    cropWidth: 35,
    cropHeight: 38,
    sourceWidth: 2048,
    sourceHeight: 2048,
  },
  burn: {
    previewPath: mockAtlasPath("sactx-3-2048x2048-DXT5_BC3-UIAtlas-fb1b03a1.png"),
    cropX: 1524,
    cropY: 557,
    cropWidth: 180,
    cropHeight: 171,
    sourceWidth: 2048,
    sourceHeight: 2048,
  },
  basicAttack: {
    previewPath: mockAtlasPath("sactx-4-2048x2048-DXT5_BC3-UIAtlas-fb1b03a1.png"),
    cropX: 1900,
    cropY: 533,
    cropWidth: 75,
    cropHeight: 49,
    sourceWidth: 2048,
    sourceHeight: 2048,
  },
  cooldownReduction: {
    previewPath: mockAtlasPath("sactx-4-2048x2048-DXT5_BC3-UIAtlas-fb1b03a1.png"),
    cropX: 2023,
    cropY: 18,
    cropWidth: 24,
    cropHeight: 35,
    sourceWidth: 2048,
    sourceHeight: 2048,
  },
  styleFactor: {
    previewPath: mockAtlasPath("sactx-2-2048x2048-DXT5_BC3-UIAtlas-fb1b03a1.png"),
    cropX: 1826.0513,
    cropY: 1165.076108,
    cropWidth: 58.948685,
    cropHeight: 42.872562,
    sourceWidth: 2048,
    sourceHeight: 2048,
  },
  juice: {
    previewPath: mockAtlasPath("sactx-3-2048x2048-DXT5_BC3-UIAtlas-fb1b03a1.png"),
    cropX: 1976.0267,
    cropY: 1988,
    cropWidth: 49.946495,
    cropHeight: 60,
    sourceWidth: 2048,
    sourceHeight: 2048,
  },
};

const mockIconChoices = [
  {
    value: "P_Firewave#158",
    sourcePassiveKey: "P_Firewave#158",
    reference: "Sprite:Fire_Wave_Basic",
    key: "Sprite:Fire_Wave_Basic",
    label: "Fire Wave",
    spriteName: "Fire_Wave_Basic",
    ...mockSpriteCatalog.firewave,
    group: "Base game",
  },
  {
    value: "P_Stat_Damage#379",
    sourcePassiveKey: "P_Stat_Damage#379",
    reference: "Sprite:P_Stat_Dmg",
    key: "Sprite:P_Stat_Dmg",
    label: "Damage Buff",
    spriteName: "P_Stat_Dmg",
    ...mockSpriteCatalog.damage,
    group: "Base game",
  },
  {
    value: "P_Status_Poison#610",
    sourcePassiveKey: "P_Status_Poison#610",
    reference: "Sprite:Stat_Poison",
    key: "Sprite:Stat_Poison",
    label: "Poison",
    spriteName: "Stat_Poison",
    ...mockSpriteCatalog.poison,
    group: "Status effects",
  },
  {
    value: "P_Status_Burn#611",
    sourcePassiveKey: "P_Status_Burn#611",
    reference: "Sprite:Sofia - Burning Dash_0",
    key: "Sprite:Sofia - Burning Dash_0",
    label: "Burn",
    spriteName: "Sofia - Burning Dash_0",
    ...mockSpriteCatalog.burn,
    group: "Status effects",
  },
];

const mockLibraryIcons = [
  ...mockIconChoices.map((choice) => ({ ...choice, reference: choice.spriteName ? `Sprite:${choice.spriteName}` : choice.value })),
  {
    label: "Juice",
    spriteName: "Item_HealthPotion",
    reference: "Sprite:Item_HealthPotion",
    ...mockSpriteCatalog.juice,
  },
  {
    label: "Shield Powder",
    spriteName: "Consumable_ShieldPowder_Thumb",
    reference: "Sprite:Consumable_ShieldPowder_Thumb",
    previewPath: "https://placehold.co/96x96/13202a/f8fafc?text=SP",
  },
  {
    label: "Jetpack",
    spriteName: "Consumable_Jetpack_Thumb",
    reference: "Sprite:Consumable_Jetpack_Thumb",
    previewPath: "https://placehold.co/96x96/13202a/f8fafc?text=JP",
  },
  {
    label: "Bumper",
    spriteName: "Bumper_Base_Thumb",
    reference: "Sprite:Bumper_Base_Thumb",
    previewPath: "https://placehold.co/96x96/13202a/f8fafc?text=BM",
  },
  {
    label: "Banana Peel",
    spriteName: "Consumable_BananaPeel_Thumb",
    reference: "Sprite:Consumable_BananaPeel_Thumb",
    previewPath: "https://placehold.co/96x96/13202a/f8fafc?text=BP",
  },
];

const firewaveLibrarySlots: LibrarySlot[] = [
  {
    slotId: "core-damage",
    label: "Core numbers",
    description: "The safest place for extra damage or cooldown style blocks.",
    category: "Basics",
    targetPath: "configuration.levelStats.levels[0].tiers[0]",
    supportedBlockIds: ["basic.damage", "basic.cooldown", "basic.duration"],
    supportedFamilies: ["Basics", "Stats"],
    allowMultiple: true,
    supportsReplace: true,
    supportsRemove: false,
    riskLevel: "safe",
  },
  {
    slotId: "linked-effects",
    label: "Linked effects",
    description: "Attach or swap a reusable status or helper effect.",
    category: "Effects",
    targetPath: "configuration.P_FIREWAVE_BURN",
    supportedBlockIds: ["effect.status-burn", "effect.status-poison"],
    supportedFamilies: ["Linked Effects", "Status Effects"],
    allowMultiple: false,
    supportsReplace: true,
    supportsRemove: true,
    riskLevel: "medium",
  },
];

const firewaveLibrarySuggestions: LibrarySuggestion[] = [
  {
    blockId: "basic.damage",
    label: "Damage",
    description: "Add or replace a damage number on the main Firewave tier.",
    category: "Basics",
    family: "Stats",
    targetPath: "configuration.levelStats.levels[0].tiers[0].damage",
    operationType: "replace",
    riskLevel: "safe",
    fields: [
      {
        key: "value",
        label: "Damage amount",
        description: "Base damage dealt by Firewave.",
        valueType: "integer",
        defaultValue: 220,
      },
    ],
  },
  {
    blockId: "basic.cooldown",
    label: "Cooldown",
    description: "Tune how often Firewave can be cast.",
    category: "Basics",
    family: "Timing",
    targetPath: "configuration.levelStats.levels[0].tiers[0].baseCooldown",
    operationType: "replace",
    riskLevel: "safe",
    fields: [
      {
        key: "value",
        label: "Cooldown seconds",
        description: "Base cooldown before reductions.",
        valueType: "number",
        defaultValue: 4.5,
      },
    ],
  },
  {
    blockId: "effect.status-burn",
    label: "Burn effect",
    description: "Attach or replace the linked burn helper.",
    category: "Effects",
    family: "Status Effects",
    targetPath: "configuration.P_FIREWAVE_BURN",
    operationType: "replace",
    riskLevel: "medium",
    fields: [
      {
        key: "reference",
        label: "Linked effect",
        description: "Choose which linked effect Firewave should use.",
        valueType: "reference",
        defaultValue: "PassiveSO:P_Firewave_Burn",
        options: ["PassiveSO:P_Firewave_Burn", "PassiveSO:P_Status_Poison"],
      },
    ],
  },
];

const mockLibraryMetadata: LibraryMetadataResponse = {
  workspaceRoot: "C:/Mock/BapBapRebalnce",
  libraryRoot: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/Library",
  blocksIndexPath: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/Library/Blocks.index.json",
  effectsIndexPath: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/Library/Effects.index.json",
  iconsIndexPath: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/Library/Icons.index.json",
  templatesIndexPath: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/Library/Templates.index.json",
  allOptionsIndexPath: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/Library/AllOptions.index.json",
  standardsIndexPath: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/Library/Standards.index.json",
  collectionsSharedPath: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/Library/Collections.shared.json",
  allOptionsCount: 4,
  allOptionCategories: ["Game Mode", "Basics", "DevArguments Settings"],
  allOptionSources: ["arena", "dev-only", "normal"],
  allOptionSafetyLevels: ["experimental", "safe"],
  blocks: [
    {
      blockId: "basic.health",
      label: "Health",
      category: "Basics",
      family: "Stats",
      description: "Reusable HP block for targets that expose health values.",
      fields: [{ key: "value", label: "HP amount", valueType: "integer", defaultValue: 250 }],
    },
    {
      blockId: "basic.cooldown",
      label: "Cooldown",
      category: "Basics",
      family: "Timing",
      description: "Reusable cooldown block for abilities or passives.",
      fields: [{ key: "value", label: "Cooldown seconds", valueType: "number", defaultValue: 3.5 }],
    },
    {
      blockId: "effect.status-poison",
      label: "Poison",
      category: "Effects",
      family: "Status Effects",
      description: "Reusable poison effect block.",
      fields: [{ key: "duration", label: "Duration seconds", valueType: "number", defaultValue: 2.5 }],
    },
  ],
  effects: [
    {
      family: "Status Effects",
      label: "Status effects",
      blockIds: ["effect.status-poison", "effect.status-burn"],
      editableFields: ["duration", "multiplier", "reference"],
    },
    {
      family: "Stats",
      label: "Stats",
      blockIds: ["basic.health", "basic.damage", "basic.cooldown"],
      editableFields: ["value"],
    },
  ],
  icons: mockLibraryIcons.map((choice) => ({ ...choice })),
  templates: [
    {
      templatePassiveKey: "P_Firewave#158",
      label: "Firewave",
      description: "Safe starter template for direct damage + status combos.",
      iconSourcePassiveKey: "P_Firewave#158",
    },
    {
      templatePassiveKey: "P_Stat_Damage#379",
      label: "Pure stat augment",
      description: "Safe starter template for pure stat augments.",
      iconSourcePassiveKey: "P_Stat_Damage#379",
    },
    {
      targetType: "Item",
      targetKey: "Consumable_Juice#23",
      displayName: "Consumable_Juice",
      label: "Juice",
      title: "ITEM_POTION_TITLE",
      iconReference: "Sprite:Item_HealthPotion",
    },
    {
      targetType: "Item",
      targetKey: "Consumable_ShieldPowder#38",
      displayName: "Consumable_ShieldPowder",
      label: "Shield Powder",
      title: "CONSUMABLE_SHIELD_TITLE",
      iconReference: "Sprite:Consumable_ShieldPowder_Thumb",
    },
    {
      targetType: "Item",
      targetKey: "Consumable_Jetpack#22",
      displayName: "Consumable_Jetpack",
      label: "Jetpack",
      title: "CONSUMABLE_JETPACK",
      iconReference: "Sprite:Consumable_Jetpack_Thumb",
    },
    {
      targetType: "Item",
      targetKey: "Consumable_Bumper#8",
      displayName: "Consumable_Bumper",
      label: "Bumper",
      title: "CONSUMABLE_BUMPER_TITLE",
      iconReference: "Sprite:Bumper_Base_Thumb",
    },
    {
      targetType: "Item",
      targetKey: "Consumable_BananaPeel#2",
      displayName: "Consumable_BananaPeel",
      label: "Banana Peel",
      title: "CONSUMABLE_BANANAPEEL",
      iconReference: "Sprite:Consumable_BananaPeel_Thumb",
    },
  ],
  allOptions: [
    {
      optionId: "P_Firewave#158|configuration.levelStats.levels[0].tiers[0].damage",
      category: "Basics",
      source: "normal",
      targetType: "Passive",
      targetKey: "P_Firewave#158",
      displayName: "Fire Wave",
      resolvedName: "Fire Wave",
      file: "Passives/0158_P_FIREWAVE.json",
      path: "configuration.levelStats.levels[0].tiers[0].damage",
      label: "Damage",
      description: "Base damage dealt by this effect before extra scaling and other modifiers are applied.",
      valueType: "integer",
      editable: true,
      defaultValue: 220,
      currentValue: 220,
      valueRange: { minimum: 0, maximum: 100000, step: 1, unclamped: true },
      vanillaRange: { minimum: 0, maximum: 9999, step: 1, unclamped: false },
      extendedRange: { minimum: 0, maximum: 100000, step: 1, unclamped: true },
      riskLevel: "safe",
      beyondVanilla: true,
      nativeUiKind: "Standard",
      nativeUiLabel: "Game Mode",
      sourceGroup: "Game Mode",
      iconPreviewPath: mockSpriteCatalog.firewave.previewPath,
      iconCropX: mockSpriteCatalog.firewave.cropX,
      iconCropY: mockSpriteCatalog.firewave.cropY,
      iconCropWidth: mockSpriteCatalog.firewave.cropWidth,
      iconCropHeight: mockSpriteCatalog.firewave.cropHeight,
      iconSourceWidth: mockSpriteCatalog.firewave.sourceWidth,
      iconSourceHeight: mockSpriteCatalog.firewave.sourceHeight,
      searchHints: ["Damage", "Firewave", "Passive", "Basics"],
    },
    {
      optionId: "P_Firewave#158|configuration.ttl",
      category: "Basics",
      source: "normal",
      targetType: "Passive",
      targetKey: "P_Firewave#158",
      displayName: "Fire Wave",
      resolvedName: "Fire Wave",
      file: "Passives/0158_P_FIREWAVE.json",
      path: "configuration.ttl",
      label: "Lifetime",
      description: "Lifetime in seconds before the spawned effect expires automatically.",
      valueType: "number",
      editable: true,
      defaultValue: 0.45,
      currentValue: 0.45,
      valueRange: { minimum: 0, maximum: 600, step: 0.1, unit: "seconds", unclamped: true },
      vanillaRange: { minimum: 0, maximum: 60, step: 0.1, unit: "seconds", unclamped: false },
      extendedRange: { minimum: 0, maximum: 600, step: 0.1, unit: "seconds", unclamped: true },
      riskLevel: "safe",
      beyondVanilla: true,
      nativeUiKind: "Standard",
      nativeUiLabel: "Game Mode",
      sourceGroup: "Game Mode",
      iconPreviewPath: mockSpriteCatalog.firewave.previewPath,
      iconCropX: mockSpriteCatalog.firewave.cropX,
      iconCropY: mockSpriteCatalog.firewave.cropY,
      iconCropWidth: mockSpriteCatalog.firewave.cropWidth,
      iconCropHeight: mockSpriteCatalog.firewave.cropHeight,
      iconSourceWidth: mockSpriteCatalog.firewave.sourceWidth,
      iconSourceHeight: mockSpriteCatalog.firewave.sourceHeight,
      searchHints: ["Lifetime", "TTL", "Firewave", "Basics"],
    },
    {
      optionId: "arena|GM_FastZone|zoneDurationMult",
      category: "Game Mode",
      source: "arena",
      targetType: "Arena Game Mode Asset",
      targetKey: "GM_FastZone",
      displayName: "GM FastZone",
      file: "AssetRip/Latest/ExportedProject/Assets/MonoBehaviour/GM_FastZone.asset",
      path: "zoneDurationMult",
      label: "Zone Duration Mult",
      description: "Arena zone duration multiplier. Higher values keep the zone phase running longer, and negative values can speed it up.",
      valueType: "number",
      editable: true,
      defaultValue: -0.3,
      currentValue: -0.3,
      valueRange: { minimum: -600, maximum: 1000, step: 0.1, unit: "seconds", unclamped: true },
      vanillaRange: { minimum: 0, maximum: 150, step: 0.1, unit: "seconds", unclamped: false },
      extendedRange: { minimum: -600, maximum: 1000, step: 0.1, unit: "seconds", unclamped: true },
      riskLevel: "experimental",
      beyondVanilla: true,
      nativeUiKind: "Arena",
      nativeUiLabel: "Game Mode",
      sourceGroup: "Game Mode",
      searchHints: ["Arena", "Zone", "FastZone", "experimental"],
    },
    {
      optionId: "P_Hidden_DevOnly#999|configuration.damage",
      category: "DevArguments Settings",
      source: "dev-only",
      targetType: "Passive",
      targetKey: "P_Hidden_DevOnly#999",
      displayName: "P_Hidden_DevOnly",
      file: "Passives/0999_P_Hidden_DevOnly.json",
      path: "configuration.damage",
      label: "Damage",
      description: "Damage value exported from a DevArguments-only entry.",
      valueType: "integer",
      editable: true,
      defaultValue: 100,
      currentValue: 100,
      riskLevel: "experimental",
      beyondVanilla: true,
      nativeUiKind: "HiddenDev",
      nativeUiLabel: "DevArguments Settings",
      sourceGroup: "DevArguments Settings",
      searchHints: ["DevArguments", "Hidden", "Damage", "experimental"],
    },
  ],
  sharedCollections: [
    {
      id: "starter-basics",
      label: "Starter Basics",
      description: "A calm starting bucket for common edits.",
      optionIds: [
        "P_Firewave#158|configuration.levelStats.levels[0].tiers[0].damage",
        "P_Firewave#158|configuration.ttl",
      ],
    },
    {
      id: "experimental-dev",
      label: "Experimental Dev",
      description: "Keep dev-only settings grouped away from safe everyday edits.",
      optionIds: ["P_Hidden_DevOnly#999|configuration.damage"],
    },
  ],
  warnings: [],
};

mockLibraryMetadata.standardCount = mockLibraryMetadata.allOptions.length;
mockLibraryMetadata.standardEditableCount = mockLibraryMetadata.allOptions.filter((entry) => entry.editable !== false).length;
mockLibraryMetadata.standardTargetTypes = Array.from(new Set(mockLibraryMetadata.allOptions.map((entry) => entry.targetType).filter(Boolean) as string[]));
mockLibraryMetadata.standardValueTypes = Array.from(new Set(mockLibraryMetadata.allOptions.map((entry) => entry.valueType).filter(Boolean) as string[]));
mockLibraryMetadata.standardCategories = Array.from(new Set(mockLibraryMetadata.allOptions.map((entry) => entry.category).filter(Boolean)));
mockLibraryMetadata.standardSources = Array.from(new Set(mockLibraryMetadata.allOptions.map((entry) => entry.source).filter(Boolean)));
mockLibraryMetadata.standardSafetyLevels = Array.from(new Set(mockLibraryMetadata.allOptions.map((entry) => entry.riskLevel).filter(Boolean) as string[]));

function cloneIconChoices() {
  return mockIconChoices.map((choice) => ({ ...choice }));
}

const firewave: RuntimeDocument = {
  schemaVersion: 7,
  targetType: "Passive",
  targetKey: "P_Firewave#158",
  displayName: "Fire Wave",
  resolvedName: "Fire Wave",
  generatedAtUtc: new Date().toISOString(),
  quickEdit: [
    {
      setting: "Damage",
      category: "Damage",
      path: "configuration.levelStats.levels[0].tiers[0].damage",
      editable: true,
      valueType: "integer",
      value: 220,
      defaultValue: 220,
      whatItDoes: "Base damage dealt by Firewave.",
    },
    {
      setting: "Base Cooldown",
      category: "Timing",
      path: "configuration.levelStats.levels[0].tiers[0].baseCooldown",
      editable: true,
      valueType: "number",
      value: 4.5,
      defaultValue: 4.5,
      whatItDoes: "Base cooldown before modifiers.",
    },
    {
      setting: "Lifetime",
      category: "Timing",
      path: "configuration.ttl",
      editable: true,
      valueType: "number",
      value: 0.45,
      defaultValue: 0.45,
      whatItDoes: "How long Firewave stays alive in seconds.",
    },
  ],
  simpleSettings: {
    whatThisConfigDoes: "Quick overview for Firewave.",
    whatYouCanChange: ["Damage", "Timing", "Linked parts"],
    howToEdit: "Edit the visible values first. Use More options when you want to swap linked parts.",
    copyAndSwapTips: ["Firewave can borrow a different linked burn or effect asset through the linked parts picker."],
    groups: [
      {
        category: "Damage",
        entries: [
          {
            name: "Damage",
            path: "configuration.levelStats.levels[0].tiers[0].damage",
            editable: true,
            valueType: "integer",
            description: "Base damage dealt by this effect.",
            defaultValue: 220,
            currentValue: 220,
          },
        ],
      },
      {
        category: "Timing",
        entries: [
          {
            name: "Base Cooldown",
            path: "configuration.levelStats.levels[0].tiers[0].baseCooldown",
            editable: true,
            valueType: "number",
            description: "Base cooldown before reductions.",
            defaultValue: 4.5,
            currentValue: 4.5,
          },
          {
            name: "Lifetime",
            path: "configuration.ttl",
            editable: true,
            valueType: "number",
            description: "Lifetime in seconds.",
            defaultValue: 0.45,
            currentValue: 0.45,
          },
        ],
      },
    ],
  },
  uiCapabilities: {
    mode: "guided",
    supportedActions: ["edit-values", "raw-overrides", "pack-export", "swap-reference"],
    supportsQuickEdit: true,
    supportsRawOverrides: true,
    supportsCollectionEditing: false,
    supportsReferenceSwap: true,
    supportsAbilitySwap: false,
    supportsPackExport: true,
    riskLevel: "low",
  },
  guidedActions: [
    {
      key: "change-values",
      label: "Change the core numbers",
      description: "Damage, cooldown, and lifetime are the safest first changes for this file.",
      recommendedSurface: "guided",
    },
    {
      key: "swap-linked-burn",
      label: "Swap the linked burn",
      description: "Use linked parts if you want Firewave to borrow a different attached effect.",
      recommendedSurface: "studio",
    },
  ],
  librarySlots: cloneJson(firewaveLibrarySlots),
  librarySuggestions: cloneJson(firewaveLibrarySuggestions),
  referenceChoices: [
    {
      path: "configuration.P_FIREWAVE_BURN",
      label: "Burn effect",
      currentReference: "PassiveSO:P_Firewave_Burn",
      referenceType: "PassiveSO",
      suggestions: ["PassiveSO:P_Firewave_Burn", "PassiveSO:P_StyleFactor_Pin"],
      availableReferences: ["PassiveSO:P_Firewave_Burn", "PassiveSO:P_Status_Poison"],
      previewLabel: "Linked effect",
      previewPath: mockSpriteCatalog.burn.previewPath,
      cropX: mockSpriteCatalog.burn.cropX,
      cropY: mockSpriteCatalog.burn.cropY,
      cropWidth: mockSpriteCatalog.burn.cropWidth,
      cropHeight: mockSpriteCatalog.burn.cropHeight,
      sourceWidth: mockSpriteCatalog.burn.sourceWidth,
      sourceHeight: mockSpriteCatalog.burn.sourceHeight,
      iconChoices: cloneIconChoices(),
    },
  ],
  removalCandidates: [
    {
      id: "clear:configuration.P_FIREWAVE_BURN:reference",
      operationType: "clear",
      path: "configuration.P_FIREWAVE_BURN",
      mode: "soft",
      label: "Clear linked burn effect",
      description: "Remove the attached burn passive without touching the main Firewave card.",
      safetyLevel: "safe",
      applyTiming: "restart_recommended",
      previewName: "Linked burn effect",
      previewSubtitle: "PassiveSO:P_Firewave_Burn",
      previewIconPath: mockSpriteCatalog.burn.previewPath,
      previewIconCropX: mockSpriteCatalog.burn.cropX,
      previewIconCropY: mockSpriteCatalog.burn.cropY,
      previewIconCropWidth: mockSpriteCatalog.burn.cropWidth,
      previewIconCropHeight: mockSpriteCatalog.burn.cropHeight,
      previewIconSourceWidth: mockSpriteCatalog.burn.sourceWidth,
      previewIconSourceHeight: mockSpriteCatalog.burn.sourceHeight,
      beforeValue: "PassiveSO:P_Firewave_Burn",
      afterValue: null,
      sourceCollectionId: "reference",
    },
  ],
  textTokens: [
    {
      token: "%damage%",
      label: "Damage",
      description: "Base Firewave damage.",
      sourcePath: "configuration.levelStats.levels[0].tiers[0].damage",
      valueType: "integer",
      previewValue: 220,
    },
    {
      token: "%cooldown%",
      label: "Base Cooldown",
      description: "Base cooldown before reductions.",
      sourcePath: "configuration.levelStats.levels[0].tiers[0].baseCooldown",
      valueType: "number",
      previewValue: 4.5,
    },
    {
      token: "%lifetime%",
      label: "Lifetime",
      description: "Lifetime in seconds.",
      sourcePath: "configuration.ttl",
      valueType: "number",
      previewValue: 0.45,
    },
  ],
  cardPreview: {
    title: "Fire Wave",
    shortDescription: "A short-range damage wave.",
    description: "Deals %damage% damage and stays alive for %lifetime% seconds.",
    iconPreviewPath: mockSpriteCatalog.firewave.previewPath,
    iconCropX: mockSpriteCatalog.firewave.cropX,
    iconCropY: mockSpriteCatalog.firewave.cropY,
    iconCropWidth: mockSpriteCatalog.firewave.cropWidth,
    iconCropHeight: mockSpriteCatalog.firewave.cropHeight,
    iconSourceWidth: mockSpriteCatalog.firewave.sourceWidth,
    iconSourceHeight: mockSpriteCatalog.firewave.sourceHeight,
    cardKind: "augment",
    rarityStyle: "legendary",
    iconStatus: "resolved",
    sourceHint: "Existing Argument",
    statLines: [
      { label: "Damage", value: "220", category: "positive" },
      { label: "Base Cooldown", value: "4.5", category: "neutral" },
      { label: "Lifetime", value: "0.45", category: "neutral" },
    ],
    largeCard: {
      variant: "large",
      kicker: "Existing Argument",
      kindLabel: "Argument",
      title: "Fire Wave",
      shortDescription: undefined,
      description: "A short-range damage wave. Deals %damage% damage and stays alive for %lifetime% seconds.",
      iconPreviewPath: mockSpriteCatalog.firewave.previewPath,
      iconCropX: mockSpriteCatalog.firewave.cropX,
      iconCropY: mockSpriteCatalog.firewave.cropY,
      iconCropWidth: mockSpriteCatalog.firewave.cropWidth,
      iconCropHeight: mockSpriteCatalog.firewave.cropHeight,
      iconSourceWidth: mockSpriteCatalog.firewave.sourceWidth,
      iconSourceHeight: mockSpriteCatalog.firewave.sourceHeight,
      backgroundPreviewPath: mockAtlasPath("daily-legendary-bg.png"),
      framePreviewPath: mockAtlasPath("fractals_option_card.png"),
      overlayPreviewPath: mockAtlasPath("content-border.png"),
      rarityStyle: "legendary",
      sourceHint: "Existing Argument",
      statLines: [
        { label: "Damage", value: "220", category: "positive" },
        { label: "Base Cooldown", value: "4.5", category: "neutral" },
        { label: "Lifetime", value: "0.45", category: "neutral" },
      ],
    },
    compactCard: {
      variant: "compact",
      kicker: "Argument",
      kindLabel: "Argument",
      title: "Fire Wave",
      shortDescription: undefined,
      description: "A short-range damage wave. Deals %damage% damage and stays alive for %lifetime% seconds.",
      iconPreviewPath: mockSpriteCatalog.firewave.previewPath,
      iconCropX: mockSpriteCatalog.firewave.cropX,
      iconCropY: mockSpriteCatalog.firewave.cropY,
      iconCropWidth: mockSpriteCatalog.firewave.cropWidth,
      iconCropHeight: mockSpriteCatalog.firewave.cropHeight,
      iconSourceWidth: mockSpriteCatalog.firewave.sourceWidth,
      iconSourceHeight: mockSpriteCatalog.firewave.sourceHeight,
      backgroundPreviewPath: mockAtlasPath("RewardObtained_BG.png"),
      framePreviewPath: mockAtlasPath("content-border.png"),
      overlayPreviewPath: mockAtlasPath("daily-rare-fg.png"),
      rarityStyle: "legendary",
      sourceHint: "Existing Argument",
      statLines: [
        { label: "Damage", value: "220", category: "positive" },
        { label: "Base Cooldown", value: "4.5", category: "neutral" },
        { label: "Lifetime", value: "0.45", category: "neutral" },
      ],
    },
    richTextRuns: [
      { text: "A short-range damage wave.", tone: "muted" },
      { text: "Deals %damage% damage and stays alive for %lifetime% seconds.", tone: "body" },
      { text: "220 Damage", tone: "positive", strong: true },
      { text: "4.5 Base Cooldown", tone: "positive", strong: true },
      { text: "0.45 Lifetime", tone: "positive", strong: true },
    ],
    inlineIconRuns: [
      {
        key: "Basic Attack",
        label: "Basic Attack",
        previewPath: mockSpriteCatalog.basicAttack.previewPath,
        cropX: mockSpriteCatalog.basicAttack.cropX,
        cropY: mockSpriteCatalog.basicAttack.cropY,
        cropWidth: mockSpriteCatalog.basicAttack.cropWidth,
        cropHeight: mockSpriteCatalog.basicAttack.cropHeight,
        sourceWidth: mockSpriteCatalog.basicAttack.sourceWidth,
        sourceHeight: mockSpriteCatalog.basicAttack.sourceHeight,
      },
    ],
  },
  iconChoices: cloneIconChoices(),
  nativeUiPlacement: {
    source: "arena",
    categoryKey: "arguments",
    categoryLabel: "Arguments",
    sectionKey: "all-augments",
    sectionLabel: "All Augments",
    entryLabel: "P_Firewave",
    entryDescription: "Damage wave with an optional linked status effect.",
    order: 158,
    appearsInArenaSettings: true,
  },
  operations: cloneJson(emptyOperations),
  operationStatus: cloneJson(emptyOperationStatus),
  overrides: {},
  advanced: {
    defaults: {
      "configuration.levelStats.levels[0].tiers[0].damage": 220,
      "configuration.levelStats.levels[0].tiers[0].baseCooldown": 4.5,
      "configuration.ttl": 0.45,
      "configuration.P_FIREWAVE_BURN": "PassiveSO:P_Firewave_Burn",
    },
    effectiveValues: {
      "configuration.levelStats.levels[0].tiers[0].damage": 220,
      "configuration.levelStats.levels[0].tiers[0].baseCooldown": 4.5,
      "configuration.ttl": 0.45,
      "configuration.P_FIREWAVE_BURN": "PassiveSO:P_Firewave_Burn",
    },
    fields: [
      {
        path: "configuration.levelStats.levels[0].tiers[0].damage",
        label: "Damage",
        editable: true,
        valueType: "integer",
        defaultValue: 220,
        effectiveValue: 220,
      },
      {
        path: "configuration.levelStats.levels[0].tiers[0].baseCooldown",
        label: "Base Cooldown",
        editable: true,
        valueType: "number",
        defaultValue: 4.5,
        effectiveValue: 4.5,
      },
      {
        path: "configuration.ttl",
        label: "Lifetime",
        editable: true,
        valueType: "number",
        defaultValue: 0.45,
        effectiveValue: 0.45,
      },
      {
        path: "configuration.P_FIREWAVE_BURN",
        label: "Burn effect",
        editable: true,
        valueType: "reference",
        defaultValue: "PassiveSO:P_Firewave_Burn",
        effectiveValue: "PassiveSO:P_Firewave_Burn",
      },
    ],
  },
};

const annaHurtbox: RuntimeDocument = {
  schemaVersion: 7,
  targetType: "CharacterHurtbox",
  targetKey: "ANNA#1/Hurtbox",
  displayName: "Hurtbox",
  generatedAtUtc: new Date().toISOString(),
  quickEdit: [
    {
      setting: "Base HP",
      category: "Health",
      path: "baseHp",
      editable: true,
      valueType: "integer",
      value: 1200,
      defaultValue: 1200,
      whatItDoes: "Starting HP for Anna.",
    },
    {
      setting: "Max HP",
      category: "Health",
      path: "maxHp",
      editable: true,
      valueType: "integer",
      value: 1200,
      defaultValue: 1200,
      whatItDoes: "Maximum HP cap.",
    },
  ],
  simpleSettings: {
    whatThisConfigDoes: "Core health tuning for ANNA.",
    whatYouCanChange: ["Health"],
    howToEdit: "Change HP directly here and save.",
    groups: [
      {
        category: "Health",
        entries: [
          {
            name: "Base HP",
            path: "baseHp",
            editable: true,
            valueType: "integer",
            defaultValue: 1200,
            currentValue: 1200,
            description: "Starting HP.",
          },
          {
            name: "Max HP",
            path: "maxHp",
            editable: true,
            valueType: "integer",
            defaultValue: 1200,
            currentValue: 1200,
            description: "Maximum HP cap.",
          },
        ],
      },
    ],
  },
  uiCapabilities: {
    mode: "guided",
    supportedActions: ["edit-values", "raw-overrides", "pack-export"],
    supportsQuickEdit: true,
    supportsRawOverrides: true,
    supportsCollectionEditing: false,
    supportsReferenceSwap: false,
    supportsAbilitySwap: false,
    supportsPackExport: true,
    riskLevel: "low",
  },
  guidedActions: [
    {
      key: "tune-health",
      label: "Tune HP first",
      description: "HP is a safe first-step change for character files.",
      recommendedSurface: "guided",
    },
  ],
  librarySuggestions: [
    {
      blockId: "basic.health",
      label: "Health",
      description: "Raise or lower the base health for this character target.",
      category: "Basics",
      family: "Stats",
      targetPath: "baseHp",
      operationType: "replace",
      riskLevel: "safe",
      fields: [{ key: "value", label: "Base HP", valueType: "integer", defaultValue: 1200 }],
    },
  ],
  nativeUiPlacement: {
    source: "arena",
    categoryKey: "characters",
    categoryLabel: "Characters",
    sectionKey: "anna",
    sectionLabel: "ANNA",
    entryLabel: "Health",
    entryDescription: "Base HP and max HP for ANNA.",
    order: 1,
    appearsInArenaSettings: false,
  },
  operations: cloneJson(emptyOperations),
  operationStatus: cloneJson(emptyOperationStatus),
  overrides: {},
  advanced: {
    defaults: { baseHp: 1200, maxHp: 1200 },
    effectiveValues: { baseHp: 1200, maxHp: 1200 },
    fields: [
      { path: "baseHp", label: "Base HP", editable: true, valueType: "integer", defaultValue: 1200, effectiveValue: 1200 },
      { path: "maxHp", label: "Max HP", editable: true, valueType: "integer", defaultValue: 1200, effectiveValue: 1200 },
    ],
  },
};

const annaAbilitySwap: RuntimeDocument = {
  schemaVersion: 7,
  targetType: "CharacterAbilitySwap",
  targetKey: "ANNA#1/AbilitySwap",
  displayName: "Ability Swap",
  generatedAtUtc: new Date().toISOString(),
  quickEdit: [],
  simpleSettings: {
    whatThisConfigDoes: "Pick which exported ability source each ANNA slot should borrow.",
    whatYouCanChange: ["Ability slots"],
    howToEdit: "Choose one slot, swap one source, save, and test that single change first.",
    groups: [],
  },
  uiCapabilities: {
    mode: "guided",
    supportedActions: ["swap", "edit-values", "pack-export"],
    supportsQuickEdit: false,
    supportsRawOverrides: true,
    supportsCollectionEditing: false,
    supportsReferenceSwap: false,
    supportsAbilitySwap: true,
    supportsPackExport: true,
    riskLevel: "medium",
  },
  guidedActions: [
    {
      key: "swap-slot",
      label: "Swap one slot at a time",
      description: "Keep swaps small. Change one slot, save, and test it before touching the next slot.",
      recommendedSurface: "guided",
    },
  ],
  librarySlots: [
    {
      slotId: "ability-slot-1",
      label: "Ability Slot 1",
      description: "Swap the first ability slot to another exported ability source.",
      category: "Effects",
      targetPath: "slots[0].sourceTargetKey",
      supportedFamilies: ["Character Ability Swap"],
      supportsReplace: true,
      supportsRemove: true,
      riskLevel: "medium",
    },
    {
      slotId: "ability-slot-2",
      label: "Ability Slot 2",
      description: "Swap the second ability slot to another exported ability source.",
      category: "Effects",
      targetPath: "slots[1].sourceTargetKey",
      supportedFamilies: ["Character Ability Swap"],
      supportsReplace: true,
      supportsRemove: true,
      riskLevel: "medium",
    },
  ],
  nativeUiPlacement: {
    source: "custom",
    categoryKey: "characters",
    categoryLabel: "Characters",
    sectionKey: "anna-swaps",
    sectionLabel: "ANNA Ability Swaps",
    entryLabel: "Ability Swap",
    entryDescription: "Swap one exported ability slot at a time.",
    order: 2,
    appearsInArenaSettings: false,
  },
  operations: cloneJson(emptyOperations),
  operationStatus: cloneJson(emptyOperationStatus),
  overrides: {},
  advanced: {
    defaults: {
      characterKey: "ANNA#1",
      characterDisplayName: "Anna",
      displayName: "Anna",
      "slots[0].slotIndex": 0,
      "slots[0].slotLabel": "Ability Slot 1",
      "slots[0].currentTargetKey": "ANNA#1/Ability[0]",
      "slots[0].currentRuntimeType": "Ability",
      "slots[0].currentDisplayName": "Anna Ability 1",
      "slots[0].currentCharacterKey": "ANNA#1",
      "slots[0].currentCharacterDisplayName": "Anna",
      "slots[0].sourceTargetKey": "",
      "slots[0].compatibility": "current",
      "slots[0].statusMessage": "Using the current exported ability setup.",
      "slots[1].slotIndex": 1,
      "slots[1].slotLabel": "Ability Slot 2",
      "slots[1].currentTargetKey": "ANNA#1/Ability[1]",
      "slots[1].currentRuntimeType": "Ability",
      "slots[1].currentDisplayName": "Anna Ability 2",
      "slots[1].currentCharacterKey": "ANNA#1",
      "slots[1].currentCharacterDisplayName": "Anna",
      "slots[1].sourceTargetKey": "",
      "slots[1].compatibility": "current",
      "slots[1].statusMessage": "Using the current exported ability setup.",
      "availableSources[0].targetKey": "ANNA#1/Ability[0]",
      "availableSources[0].displayName": "Anna Ability 1",
      "availableSources[0].runtimeType": "Ability",
      "availableSources[0].characterKey": "ANNA#1",
      "availableSources[0].characterDisplayName": "Anna",
      "availableSources[0].slotIndex": 0,
      "availableSources[0].slotLabel": "Ability Slot 1",
      "availableSources[0].sameCharacter": true,
      "availableSources[0].sameSlot": true,
      "availableSources[0].recommended": true,
      "availableSources[1].targetKey": "KITSU#0/Ability[0]",
      "availableSources[1].displayName": "Kitsu Ability 1",
      "availableSources[1].runtimeType": "Ability",
      "availableSources[1].characterKey": "KITSU#0",
      "availableSources[1].characterDisplayName": "Kitsu",
      "availableSources[1].slotIndex": 0,
      "availableSources[1].slotLabel": "Ability Slot 1",
      "availableSources[1].sameCharacter": false,
      "availableSources[1].sameSlot": true,
      "availableSources[2].targetKey": "CHUCK#2/Ability[1]",
      "availableSources[2].displayName": "Chuck Ability 2",
      "availableSources[2].runtimeType": "Ability",
      "availableSources[2].characterKey": "CHUCK#2",
      "availableSources[2].characterDisplayName": "Chuck",
      "availableSources[2].slotIndex": 1,
      "availableSources[2].slotLabel": "Ability Slot 2",
      "availableSources[2].sameCharacter": false,
      "availableSources[2].sameSlot": false,
    },
    effectiveValues: {
      characterKey: "ANNA#1",
      characterDisplayName: "Anna",
      displayName: "Anna",
      "slots[0].slotIndex": 0,
      "slots[0].slotLabel": "Ability Slot 1",
      "slots[0].currentTargetKey": "ANNA#1/Ability[0]",
      "slots[0].currentRuntimeType": "Ability",
      "slots[0].currentDisplayName": "Anna Ability 1",
      "slots[0].currentCharacterKey": "ANNA#1",
      "slots[0].currentCharacterDisplayName": "Anna",
      "slots[0].sourceTargetKey": "",
      "slots[0].compatibility": "current",
      "slots[0].statusMessage": "Using the current exported ability setup.",
      "slots[1].slotIndex": 1,
      "slots[1].slotLabel": "Ability Slot 2",
      "slots[1].currentTargetKey": "ANNA#1/Ability[1]",
      "slots[1].currentRuntimeType": "Ability",
      "slots[1].currentDisplayName": "Anna Ability 2",
      "slots[1].currentCharacterKey": "ANNA#1",
      "slots[1].currentCharacterDisplayName": "Anna",
      "slots[1].sourceTargetKey": "",
      "slots[1].compatibility": "current",
      "slots[1].statusMessage": "Using the current exported ability setup.",
      "availableSources[0].targetKey": "ANNA#1/Ability[0]",
      "availableSources[0].displayName": "Anna Ability 1",
      "availableSources[0].runtimeType": "Ability",
      "availableSources[0].characterKey": "ANNA#1",
      "availableSources[0].characterDisplayName": "Anna",
      "availableSources[0].slotIndex": 0,
      "availableSources[0].slotLabel": "Ability Slot 1",
      "availableSources[0].sameCharacter": true,
      "availableSources[0].sameSlot": true,
      "availableSources[0].recommended": true,
      "availableSources[1].targetKey": "KITSU#0/Ability[0]",
      "availableSources[1].displayName": "Kitsu Ability 1",
      "availableSources[1].runtimeType": "Ability",
      "availableSources[1].characterKey": "KITSU#0",
      "availableSources[1].characterDisplayName": "Kitsu",
      "availableSources[1].slotIndex": 0,
      "availableSources[1].slotLabel": "Ability Slot 1",
      "availableSources[1].sameCharacter": false,
      "availableSources[1].sameSlot": true,
      "availableSources[2].targetKey": "CHUCK#2/Ability[1]",
      "availableSources[2].displayName": "Chuck Ability 2",
      "availableSources[2].runtimeType": "Ability",
      "availableSources[2].characterKey": "CHUCK#2",
      "availableSources[2].characterDisplayName": "Chuck",
      "availableSources[2].slotIndex": 1,
      "availableSources[2].slotLabel": "Ability Slot 2",
      "availableSources[2].sameCharacter": false,
      "availableSources[2].sameSlot": false,
    },
    fields: [],
  },
};

const adrenalinePin: RuntimeDocument = {
  schemaVersion: 7,
  targetType: "Item",
  targetKey: "AdrenalinePin_T1#205",
  displayName: "#Style Factor",
  resolvedName: "#Style Factor",
  generatedAtUtc: new Date().toISOString(),
  quickEdit: [
    {
      setting: "Price",
      category: "Economy",
      path: "price",
      editable: true,
      valueType: "integer",
      value: 0,
      defaultValue: 0,
      whatItDoes: "Shop price for this pin.",
    },
    {
      setting: "Stat Type",
      category: "Stats",
      path: "stats[0].stat",
      editable: true,
      valueType: "string",
      value: "Dmg",
      defaultValue: "Dmg",
      whatItDoes: "Which stat this pin changes.",
    },
    {
      setting: "Stat Value",
      category: "Stats",
      path: "stats[0].value",
      editable: true,
      valueType: "number",
      value: 13,
      defaultValue: 13,
      whatItDoes: "Main stat value of the pin.",
    },
    {
      setting: "Icon",
      category: "Presentation",
      path: "icon",
      editable: true,
      valueType: "reference",
      value: "Sprite:Item_Sunglasses",
      defaultValue: "Sprite:Item_Sunglasses",
      whatItDoes: "Which icon is shown for this pin.",
    },
  ],
  simpleSettings: {
    whatThisConfigDoes: "Pin economy and stat tuning.",
    whatYouCanChange: ["Economy", "Stats", "Presentation"],
    howToEdit: "Use the visual editor controls first for the cleanest flow.",
    groups: [
      {
        category: "Economy",
        entries: [
          {
            name: "Price",
            path: "price",
            editable: true,
            valueType: "integer",
            currentValue: 0,
            defaultValue: 0,
            description: "Price paid for this item.",
          },
        ],
      },
      {
        category: "Stats",
        entries: [
          {
            name: "Stat Type",
            path: "stats[0].stat",
            editable: true,
            valueType: "string",
            currentValue: "Dmg",
            defaultValue: "Dmg",
            description: "Which stat this row changes.",
          },
          {
            name: "Stat 1 / Stat Value",
            path: "stats[0].value",
            editable: true,
            valueType: "number",
            currentValue: 13,
            defaultValue: 13,
            description: "Main stat value.",
          },
        ],
      },
      {
        category: "Presentation",
        entries: [
          {
            name: "Icon",
            path: "icon",
            editable: true,
            valueType: "reference",
            currentValue: "Sprite:Item_Sunglasses",
            defaultValue: "Sprite:Item_Sunglasses",
            description: "Which icon is shown for this pin.",
          },
        ],
      },
    ],
  },
  uiCapabilities: {
    mode: "guided",
    supportedActions: ["edit-values", "raw-overrides", "pack-export", "edit-collections", "add", "remove", "duplicate", "swap-reference"],
    supportsQuickEdit: true,
    supportsRawOverrides: true,
    supportsCollectionEditing: true,
    supportsReferenceSwap: true,
    supportsAbilitySwap: false,
    supportsPackExport: true,
    riskLevel: "low",
  },
  guidedActions: [
    {
      key: "price-first",
      label: "Change the price first",
      description: "Price is the safest first-step change for item files.",
      recommendedSurface: "guided",
    },
    {
      key: "add-stat-row",
      label: "Add another stat row",
      description: "Use row tools when you want this item to carry more than one stat line.",
      recommendedSurface: "studio",
    },
  ],
  librarySlots: [
    {
      slotId: "item-stats",
      label: "Stat rows",
      description: "Add, remove, or replace the stats this item grants.",
      category: "Basics",
      targetPath: "stats",
      supportedBlockIds: ["basic.damage", "basic.health", "basic.cooldown"],
      supportedFamilies: ["Stats"],
      allowMultiple: true,
      supportsReplace: true,
      supportsRemove: true,
      riskLevel: "safe",
    },
    {
      slotId: "item-icon",
      label: "Icon",
      description: "Choose a visible icon for this item.",
      category: "Effects",
      targetPath: "icon",
      supportedFamilies: ["Presentation"],
      allowMultiple: false,
      supportsReplace: true,
      supportsRemove: false,
      riskLevel: "safe",
    },
  ],
  librarySuggestions: [
    {
      blockId: "basic.damage",
      label: "Damage stat row",
      description: "Add a new damage stat row to this item.",
      category: "Basics",
      family: "Stats",
      targetPath: "stats",
      operationType: "add",
      riskLevel: "safe",
      fields: [
        { key: "stat", label: "Stat type", valueType: "string", defaultValue: "Dmg", options: ["Dmg", "Hp", "CooldownReduction"] },
        { key: "value", label: "Stat value", valueType: "number", defaultValue: 13 },
      ],
    },
    {
      blockId: "presentation.icon",
      label: "Icon",
      description: "Swap the visible icon for this item.",
      category: "Effects",
      family: "Presentation",
      targetPath: "icon",
      operationType: "replace",
      riskLevel: "safe",
      iconPreviewPath: mockSpriteCatalog.styleFactor.previewPath,
      fields: [
        {
          key: "reference",
          label: "Icon reference",
          valueType: "reference",
          defaultValue: "Sprite:Item_Sunglasses",
          options: mockIconChoices.map((choice) => choice.value),
        },
      ],
    },
  ],
  collectionEditors: [
    {
      path: "stats",
      label: "Stats on this item",
      description: "Add, remove, or duplicate stat rows without opening raw JSON.",
      itemLabel: "stat row",
      canAdd: true,
      canRemove: true,
      canDuplicate: true,
      removeBehavior: "soft-remove",
    },
  ],
  referenceChoices: [
    {
      path: "icon",
      label: "Item icon",
      currentReference: "Sprite:Item_Sunglasses",
      referenceType: "Sprite",
      suggestions: ["Sprite:Item_Sunglasses", "Sprite:Item_Camera"],
      availableReferences: ["Sprite:Item_Sunglasses", "Sprite:Item_Camera", "Sprite:Item_Poison"],
      previewLabel: "Visible item icon",
      previewPath: mockSpriteCatalog.styleFactor.previewPath,
      cropX: mockSpriteCatalog.styleFactor.cropX,
      cropY: mockSpriteCatalog.styleFactor.cropY,
      cropWidth: mockSpriteCatalog.styleFactor.cropWidth,
      cropHeight: mockSpriteCatalog.styleFactor.cropHeight,
      sourceWidth: mockSpriteCatalog.styleFactor.sourceWidth,
      sourceHeight: mockSpriteCatalog.styleFactor.sourceHeight,
      iconChoices: cloneIconChoices(),
    },
  ],
  removalCandidates: [
    {
      id: "remove:stats[0]:stats",
      operationType: "remove",
      path: "stats[0]",
      mode: "soft",
      label: "Remove stat row: Damage +13",
      description: "Remove the current stat row from this pin without deleting the whole item.",
      safetyLevel: "safe",
      applyTiming: "restart_recommended",
      previewName: "Damage +13",
      previewSubtitle: "Stat row",
      previewIconPath: mockSpriteCatalog.damage.previewPath,
      previewIconCropX: mockSpriteCatalog.damage.cropX,
      previewIconCropY: mockSpriteCatalog.damage.cropY,
      previewIconCropWidth: mockSpriteCatalog.damage.cropWidth,
      previewIconCropHeight: mockSpriteCatalog.damage.cropHeight,
      previewIconSourceWidth: mockSpriteCatalog.damage.sourceWidth,
      previewIconSourceHeight: mockSpriteCatalog.damage.sourceHeight,
      beforeValue: {
        stat: "Dmg",
        value: 13,
      },
      afterValue: null,
      sourceCollectionId: "stats",
    },
    {
      id: "clear:icon:reference",
      operationType: "clear",
      path: "icon",
      mode: "soft",
      label: "Clear visible item icon",
      description: "Clear the current icon reference for this item.",
      safetyLevel: "safe",
      applyTiming: "restart_recommended",
      previewName: "Visible item icon",
      previewSubtitle: "Sprite:Item_Sunglasses",
      previewIconPath: mockSpriteCatalog.styleFactor.previewPath,
      previewIconCropX: mockSpriteCatalog.styleFactor.cropX,
      previewIconCropY: mockSpriteCatalog.styleFactor.cropY,
      previewIconCropWidth: mockSpriteCatalog.styleFactor.cropWidth,
      previewIconCropHeight: mockSpriteCatalog.styleFactor.cropHeight,
      previewIconSourceWidth: mockSpriteCatalog.styleFactor.sourceWidth,
      previewIconSourceHeight: mockSpriteCatalog.styleFactor.sourceHeight,
      beforeValue: "Sprite:Item_Sunglasses",
      afterValue: null,
      sourceCollectionId: "reference",
    },
  ],
  cardPreview: {
    title: "Style Factor",
    shortDescription: "A stat pin for sharper burst damage.",
    description: "Gives +13 Damage and costs 0 gold in this draft.",
    iconPreviewPath: mockSpriteCatalog.styleFactor.previewPath,
    iconCropX: mockSpriteCatalog.styleFactor.cropX,
    iconCropY: mockSpriteCatalog.styleFactor.cropY,
    iconCropWidth: mockSpriteCatalog.styleFactor.cropWidth,
    iconCropHeight: mockSpriteCatalog.styleFactor.cropHeight,
    iconSourceWidth: mockSpriteCatalog.styleFactor.sourceWidth,
    iconSourceHeight: mockSpriteCatalog.styleFactor.sourceHeight,
    cardKind: "item",
    rarityStyle: "common",
    iconStatus: "resolved",
    sourceHint: "Existing Item",
    statLines: [
      { label: "Price", value: "0", category: "neutral" },
      { label: "Damage", value: "+13", category: "positive" },
    ],
    largeCard: {
      variant: "large",
      kicker: "Existing Item",
      kindLabel: "Item",
      title: "Style Factor",
      shortDescription: undefined,
      description: "A stat pin that gives +13 Damage without changing the price.",
      iconPreviewPath: mockSpriteCatalog.styleFactor.previewPath,
      iconCropX: mockSpriteCatalog.styleFactor.cropX,
      iconCropY: mockSpriteCatalog.styleFactor.cropY,
      iconCropWidth: mockSpriteCatalog.styleFactor.cropWidth,
      iconCropHeight: mockSpriteCatalog.styleFactor.cropHeight,
      iconSourceWidth: mockSpriteCatalog.styleFactor.sourceWidth,
      iconSourceHeight: mockSpriteCatalog.styleFactor.sourceHeight,
      backgroundPreviewPath: mockAtlasPath("daily-common-bg.png"),
      framePreviewPath: mockAtlasPath("fractals_option_card.png"),
      overlayPreviewPath: mockAtlasPath("content-border.png"),
      rarityStyle: "common",
      sourceHint: "Existing Item",
      statLines: [
        { label: "Price", value: "0", category: "neutral" },
        { label: "Damage", value: "+13", category: "positive" },
      ],
    },
    compactCard: {
      variant: "compact",
      kicker: "Item",
      kindLabel: "Item",
      title: "Style Factor",
      shortDescription: undefined,
      description: "A stat pin that gives +13 Damage without changing the price.",
      iconPreviewPath: mockSpriteCatalog.styleFactor.previewPath,
      iconCropX: mockSpriteCatalog.styleFactor.cropX,
      iconCropY: mockSpriteCatalog.styleFactor.cropY,
      iconCropWidth: mockSpriteCatalog.styleFactor.cropWidth,
      iconCropHeight: mockSpriteCatalog.styleFactor.cropHeight,
      iconSourceWidth: mockSpriteCatalog.styleFactor.sourceWidth,
      iconSourceHeight: mockSpriteCatalog.styleFactor.sourceHeight,
      backgroundPreviewPath: mockAtlasPath("RewardObtained_BG.png"),
      framePreviewPath: mockAtlasPath("content-border.png"),
      overlayPreviewPath: mockAtlasPath("daily-rare-fg.png"),
      rarityStyle: "common",
      sourceHint: "Existing Item",
      statLines: [
        { label: "Price", value: "0", category: "neutral" },
        { label: "Damage", value: "+13", category: "positive" },
      ],
    },
    richTextRuns: [
      { text: "A stat pin for sharper burst damage.", tone: "muted" },
      { text: "Gives +13 Damage and costs 0 gold in this draft.", tone: "body" },
      { text: "+13 Damage", tone: "positive", strong: true },
    ],
  },
  iconChoices: cloneIconChoices(),
  nativeUiPlacement: {
    source: "arena",
    categoryKey: "items",
    categoryLabel: "Items",
    sectionKey: "pins",
    sectionLabel: "Pins",
    entryLabel: "#Style Factor",
    entryDescription: "Stat pin with editable price, stats, and icon.",
    order: 205,
    appearsInArenaSettings: true,
  },
  operations: cloneJson(emptyOperations),
  operationStatus: cloneJson(emptyOperationStatus),
  overrides: {},
  advanced: {
    defaults: {
      price: 0,
      "stats[0].stat": "Dmg",
      "stats[0].value": 13,
      icon: "Sprite:Item_Sunglasses",
    },
    effectiveValues: {
      price: 0,
      "stats[0].stat": "Dmg",
      "stats[0].value": 13,
      icon: "Sprite:Item_Sunglasses",
    },
    fields: [
      { path: "price", label: "Price", editable: true, valueType: "integer", defaultValue: 0, effectiveValue: 0 },
      { path: "stats[0].stat", label: "Stat Type", editable: true, valueType: "string", defaultValue: "Dmg", effectiveValue: "Dmg" },
      { path: "stats[0].value", label: "Stat Value", editable: true, valueType: "number", defaultValue: 13, effectiveValue: 13 },
      { path: "icon", label: "Icon", editable: true, valueType: "reference", defaultValue: "Sprite:Item_Sunglasses", effectiveValue: "Sprite:Item_Sunglasses" },
    ],
  },
};

const augmentManager: RuntimeDocument = {
  schemaVersion: 7,
  targetType: "Manager",
  targetKey: "AugmentManager",
  displayName: "Augment Manager",
  generatedAtUtc: new Date().toISOString(),
  quickEdit: [
    {
      setting: "Reroll Cost",
      category: "Manager",
      path: "goldCostToReroll",
      editable: true,
      valueType: "integer",
      value: 200,
      defaultValue: 200,
      whatItDoes: "Gold cost for rerolling augment choices.",
    },
    {
      setting: "Choices Per Roll",
      category: "Manager",
      path: "augmentChoicesNum",
      editable: true,
      valueType: "integer",
      value: 3,
      defaultValue: 3,
      whatItDoes: "How many augment choices show up at once.",
    },
  ],
  simpleSettings: {
    whatThisConfigDoes: "Global augment manager settings and pool rows.",
    whatYouCanChange: ["Manager", "Pools"],
    howToEdit: "Start with reroll cost or choices per roll. Use row tools for pool membership.",
    groups: [
      {
        category: "Manager",
        entries: [
          {
            name: "Reroll Cost",
            path: "goldCostToReroll",
            editable: true,
            valueType: "integer",
            defaultValue: 200,
            currentValue: 200,
            description: "Gold cost for rerolling augment choices.",
          },
          {
            name: "Choices Per Roll",
            path: "augmentChoicesNum",
            editable: true,
            valueType: "integer",
            defaultValue: 3,
            currentValue: 3,
            description: "How many augment choices show up at once.",
          },
        ],
      },
      {
        category: "Pools",
        entries: [
          {
            name: "All Augment Pool Count",
            path: "",
            editable: false,
            valueType: "integer",
            defaultValue: 2,
            currentValue: 2,
            description: "How many augments are currently in the main pool in this mock preview.",
          },
        ],
      },
    ],
  },
  uiCapabilities: {
    mode: "studio",
    supportedActions: ["edit-values", "raw-overrides", "pack-export", "edit-collections", "add", "remove"],
    supportsQuickEdit: true,
    supportsRawOverrides: true,
    supportsCollectionEditing: true,
    supportsReferenceSwap: false,
    supportsAbilitySwap: false,
    supportsPackExport: true,
    riskLevel: "medium",
  },
  guidedActions: [
    {
      key: "tune-reroll",
      label: "Tune the reroll settings",
      description: "This is the safest starting point for the manager file.",
      recommendedSurface: "guided",
    },
    {
      key: "edit-pools",
      label: "Add or remove pool entries",
      description: "Use row tools when you want to change which augments can appear.",
      recommendedSurface: "studio",
    },
  ],
  librarySuggestions: [
    {
      blockId: "pool.main.add",
      label: "Add to main augment pool",
      description: "Add one augment key to the main pool.",
      category: "Basics",
      family: "Pools",
      targetPath: "allAugmentIds",
      operationType: "add",
      riskLevel: "safe",
      fields: [{ key: "value", label: "Augment key", valueType: "string", defaultValue: "P_Firewave#158" }],
    },
    {
      blockId: "pool.generic.add",
      label: "Add to generic pool",
      description: "Add one augment key to the generic pool.",
      category: "Basics",
      family: "Pools",
      targetPath: "genericAugmentIds",
      operationType: "add",
      riskLevel: "safe",
      fields: [{ key: "value", label: "Augment key", valueType: "string", defaultValue: "P_StyleFactor_Pin#205" }],
    },
  ],
  nativeUiPlacement: {
    source: "custom",
    categoryKey: "managers",
    categoryLabel: "Managers",
    sectionKey: "augment-manager",
    sectionLabel: "Augment Manager",
    entryLabel: "Pool control",
    entryDescription: "Global augment pool and reroll settings.",
    order: 1,
    appearsInArenaSettings: false,
  },
  collectionEditors: [
    {
      path: "allAugmentIds",
      label: "All augment pool",
      description: "Add or remove augments from the main pool.",
      itemLabel: "augment",
      canAdd: true,
      canRemove: true,
      canDuplicate: false,
      removeBehavior: "soft-remove",
    },
    {
      path: "genericAugmentIds",
      label: "Generic augment pool",
      description: "Add or remove augments from the generic pool.",
      itemLabel: "augment",
      canAdd: true,
      canRemove: true,
      canDuplicate: false,
      removeBehavior: "soft-remove",
    },
  ],
  operations: cloneJson(emptyOperations),
  operationStatus: cloneJson(emptyOperationStatus),
  overrides: {},
  advanced: {
    defaults: {
      goldCostToReroll: 200,
      augmentChoicesNum: 3,
      "allAugmentIds[0]": "P_Firewave#158",
      "allAugmentIds[1]": "P_StyleFactor_Pin#205",
      "genericAugmentIds[0]": "P_Firewave#158",
      "genericAugmentIds[1]": "P_StyleFactor_Pin#205",
    },
    effectiveValues: {
      goldCostToReroll: 200,
      augmentChoicesNum: 3,
      "allAugmentIds[0]": "P_Firewave#158",
      "allAugmentIds[1]": "P_StyleFactor_Pin#205",
      "genericAugmentIds[0]": "P_Firewave#158",
      "genericAugmentIds[1]": "P_StyleFactor_Pin#205",
    },
    fields: [
      { path: "goldCostToReroll", label: "Reroll Cost", editable: true, valueType: "integer", defaultValue: 200, effectiveValue: 200 },
      { path: "augmentChoicesNum", label: "Choices Per Roll", editable: true, valueType: "integer", defaultValue: 3, effectiveValue: 3 },
      { path: "allAugmentIds[0]", label: "All Augment Pool / Entry 1", editable: true, valueType: "string", defaultValue: "P_Firewave#158", effectiveValue: "P_Firewave#158" },
      { path: "allAugmentIds[1]", label: "All Augment Pool / Entry 2", editable: true, valueType: "string", defaultValue: "P_StyleFactor_Pin#205", effectiveValue: "P_StyleFactor_Pin#205" },
      { path: "genericAugmentIds[0]", label: "Generic Augment Pool / Entry 1", editable: true, valueType: "string", defaultValue: "P_Firewave#158", effectiveValue: "P_Firewave#158" },
      { path: "genericAugmentIds[1]", label: "Generic Augment Pool / Entry 2", editable: true, valueType: "string", defaultValue: "P_StyleFactor_Pin#205", effectiveValue: "P_StyleFactor_Pin#205" },
    ],
  },
};

const customFirewave: RuntimeDocument = {
  schemaVersion: 2,
  enabled: false,
  id: 5000,
  key: "P_CUSTOM_FIREWAVE_PLUS",
  displayName: "Custom Firewave Plus",
  templatePassiveKey: "P_Firewave#158",
  icon: { sourcePassiveKey: "P_Firewave#158" },
  iconChoices: cloneIconChoices(),
  nativeUiPlacement: {
    source: "custom",
    categoryKey: "arguments-custom",
    categoryLabel: "Arguments - Custom",
    sectionKey: "custom-arguments",
    sectionLabel: "Custom Arguments",
    entryLabel: "Custom Firewave Plus",
    entryDescription: "Example custom augment that appears in its own Arena section.",
    order: 5000,
    appearsInArenaSettings: true,
  },
  pools: {
    addToAllAugments: true,
    addToGenericPool: true,
    addToStartingTree: true,
    addToWildCardTree: false,
    addToWildCardRareTree: false,
    addToFallbackPool: false,
    characterIds: [],
  },
  overrides: {
    "configuration.descriptionTrKey": "#A cloned Firewave with custom numbers.",
    "configuration.levelStats.levels[0].tiers[0].baseCooldown": 3.75,
    "configuration.levelStats.levels[0].tiers[0].damage": 320,
    "configuration.nameTrKey": "#Custom Firewave Plus",
  },
  blocks: [
    {
      blockId: "basic.damage",
      targetSlot: "core-damage",
      label: "Damage",
      values: {
        value: 320,
      },
      enabled: true,
    },
    {
      blockId: "effect.status-burn",
      targetSlot: "linked-effects",
      label: "Burn effect",
      values: {
        reference: "PassiveSO:P_Firewave_Burn",
      },
      enabled: true,
    },
  ],
};

const arenaCurrentPreset: RuntimeDocument = {
  schemaVersion: 7,
  targetType: "ArenaSettingsPreset",
  targetKey: "ArenaPreset#Current",
  displayName: "Current Preset",
  generatedAtUtc: new Date().toISOString(),
  quickEdit: [
    {
      setting: "Points Per Kill",
      category: "Rules",
      path: "pointsPerKill",
      editable: true,
      valueType: "integer",
      value: 1,
      defaultValue: 1,
      whatItDoes: "How many points a kill grants in the current game mode preset.",
    },
    {
      setting: "Score To Win",
      category: "Rules",
      path: "scoreToWin",
      editable: true,
      valueType: "integer",
      value: 5,
      defaultValue: 5,
      whatItDoes: "How many points are needed to win the match.",
    },
    {
      setting: "Zone Speed",
      category: "Zone",
      path: "zoneSpeedMult",
      editable: true,
      valueType: "number",
      value: 1,
      defaultValue: 1,
      whatItDoes: "Multiplier for how fast the zone closes.",
    },
    {
      setting: "Zone Damage",
      category: "Zone",
      path: "zoneDamageMult",
      editable: true,
      valueType: "number",
      value: 1,
      defaultValue: 1,
      whatItDoes: "Multiplier for how much damage the zone deals.",
    },
  ],
  simpleSettings: {
    whatThisConfigDoes: "Quick overview for the current game mode preset. You can change Rules and Zone values here.",
    howToEdit: "Change one rule or zone value, save it, then test the match setup.",
    groups: [
      {
        category: "Rules",
        entries: [
          { name: "Points Per Kill", path: "pointsPerKill", editable: true, valueType: "integer", defaultValue: 1, currentValue: 1, description: "How many points a kill grants." },
          { name: "Score To Win", path: "scoreToWin", editable: true, valueType: "integer", defaultValue: 5, currentValue: 5, description: "How many points are needed to win." },
        ],
      },
      {
        category: "Zone",
        entries: [
          { name: "Zone Speed", path: "zoneSpeedMult", editable: true, valueType: "number", defaultValue: 1, currentValue: 1, description: "Multiplier for zone speed." },
          { name: "Zone Damage", path: "zoneDamageMult", editable: true, valueType: "number", defaultValue: 1, currentValue: 1, description: "Multiplier for zone damage." },
        ],
      },
    ],
  },
  collectionEditors: [
    {
      path: "availableItems",
      label: "Arena Item List",
      description: "Turn arena items on or off by real item name.",
      itemLabel: "Item",
      canAdd: true,
      canRemove: true,
      canReplace: true,
      canClear: true,
      canDuplicate: false,
      supportsSoftRemove: false,
      supportsHardRemove: true,
      removeBehavior: "remove-or-clear",
    },
    {
      path: "vaultedAugments",
      label: "Vaulted Augment List",
      itemLabel: "Entry",
      canAdd: true,
      canRemove: true,
      canReplace: true,
      canClear: true,
      canDuplicate: false,
      supportsSoftRemove: false,
      supportsHardRemove: true,
      removeBehavior: "remove-or-clear",
    },
  ],
  gameModeSummary: {
    vaultedAugments: [
      {
        augmentId: 12,
        augmentKey: "P_Buff_Hp_Persistent#12",
        displayName: "Health Buff",
        subtitle: "Standard · P_Buff_Hp_Persistent#12",
        iconReference: "Sprite:P_Stat_Hp",
        iconPreviewPath: "https://placehold.co/96x96/1f2937/f8fafc?text=HP",
        vaulted: true,
      },
      {
        augmentId: 158,
        augmentKey: "P_Firewave#158",
        displayName: "Firewave",
        subtitle: "Standard · P_Firewave#158",
        iconReference: "Sprite:Firewave",
        iconPreviewPath: "https://placehold.co/96x96/1f2937/f8fafc?text=FW",
        vaulted: true,
      },
      {
        augmentId: 379,
        augmentKey: "P_Stat_Damage#379",
        displayName: "Damage Buff",
        subtitle: "Standard · P_Stat_Damage#379",
        iconReference: "Sprite:Damage",
        iconPreviewPath: "https://placehold.co/96x96/1f2937/f8fafc?text=DMG",
        vaulted: false,
      },
    ],
  },
  referenceChoices: [
    {
      path: "availableItems[0]",
      label: "Arena item",
      currentReference: "Consumable:Consumable_Juice",
      previewLabel: "Juice",
      previewPath: "https://placehold.co/96x96/1f2937/f8fafc?text=J",
    },
    {
      path: "availableItems[1]",
      label: "Arena item",
      currentReference: "Consumable:Consumable_ShieldPowder",
      previewLabel: "Shield Powder",
      previewPath: "https://placehold.co/96x96/1f2937/f8fafc?text=SP",
    },
    {
      path: "availableItems[2]",
      label: "Arena item",
      currentReference: "Consumable:Consumable_JumpPad",
      previewLabel: "Jump Pad",
      previewPath: "https://placehold.co/96x96/1f2937/f8fafc?text=JP",
    },
  ],
  removalCandidates: [
    {
      id: "remove:vaultedAugments[0]:vaultedAugments",
      operationType: "remove",
      path: "vaultedAugments[0]",
      mode: "soft",
      label: "Unvault augment: Health Buff",
      description: "Remove this augment from the vaulted list so the preset can offer it again.",
      safetyLevel: "safe",
      applyTiming: "next_match",
      previewName: "Health Buff",
      previewSubtitle: "Vaulted augment",
      previewIconPath: "https://placehold.co/96x96/1f2937/f8fafc?text=HP",
      beforeValue: "P_Buff_Hp_Persistent#12",
      afterValue: null,
      sourceCollectionId: "vaultedAugments",
    },
    {
      id: "remove:availableItems[0]:availableItems",
      operationType: "remove",
      path: "availableItems[0]",
      mode: "soft",
      label: "Remove allowed item: Juice",
      description: "Remove Juice from the preset's allowed item list.",
      safetyLevel: "safe",
      applyTiming: "next_match",
      previewName: "Juice",
      previewSubtitle: "Allowed item",
      previewIconPath: "https://placehold.co/96x96/1f2937/f8fafc?text=J",
      beforeValue: "Consumable:Consumable_Juice",
      afterValue: null,
      sourceCollectionId: "availableItems",
    },
  ],
  advanced: {
    fields: [
      {
        path: "availableItems[0]",
        label: "Allowed items",
        category: "Pools",
        editable: true,
        valueType: "reference",
        description: "A currently allowed arena item.",
        defaultValue: "Consumable:Consumable_Juice",
        currentValue: "Consumable:Consumable_Juice",
        effectiveValue: "Consumable:Consumable_Juice",
      },
      {
        path: "availableItems[1]",
        label: "Allowed items",
        category: "Pools",
        editable: true,
        valueType: "reference",
        description: "A currently allowed arena item.",
        defaultValue: "Consumable:Consumable_ShieldPowder",
        currentValue: "Consumable:Consumable_ShieldPowder",
        effectiveValue: "Consumable:Consumable_ShieldPowder",
      },
      {
        path: "availableItems[2]",
        label: "Allowed items",
        category: "Pools",
        editable: true,
        valueType: "reference",
        description: "A currently allowed arena item.",
        defaultValue: "Consumable:Consumable_JumpPad",
        currentValue: "Consumable:Consumable_JumpPad",
        effectiveValue: "Consumable:Consumable_JumpPad",
      },
      {
        path: "vaultedAugments[0]",
        label: "Vaulted Augments",
        category: "Pools",
        editable: true,
        valueType: "integer",
        description: "The first vaulted augment entry in the current preset.",
        defaultValue: 12,
        currentValue: 12,
        effectiveValue: 12,
      },
      {
        path: "vaultedAugments[1]",
        label: "Vaulted Augments",
        category: "Pools",
        editable: true,
        valueType: "integer",
        description: "The second vaulted augment entry in the current preset.",
        defaultValue: 158,
        currentValue: 158,
        effectiveValue: 158,
      },
    ],
    defaults: {
      "availableItems[0]": "Consumable:Consumable_Juice",
      "availableItems[1]": "Consumable:Consumable_ShieldPowder",
      "availableItems[2]": "Consumable:Consumable_JumpPad",
      "vaultedAugments[0]": 12,
      "vaultedAugments[1]": 158,
    },
    effectiveValues: {
      "availableItems[0]": "Consumable:Consumable_Juice",
      "availableItems[1]": "Consumable:Consumable_ShieldPowder",
      "availableItems[2]": "Consumable:Consumable_JumpPad",
      "vaultedAugments[0]": 12,
      "vaultedAugments[1]": 158,
    },
  },
  overrides: {},
  overrideStatus: cloneJson(emptyOperationStatus),
};

const arenaCurrentLobby: RuntimeDocument = {
  schemaVersion: 9,
  targetType: "ArenaLobbySettings",
  targetKey: "ArenaLobby#Current",
  displayName: "Live Snapshot",
  resolvedName: "Live Snapshot",
  generatedAtUtc: new Date().toISOString(),
  sourceRole: "current_lobby",
  applyTiming: "restart_recommended",
  safetyLevel: "safe",
  quickEdit: [
    { setting: "Points Per Kill", category: "Rules", path: "PointsPerKill", editable: true, valueType: "integer", value: 85, defaultValue: 85, whatItDoes: "How many points a kill grants in the live lobby snapshot." },
    { setting: "Points To Win", category: "Rules", path: "PointsToWin", editable: true, valueType: "integer", value: 1000, defaultValue: 1000, whatItDoes: "How many total points are needed to win in the live lobby snapshot." },
    { setting: "Lobby Size", category: "Lobby", path: "LobbySize", editable: true, valueType: "integer", value: 6, defaultValue: 6, whatItDoes: "Maximum number of players allowed in the lobby." },
    { setting: "Team Size", category: "Lobby", path: "TeamSize", editable: true, valueType: "integer", value: 1, defaultValue: 1, whatItDoes: "How many players are allowed per team." },
    { setting: "Bot Count", category: "Bots", path: "BotCount", editable: true, valueType: "integer", value: 0, defaultValue: 0, whatItDoes: "How many bots the lobby should add." },
    { setting: "Bot Difficulty", category: "Bots", path: "BotDifficulty", editable: true, valueType: "integer", value: 0, defaultValue: 0, whatItDoes: "Difficulty level for bots in the lobby.", verifiedChoices: [
      { value: 0, label: "Easy", description: "Verified lobby bot difficulty option." },
      { value: 1, label: "Medium", description: "Verified lobby bot difficulty option." },
      { value: 2, label: "Hard", description: "Verified lobby bot difficulty option." },
      { value: 3, label: "Expert", description: "Verified lobby bot difficulty option." },
    ] },
  ],
  simpleSettings: {
    whatThisConfigDoes: "Snapshot of the currently open custom lobby values. Use it to inspect or save the live setup, then verify it again after a restart or fresh lobby open.",
    howToEdit: "Treat this as a reference-first file. Small lobby and bot changes are fine here, but the safest validation path is still restart-first.",
    groups: [
      {
        category: "Rules",
        entries: [
          { name: "Points Per Kill", path: "PointsPerKill", editable: true, valueType: "integer", defaultValue: 85, currentValue: 85, description: "Points granted for each kill in the current live snapshot." },
          { name: "Points To Win", path: "PointsToWin", editable: true, valueType: "integer", defaultValue: 1000, currentValue: 1000, description: "How many total points are needed to win in the current live snapshot." },
        ],
      },
      {
        category: "Lobby",
        entries: [
          { name: "Lobby Size", path: "LobbySize", editable: true, valueType: "integer", defaultValue: 6, currentValue: 6, description: "Maximum number of players allowed." },
          { name: "Team Size", path: "TeamSize", editable: true, valueType: "integer", defaultValue: 1, currentValue: 1, description: "How many players fit on one team." },
        ],
      },
      {
        category: "Bots",
        entries: [
          { name: "Bot Count", path: "BotCount", editable: true, valueType: "integer", defaultValue: 0, currentValue: 0, description: "How many bots should join." },
          { name: "Bot Difficulty", path: "BotDifficulty", editable: true, valueType: "integer", defaultValue: 0, currentValue: 0, description: "Difficulty used for bots.", verifiedChoices: [
            { value: 0, label: "Easy", description: "Verified lobby bot difficulty option." },
            { value: 1, label: "Medium", description: "Verified lobby bot difficulty option." },
            { value: 2, label: "Hard", description: "Verified lobby bot difficulty option." },
            { value: 3, label: "Expert", description: "Verified lobby bot difficulty option." },
          ] },
        ],
      },
    ],
  },
  cardPreview: {
    title: "Live Snapshot",
    shortDescription: "Current lobby reference",
    description: "Inspect the currently observed lobby size, team size, and bot setup before you save it into a restart-safe workflow.",
    sourceHint: "Live Snapshot",
    statLines: [
      { label: "Lobby Size", value: "6" },
      { label: "Team Size", value: "1" },
      { label: "Bot Count", value: "0" },
    ],
  },
  overrides: {},
  overrideStatus: cloneJson(emptyOperationStatus),
};

const arenaGameMode: RuntimeDocument = {
  schemaVersion: 9,
  targetType: "ArenaGameMode",
  targetKey: "ArenaGameMode#Live",
  displayName: "Arena Game Mode",
  resolvedName: "Arena Game Mode",
  generatedAtUtc: new Date().toISOString(),
  sourceRole: "arena_game_mode",
  applyTiming: "next_match",
  safetyLevel: "medium",
  simpleSettings: {
    whatThisConfigDoes: "Deeper hidden match rules and pool-level content that sit underneath the simpler preset view.",
    howToEdit: "Use this when Current Preset is not enough. Save, then start a fresh match to verify the deeper runtime rules.",
    groups: [
      {
        category: "Rules",
        entries: [
          {
            name: "Zone Margin",
            path: "zoneMargin",
            editable: true,
            valueType: "number",
            defaultValue: 1.5,
            currentValue: 1.5,
            description: "How much breathing room the mode gives before the closing zone reaches players.",
          },
        ],
      },
    ],
  },
  collectionEditors: [
    {
      path: "availableItems",
      label: "Allowed Items",
      itemLabel: "Item",
      canAdd: true,
      canRemove: true,
      canReplace: true,
      canClear: false,
      canDuplicate: false,
      supportsSoftRemove: false,
      supportsHardRemove: true,
      removeBehavior: "remove-or-clear",
    },
  ],
  referenceChoices: [
    {
      path: "availableItems[0]",
      label: "Allowed Items",
      currentReference: "Consumable:Consumable_Juice",
      previewLabel: "Juice",
      previewPath: "https://placehold.co/96x96/13202a/f8fafc?text=J",
      availableReferences: [
        "Consumable:Consumable_Juice",
        "Consumable:Consumable_ShieldPowder",
        "Consumable:Consumable_Jetpack",
        "Consumable:Consumable_Bumper",
        "Consumable:Consumable_BananaPeel",
      ],
    },
    {
      path: "availableItems[1]",
      label: "Allowed Items",
      currentReference: "Consumable:Consumable_ShieldPowder",
      previewLabel: "Shield Powder",
      previewPath: "https://placehold.co/96x96/13202a/f8fafc?text=SP",
      availableReferences: [
        "Consumable:Consumable_Juice",
        "Consumable:Consumable_ShieldPowder",
        "Consumable:Consumable_Jetpack",
        "Consumable:Consumable_Bumper",
        "Consumable:Consumable_BananaPeel",
      ],
    },
    {
      path: "availableItems[2]",
      label: "Allowed Items",
      currentReference: "Consumable:Consumable_Jetpack",
      previewLabel: "Jetpack",
      previewPath: "https://placehold.co/96x96/13202a/f8fafc?text=JP",
      availableReferences: [
        "Consumable:Consumable_Juice",
        "Consumable:Consumable_ShieldPowder",
        "Consumable:Consumable_Jetpack",
        "Consumable:Consumable_Bumper",
        "Consumable:Consumable_BananaPeel",
      ],
    },
    {
      path: "availableItems[3]",
      label: "Allowed Items",
      currentReference: "Consumable:Consumable_Bumper",
      previewLabel: "Bumper",
      previewPath: "https://placehold.co/96x96/13202a/f8fafc?text=BM",
      availableReferences: [
        "Consumable:Consumable_Juice",
        "Consumable:Consumable_ShieldPowder",
        "Consumable:Consumable_Jetpack",
        "Consumable:Consumable_Bumper",
        "Consumable:Consumable_BananaPeel",
      ],
    },
  ],
  advanced: {
    fields: [
      {
        path: "availableItems[0]",
        label: "Allowed Items",
        category: "Pools",
        editable: true,
        valueType: "reference",
        description: "Allowed item entry 1.",
        defaultValue: "Consumable:Consumable_Juice",
        currentValue: "Consumable:Consumable_Juice",
        effectiveValue: "Consumable:Consumable_Juice",
      },
      {
        path: "availableItems[1]",
        label: "Allowed Items",
        category: "Pools",
        editable: true,
        valueType: "reference",
        description: "Allowed item entry 2.",
        defaultValue: "Consumable:Consumable_ShieldPowder",
        currentValue: "Consumable:Consumable_ShieldPowder",
        effectiveValue: "Consumable:Consumable_ShieldPowder",
      },
      {
        path: "availableItems[2]",
        label: "Allowed Items",
        category: "Pools",
        editable: true,
        valueType: "reference",
        description: "Allowed item entry 3.",
        defaultValue: "Consumable:Consumable_Jetpack",
        currentValue: "Consumable:Consumable_Jetpack",
        effectiveValue: "Consumable:Consumable_Jetpack",
      },
      {
        path: "availableItems[3]",
        label: "Allowed Items",
        category: "Pools",
        editable: true,
        valueType: "reference",
        description: "Allowed item entry 4.",
        defaultValue: "Consumable:Consumable_Bumper",
        currentValue: "Consumable:Consumable_Bumper",
        effectiveValue: "Consumable:Consumable_Bumper",
      },
    ],
    defaults: {
      "availableItems[0]": "Consumable:Consumable_Juice",
      "availableItems[1]": "Consumable:Consumable_ShieldPowder",
      "availableItems[2]": "Consumable:Consumable_Jetpack",
      "availableItems[3]": "Consumable:Consumable_Bumper",
    },
    effectiveValues: {
      "availableItems[0]": "Consumable:Consumable_Juice",
      "availableItems[1]": "Consumable:Consumable_ShieldPowder",
      "availableItems[2]": "Consumable:Consumable_Jetpack",
      "availableItems[3]": "Consumable:Consumable_Bumper",
    },
  },
  namedCollections: [
    {
      collectionId: "availableMapEntities",
      label: "Allowed Map Entities",
      totalCount: 2,
      items: [
        { index: 0, displayName: "Fishing Rod", value: "GameObject:FishingRod" },
        { index: 1, displayName: "Supply Drop Beacon", value: "GameObject:SupplyDropBeacon" },
      ],
    },
    {
      collectionId: "zoneNpcSpawnSummaries",
      label: "Zone NPC Spawns",
      totalCount: 2,
      items: [
        { index: 0, displayName: "Giant · Zone 1", subtitle: "Enabled · Density 0.75 · Count 1-2", value: { density: 0.75, min: 1, max: 2 } },
        { index: 1, displayName: "Large · Zone 2", subtitle: "Disabled · Density 0.00 · Count 0-0", value: { density: 0, min: 0, max: 0 } },
      ],
    },
    {
      collectionId: "zoneItemDropSummaries",
      label: "Zone Item Tier Chances",
      totalCount: 2,
      items: [
        { index: 0, displayName: "Giant · Zone 1", subtitle: "T1 1.00 · T2 0.80 · T3 0.40", value: { t1: 1, t2: 0.8, t3: 0.4 } },
        { index: 1, displayName: "Large · Zone 2", subtitle: "T1 0.90 · T2 0.60 · T3 0.30", value: { t1: 0.9, t2: 0.6, t3: 0.3 } },
      ],
    },
    {
      collectionId: "zoneSupplyDropSummaries",
      label: "Zone Supply Drops",
      totalCount: 2,
      items: [
        { index: 0, displayName: "Giant · Zone 1", subtitle: "Zone 0.22 · Event 0.12 · Objective SupplyDrop_Round1", value: { zoneChance: 0.22, eventChance: 0.12, objective: "SupplyDrop_Round1" } },
        { index: 1, displayName: "Large · Zone 2", subtitle: "Zone 0.18 · Event 0.10 · Objective SupplyDrop_Round2", value: { zoneChance: 0.18, eventChance: 0.1, objective: "SupplyDrop_Round2" } },
      ],
    },
  ],
  overrides: {},
  overrideStatus: cloneJson(emptyOperationStatus),
};

const arenaFishingRod: RuntimeDocument = {
  schemaVersion: 10,
  targetType: "ArenaFishingRod",
  targetKey: "ArenaFishingRod#PondAlpha",
  displayName: "Pond Alpha Fishing Rod",
  resolvedName: "Pond Alpha Fishing Rod",
  generatedAtUtc: new Date().toISOString(),
  sourceRole: "arena_fishing",
  applyTiming: "next_match",
  safetyLevel: "safe",
  quickEdit: [
    {
      setting: "Lootable Chance",
      category: "Fishing",
      path: "lootableChance",
      editable: true,
      valueType: "number",
      value: 0.12,
      defaultValue: 0.12,
      whatItDoes: "Chance that the rod rolls a lootable ability outcome.",
    },
    {
      setting: "Trash Chance",
      category: "Fishing",
      path: "trashChance",
      editable: true,
      valueType: "number",
      value: 0.3,
      defaultValue: 0.3,
      whatItDoes: "How often the rod falls back to trash outcomes.",
    },
    {
      setting: "NPC Chance Large",
      category: "Fishing",
      path: "npcChanceLarge",
      editable: true,
      valueType: "number",
      value: 0.08,
      defaultValue: 0.08,
      whatItDoes: "Chance that a large catch spawns one of the large NPC prefabs instead of loot.",
    },
  ],
  namedCollections: [
    {
      collectionId: "lootTable.loot",
      label: "Loot Table Entries",
      totalCount: 2,
      items: [
        { index: 0, displayName: "Common Loot Entry", subtitle: "Chance 0.50 · Random", value: { chance: 0.5, lootType: "Item" } },
        { index: 1, displayName: "Rare HAX Entry", subtitle: "Chance 0.15 · Weighted Chances", value: { chance: 0.15, lootType: "HAX" } },
      ],
    },
    {
      collectionId: "trashItems",
      label: "Trash Items",
      totalCount: 2,
      items: [
        { index: 0, displayName: "Boot", value: "Item:Trash_Boot" },
        { index: 1, displayName: "Tin Can", value: "Item:Trash_TinCan" },
      ],
    },
    {
      collectionId: "npcPrefabsLarge",
      label: "Large Catch NPCs",
      totalCount: 1,
      items: [{ index: 0, displayName: "Slime King", value: "GameObject:SlimeKing" }],
    },
  ],
  cardPreview: {
    title: "Pond Alpha Fishing Rod",
    shortDescription: "Fishing loot and spawn table",
    description: "Inspect reward tables, trash odds, and NPC spawn chances for this rod without digging through raw nested fields.",
    sourceHint: "Arena Fishing",
    statLines: [
      { label: "Lootable", value: "12%" },
      { label: "Trash", value: "30%" },
      { label: "Large NPC", value: "8%" },
    ],
  },
  overrides: {},
  overrideStatus: cloneJson(emptyOperationStatus),
};

const mockWorkspace: WorkspaceRoots = {
  workspaceRoot: "C:/Mock/BapBapRebalnce",
  runtimeRoot: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/Runtime",
  customRoot: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/Custom",
  nativeUiRoot: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/NativeUI",
  arenaPresetsRoot: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/ArenaPresets",
  libraryRoot: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/Library",
  backupRoot: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/LauncherBackups",
  packDropRoot: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/PackDrop",
  packDropProcessedRoot: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/PackDrop/Processed",
  packDropFailedRoot: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/PackDrop/Failed",
  installedPacksRoot: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/InstalledPacks",
  importReceiptRoot: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/ImportReceipts",
  libraryBlocksIndexPath: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/Library/Blocks.index.json",
  libraryEffectsIndexPath: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/Library/Effects.index.json",
  libraryIconsIndexPath: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/Library/Icons.index.json",
  libraryTemplatesIndexPath: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/Library/Templates.index.json",
  libraryAllOptionsIndexPath: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/Library/AllOptions.index.json",
  libraryCollectionsSharedPath: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/UserData/BalanceMod/Library/Collections.shared.json",
  gameExe: "C:/Mock/BapBapRebalnce/Gamefiles/Latest/bapbap.exe",
  modProjectRoot: "C:/Mock/BapBapRebalnce/BapBapBalanceMod",
};

const mockInstalledPacks: InstalledPackSummary[] = [
  {
    packId: "rebalancebap.mock-pack",
    packVersion: "0.1.0",
    name: "Mock Pack",
    author: "Sonic0810",
    packRoot: `${mockWorkspace.installedPacksRoot}/rebalancebap.mock-pack`,
    archivedPackPath: `${mockWorkspace.installedPacksRoot}/rebalancebap.mock-pack/pack.rbpack`,
    active: true,
    activatedAtUtc: "2026-03-23T10:55:00.000Z",
    contentFileCount: 6,
    arenaPresetCount: 2,
  },
];

const mockGameModeIndex: GameModeIndexResponse = {
  absolutePath: `${mockWorkspace.runtimeRoot}/ArenaSettings/GameModes.index.json`,
  raw: {
    schemaVersion: 1,
    targetType: "ArenaGameModesIndex",
    targetKey: "ArenaGameModes",
    currentGameModeId: 4,
    currentModeKey: "Arena",
    currentDisplayName: "Arena",
    currentClassName: "GameModeArena",
    entries: [
      {
        gameModeId: 4,
        modeKey: "Arena",
        displayName: "Arena",
        className: "GameModeArena",
        current: true,
        source: "current_lobby,live_arena_type",
        confidence: "high",
      },
      {
        gameModeId: 1,
        modeKey: "BattleRoyale",
        displayName: "Battle Royale",
        className: "GameModeBattleRoyale",
        current: false,
        source: "local_decompiled_enum",
        confidence: "medium",
      },
      {
        gameModeId: 2,
        modeKey: "Training",
        displayName: "Training",
        className: "GameModeTraining",
        current: false,
        source: "local_decompiled_enum",
        confidence: "medium",
      },
    ],
  },
};

const store = new Map<string, RuntimeDocument>([
  ["Gamefiles/Latest/UserData/BalanceMod/Runtime/Passives/0158_P_FIREWAVE.json", cloneJson(firewave)],
  ["Gamefiles/Latest/UserData/BalanceMod/Runtime/Characters/0001_ANNA/Hurtbox.json", cloneJson(annaHurtbox)],
  ["Gamefiles/Latest/UserData/BalanceMod/Runtime/Characters/0001_ANNA/AbilitySwap.json", cloneJson(annaAbilitySwap)],
  ["Gamefiles/Latest/UserData/BalanceMod/Runtime/Items/0205_AdrenalinePin_T1.json", cloneJson(adrenalinePin)],
  ["Gamefiles/Latest/UserData/BalanceMod/Runtime/Managers/AugmentManager.json", cloneJson(augmentManager)],
  ["Gamefiles/Latest/UserData/BalanceMod/Runtime/ArenaSettings/CurrentPreset.json", cloneJson(arenaCurrentPreset)],
  ["Gamefiles/Latest/UserData/BalanceMod/Runtime/ArenaSettings/CurrentLobby.json", cloneJson(arenaCurrentLobby)],
  ["Gamefiles/Latest/UserData/BalanceMod/Runtime/ArenaSettings/ArenaGameMode.json", cloneJson(arenaGameMode)],
  ["Gamefiles/Latest/UserData/BalanceMod/Runtime/ArenaSettings/Fishing/01_Pond_Alpha_Fishing_Rod.json", cloneJson(arenaFishingRod)],
  ["Gamefiles/Latest/UserData/BalanceMod/Custom/Augments/00_Example_Firewave.json", cloneJson(customFirewave)],
]);

const mtimes = new Map<string, number>(
  Array.from(store.keys()).map((key, index) => [key, Date.now() + index]),
);

function makeEntry(
  id: string,
  group: CatalogEntry["group"],
  title: string,
  subtitle: string,
  quickEditCount: number,
): CatalogEntry {
  const document = store.get(id);
  const cardPreview = document?.cardPreview;
  const iconPreviewPath = cardPreview?.iconPreviewPath ?? cardPreview?.largeCard?.iconPreviewPath ?? null;
  const iconCropX = cardPreview?.iconCropX ?? cardPreview?.largeCard?.iconCropX ?? null;
  const iconCropY = cardPreview?.iconCropY ?? cardPreview?.largeCard?.iconCropY ?? null;
  const iconCropWidth = cardPreview?.iconCropWidth ?? cardPreview?.largeCard?.iconCropWidth ?? null;
  const iconCropHeight = cardPreview?.iconCropHeight ?? cardPreview?.largeCard?.iconCropHeight ?? null;
  const iconSourceWidth = cardPreview?.iconSourceWidth ?? cardPreview?.largeCard?.iconSourceWidth ?? null;
  const iconSourceHeight = cardPreview?.iconSourceHeight ?? cardPreview?.largeCard?.iconSourceHeight ?? null;

  return {
    id,
    group,
    title: document?.resolvedName ?? document?.displayName ?? title,
    subtitle,
    relativePath: id,
    absolutePath: `${mockWorkspace.workspaceRoot}/${id}`,
    targetType: document?.targetType ?? null,
    targetKey: document?.targetKey ?? null,
    displayName: document?.displayName ?? title,
    iconPreviewPath,
    iconCropX,
    iconCropY,
    iconCropWidth,
    iconCropHeight,
    iconSourceWidth,
    iconSourceHeight,
    tags: [group],
    quickEditCount,
    hasQuickEdit: quickEditCount > 0,
    updatedAtMs: mtimes.get(id) ?? Date.now(),
  };
}

const baseMockCatalog: CatalogGroup[] = [
  {
    key: "augments",
    label: "Augments",
    count: 1,
    entries: [
      makeEntry(
        "Gamefiles/Latest/UserData/BalanceMod/Runtime/Passives/0158_P_FIREWAVE.json",
        "augments",
        "Fire Wave",
        "Argument",
        3,
      ),
    ],
  },
  {
    key: "items",
    label: "Items",
    count: 1,
    entries: [
      makeEntry(
        "Gamefiles/Latest/UserData/BalanceMod/Runtime/Items/0205_AdrenalinePin_T1.json",
        "items",
        "#Style Factor",
        "Item",
        4,
      ),
    ],
  },
  {
    key: "characters",
    label: "Characters",
    count: 3,
    entries: [
      makeEntry(
        "Gamefiles/Latest/UserData/BalanceMod/Runtime/Characters/0001_ANNA/Hurtbox.json",
        "characters",
        "ANNA / Hurtbox",
        "Character hurtbox",
        2,
      ),
      makeEntry(
        "Gamefiles/Latest/UserData/BalanceMod/Runtime/Characters/0001_ANNA/AbilitySwap.json",
        "characters",
        "ANNA / Ability Swap",
        "Ability swap",
        0,
      ),
    ],
  },
  {
    key: "managers",
    label: "Managers",
    count: 1,
    entries: [
      makeEntry(
        "Gamefiles/Latest/UserData/BalanceMod/Runtime/Managers/AugmentManager.json",
        "managers",
        "Augment Manager",
        "Manager",
        2,
      ),
    ],
  },
  {
    key: "gamemode",
    label: "Game Mode",
    count: 4,
    entries: [
      makeEntry(
        "Gamefiles/Latest/UserData/BalanceMod/Runtime/ArenaSettings/CurrentPreset.json",
        "gamemode",
        "Current Preset",
        "Game mode preset",
        4,
      ),
      makeEntry(
        "Gamefiles/Latest/UserData/BalanceMod/Runtime/ArenaSettings/CurrentLobby.json",
        "gamemode",
        "Live Snapshot",
        "Live snapshot",
        4,
      ),
      makeEntry(
        "Gamefiles/Latest/UserData/BalanceMod/Runtime/ArenaSettings/ArenaGameMode.json",
        "gamemode",
        "Arena Game Mode",
        "Advanced game mode",
        5,
      ),
      makeEntry(
        "Gamefiles/Latest/UserData/BalanceMod/Runtime/ArenaSettings/Fishing/01_Pond_Alpha_Fishing_Rod.json",
        "gamemode",
        "Pond Alpha Fishing Rod",
        "Fishing loot table",
        3,
      ),
    ],
  },
  {
    key: "custom",
    label: "Create Something",
    count: 1,
    entries: [
      makeEntry(
        "Gamefiles/Latest/UserData/BalanceMod/Custom/Augments/00_Example_Firewave.json",
        "custom",
        "Custom Firewave Plus",
        "Template",
        0,
      ),
    ],
  },
  { key: "nativeui", label: "Dev Settings", count: 0, entries: [] },
];

export const mockApi = {
  async bootstrap(): Promise<BootstrapPayload> {
    const catalog = buildMockCatalog();
    return {
      workspace: mockWorkspace,
      catalog,
      summary: buildMockSummary(catalog),
      settings: { workspaceRoot: mockWorkspace.workspaceRoot },
    };
  },

  async pickWorkspaceRoot(): Promise<string | null> {
    return mockWorkspace.workspaceRoot;
  },

  async saveWorkspaceRoot(): Promise<BootstrapPayload> {
    return this.bootstrap();
  },

  async openDocument(workspaceRoot: string, absolutePath: string): Promise<DocumentPayload> {
    const relative = normalizePath(workspaceRoot, absolutePath);
    const raw = store.get(relative);
    if (!raw) {
      throw new Error("Mock document not found.");
    }
    return {
      absolutePath,
      relativePath: relative,
      mtimeMs: mtimes.get(relative) ?? Date.now(),
      raw: cloneJson(raw),
    };
  },

  async saveDocument(request: SaveDocumentRequest): Promise<SaveDocumentResponse> {
    const relative = normalizePath(request.workspaceRoot, request.absolutePath);
    store.set(relative, cloneJson(request.raw as RuntimeDocument));
    const mtime = Date.now();
    mtimes.set(relative, mtime);
    return {
      absolutePath: request.absolutePath,
      mtimeMs: mtime,
      backupPath: request.createBackup ? `${mockWorkspace.backupRoot}/mock-save.json` : null,
      savedAtUtc: new Date().toISOString(),
    };
  },

  async createCustomDraft(request: CreateCustomDraftRequest): Promise<DocumentPayload> {
    const sourceRelative = typeof request.sourceAbsolutePath === "string" && request.sourceAbsolutePath.trim()
      ? normalizePath(request.workspaceRoot, request.sourceAbsolutePath)
      : listMockCustomDraftIds()[0];
    const sourceRaw = (sourceRelative ? store.get(sourceRelative) : null) ?? customFirewave;
    const displayName = resolveMockCustomDraftName(sourceRaw, request.suggestedName);
    const nextDraft = cloneJson(sourceRaw);

    nextDraft.displayName = displayName;
    nextDraft.key = buildUniqueMockCustomKey(displayName);
    delete nextDraft.id;
    delete nextDraft.resolvedName;
    nextDraft.launcher = {
      ...(nextDraft.launcher && typeof nextDraft.launcher === "object" && !Array.isArray(nextDraft.launcher)
        ? nextDraft.launcher
        : {}),
      lastStarterSuggestedName: displayName,
    };

    const relativePath = buildUniqueMockCustomRelativePath(
      `Gamefiles/Latest/UserData/BalanceMod/Custom/Augments/${buildMockCustomFileToken(displayName)}.json`,
    );
    const absolutePath = `${request.workspaceRoot}/${relativePath}`;
    const mtime = Date.now();

    store.set(relativePath, nextDraft);
    mtimes.set(relativePath, mtime);

    return {
      absolutePath,
      relativePath,
      mtimeMs: mtime,
      raw: cloneJson(nextDraft),
    };
  },

  async createWorkspaceSnapshot(): Promise<SnapshotBackupResponse> {
    return {
      backupPath: `${mockWorkspace.backupRoot}/mock-snapshot`,
      createdAtUtc: new Date().toISOString(),
    };
  },

  async repairWorkspaceSupportFiles(): Promise<WorkspaceRepairResponse> {
    return {
      backupPath: `${mockWorkspace.backupRoot}/mock-repair`,
      repairedSupportFiles: [
        "Library/Blocks.index.json",
        "Library/Icons.index.json",
        "Custom/Icons.index.json",
        "NativeUI/HiddenDev/Augments.index.json",
      ],
      repairedAtUtc: new Date().toISOString(),
    };
  },

  async launchGame(): Promise<void> {
    return undefined;
  },

  async openInExplorer(): Promise<void> {
    return undefined;
  },

  async pickPackExportPath(): Promise<string | null> {
    return "C:/Mock/BapBapRebalnce/RebalanceBAPPack.rbpack";
  },

  async pickPackImportPath(): Promise<string | null> {
    return "C:/Mock/BapBapRebalnce/ImportedPack.rbpack";
  },

  async listImportReceipts(_workspaceRoot?: string): Promise<ConfigPackReceiptSummary[]> {
    return [
      {
        receiptPath: `${mockWorkspace.importReceiptRoot}/2026-03-22T12-20-00_rebalancebap.mock-pack.json`,
        packId: "rebalancebap.mock-pack",
        packVersion: "0.1.0",
        importedAtUtc: "2026-03-22T12:20:00.000Z",
        importedBy: "RebalanceBAP Launcher",
        importedFileCount: 2,
        backupPath: `${mockWorkspace.backupRoot}/receipt-backup`,
      },
    ];
  },

  async listInstalledPacks(_workspaceRoot?: string): Promise<InstalledPackSummary[]> {
    return cloneJson(mockInstalledPacks);
  },

  async setActiveContentPack(_workspaceRoot: string, packId: string): Promise<InstalledPackSummary> {
    const next = mockInstalledPacks.find((pack) => pack.packId === packId);
    if (!next) {
      throw new Error(`Mock pack '${packId}' was not found.`);
    }
    const activatedAtUtc = new Date().toISOString();
    for (const pack of mockInstalledPacks) {
      pack.active = pack.packId === packId;
      pack.activatedAtUtc = pack.packId === packId ? activatedAtUtc : null;
    }
    return cloneJson({ ...next, active: true, activatedAtUtc });
  },

  async readGameModeIndex(_workspaceRoot?: string): Promise<GameModeIndexResponse> {
    return cloneJson(mockGameModeIndex);
  },

  async refreshGameModeProbe(_workspaceRoot?: string): Promise<GameModeIndexResponse> {
    return cloneJson(mockGameModeIndex);
  },

  async readLibraryMetadata(_workspaceRoot?: string): Promise<LibraryMetadataResponse> {
    return cloneJson(mockLibraryMetadata);
  },

  async listLibraryEntries(request: LibraryEntryQuery): Promise<LibraryEntryListResponse> {
    const search = request.search?.trim().toLowerCase() ?? "";
    const optionIdSet = request.optionIds?.length ? new Set(request.optionIds) : null;
    const filtered = mockLibraryMetadata.allOptions
      .filter((entry) => {
        if (request.category && request.category !== "all" && entry.category !== request.category) return false;
        if (request.source && request.source !== "all" && entry.source !== request.source) return false;
        if (request.safety && request.safety !== "all" && (entry.riskLevel ?? "safe") !== request.safety) return false;
        if (request.targetType && request.targetType !== "all" && (entry.targetType ?? "") !== request.targetType) return false;
        if (request.valueType && request.valueType !== "all" && (entry.valueType ?? "") !== request.valueType) return false;
        if (request.editable === "editable" && entry.editable !== true) return false;
        if (request.editable === "readonly" && entry.editable !== false) return false;
        if (optionIdSet && !optionIdSet.has(entry.optionId)) return false;
        if (!search) return true;
        const haystack = [
          entry.label,
          entry.description,
          entry.displayName,
          entry.path,
          entry.category,
          entry.sourceGroup,
          ...(entry.searchHints ?? []),
        ]
          .filter((value): value is string => Boolean(value))
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      })
      .sort(sortLibraryOptions);

    const limit = Math.max(1, request.limit ?? 200);
    return {
      entries: cloneJson(filtered.slice(0, limit)),
      totalCount: filtered.length,
      moreAvailable: filtered.length > limit,
    };
  },

  async readOperationCapabilities(workspaceRoot: string, absolutePath: string): Promise<OperationCapabilitiesResponse> {
    const relative = normalizePath(workspaceRoot, absolutePath);
    const raw = store.get(relative);
    if (!raw) {
      throw new Error("Mock document not found.");
    }
    return summarizeCapabilities(raw, absolutePath, relative);
  },
};

function buildMockCatalog(): CatalogGroup[] {
  const customEntries = listMockCustomDraftIds().map((relativePath) =>
    makeEntry(relativePath, "custom", "Custom augment", "Template", 0),
  );

  return baseMockCatalog.map((group) =>
    group.key === "custom"
      ? {
          ...group,
          count: customEntries.length,
          entries: customEntries,
        }
      : {
          ...group,
          count: group.entries.length,
          entries: [...group.entries],
        },
  );
}

function buildMockSummary(catalog: CatalogGroup[]) {
  const byKey = new Map(catalog.map((group) => [group.key, group.entries.length]));
  const totalCount = catalog.reduce((sum, group) => sum + group.entries.length, 0);

  return {
    augmentCount: byKey.get("augments") ?? 0,
    itemCount: byKey.get("items") ?? 0,
    managerCount: byKey.get("managers") ?? 0,
    characterCount: byKey.get("characters") ?? 0,
    customCount: byKey.get("custom") ?? 0,
    nativeUiCount: byKey.get("nativeui") ?? 0,
    totalCount,
  };
}

function listMockCustomDraftIds(): string[] {
  return Array.from(store.keys())
    .filter((relativePath) => relativePath.startsWith("Gamefiles/Latest/UserData/BalanceMod/Custom/Augments/"))
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function resolveMockCustomDraftName(sourceRaw: RuntimeDocument, suggestedName?: string | null): string {
  if (typeof suggestedName === "string" && suggestedName.trim()) {
    return suggestedName.trim();
  }

  const sourceDisplayName =
    typeof sourceRaw.displayName === "string" && sourceRaw.displayName.trim()
      ? sourceRaw.displayName.trim()
      : "Custom augment";

  return sourceDisplayName.toLowerCase().startsWith("copy of ")
    ? sourceDisplayName
    : `Copy of ${sourceDisplayName}`;
}

function buildMockCustomFileToken(displayName: string): string {
  const token = displayName.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return token || "New_Custom_Augment";
}

function buildMockCustomKeyBase(displayName: string): string {
  const slug = displayName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug ? `P_CUSTOM_${slug}` : "P_CUSTOM_NEW_AUGMENT";
}

function buildUniqueMockCustomKey(displayName: string): string {
  const existingKeys = new Set(
    listMockCustomDraftIds()
      .map((relativePath) => store.get(relativePath)?.key)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim().toUpperCase()),
  );

  const baseKey = buildMockCustomKeyBase(displayName);
  let candidate = baseKey;
  let index = 2;
  while (existingKeys.has(candidate)) {
    candidate = `${baseKey}_${index}`;
    index += 1;
  }
  return candidate;
}

function buildUniqueMockCustomRelativePath(baseRelativePath: string): string {
  const match = baseRelativePath.match(/^(.*?)(?:_([0-9]+))?(\.json)$/i);
  const prefix = match?.[1] ?? baseRelativePath.replace(/\.json$/i, "");
  const suffix = match?.[3] ?? ".json";

  let candidate = `${prefix}${suffix}`;
  let index = 2;
  while (store.has(candidate)) {
    candidate = `${prefix}_${index}${suffix}`;
    index += 1;
  }
  return candidate;
}

function sortLibraryOptions(left: LibraryAllOptionEntry, right: LibraryAllOptionEntry): number {
  return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
}

function normalizePath(workspaceRoot: string, absolutePath: string): string {
  const normalizedWorkspace = workspaceRoot.split("\\").join("/");
  const normalizedAbsolute = absolutePath.split("\\").join("/");
  return normalizedAbsolute.replace(`${normalizedWorkspace}/`, "");
}

function summarizeCapabilities(document: RuntimeDocument, absolutePath: string, relativePath: string): OperationCapabilitiesResponse {
  const capabilities: OperationCapability[] = [];

  for (const item of document.quickEdit ?? []) {
    if (!item.editable || !item.path) {
      continue;
    }
    capabilities.push({
      kind: "edit",
      path: item.path,
      label: item.setting,
      description: item.whatItDoes,
      category: item.category,
      valueType: item.valueType,
      safe: true,
      riskLevel: "safe",
      currentValue: item.value,
      defaultValue: item.defaultValue,
    });
  }

  for (const editor of document.collectionEditors ?? []) {
    if (editor.canAdd) {
      capabilities.push({
        kind: "add",
        path: editor.path,
        label: `Add ${editor.itemLabel ?? "entry"}`,
        description: editor.description,
        category: "collection",
        safe: true,
        riskLevel: "safe",
      });
    }
    if (editor.canRemove) {
      const safeRemove = editor.removeBehavior?.includes("soft") ?? false;
      capabilities.push({
        kind: "remove",
        path: editor.path,
        label: `Remove ${editor.itemLabel ?? "entry"}`,
        description: editor.description,
        category: "collection",
        safe: safeRemove,
        riskLevel: safeRemove ? "safe" : "advanced",
      });
    }
    if (editor.canReplace) {
      capabilities.push({
        kind: "replace",
        path: editor.path,
        label: `Replace ${editor.itemLabel ?? "entry"}`,
        description: editor.description,
        category: "collection",
        safe: true,
        riskLevel: "safe",
      });
    }
    if (editor.canClear) {
      const safeClear = editor.supportsSoftRemove ?? false;
      capabilities.push({
        kind: "clear",
        path: editor.path,
        label: `Clear ${editor.itemLabel ?? "entry"}`,
        description: editor.description,
        category: "collection",
        safe: safeClear,
        riskLevel: safeClear ? "safe" : "advanced",
      });
    }
    if (editor.canDuplicate) {
      capabilities.push({
        kind: "duplicate",
        path: editor.path,
        label: `Duplicate ${editor.itemLabel ?? "entry"}`,
        description: editor.description,
        category: "collection",
        safe: true,
        riskLevel: "medium",
      });
    }
  }

  for (const choice of document.referenceChoices ?? []) {
    capabilities.push({
      kind: "swap",
      path: choice.path,
      label: choice.label,
      description: "Swap a linked asset or effect.",
      category: "reference",
      valueType: "reference",
      safe: true,
      riskLevel: "safe",
      currentValue: choice.currentReference,
      referenceType: choice.referenceType,
      previewLabel: choice.previewLabel,
      previewPath: choice.previewPath,
      options: (choice.availableReferences?.length ? choice.availableReferences : choice.suggestions),
    });
  }

  for (const suggestion of document.librarySuggestions ?? []) {
    capabilities.push({
      kind: suggestion.operationType as OperationCapability["kind"],
      path: suggestion.targetPath,
      label: suggestion.label,
      description: suggestion.description,
      category: suggestion.category,
      family: suggestion.family,
      valueType: suggestion.fields?.[0]?.valueType,
      safe: suggestion.riskLevel !== "advanced",
      riskLevel: suggestion.riskLevel ?? "safe",
      defaultValue: suggestion.fields?.[0]?.defaultValue,
      options: suggestion.fields?.[0]?.options,
      previewPath: suggestion.iconPreviewPath,
      libraryBlockId: suggestion.blockId,
    });
  }

  if (document.targetType === "CharacterAbilitySwap") {
    const values = document.advanced?.effectiveValues ?? {};
    const slotPaths = Object.keys(values).filter((path) => /^slots\[\d+\]\.sourceTargetKey$/.test(path));
    for (const slotPath of slotPaths) {
      capabilities.push({
        kind: "swap",
        path: slotPath,
        label: slotPath.replace(/^slots\[(\d+)\]\.sourceTargetKey$/, (_, slotIndex) => `Ability Slot ${Number.parseInt(slotIndex, 10) + 1}`),
        description: "Swap this ability slot to another exported source.",
        category: "ability-swap",
        valueType: "reference",
        safe: false,
        riskLevel: "medium",
      });
    }
  }

  return {
    absolutePath,
    relativePath,
    targetType: typeof document.targetType === "string" ? document.targetType : null,
    targetKey: typeof document.targetKey === "string" ? document.targetKey : null,
    displayName: typeof document.displayName === "string" ? document.displayName : null,
    editableCount: capabilities.filter((capability) => capability.kind === "edit").length,
    addableCount: capabilities.filter((capability) => capability.kind === "add").length,
    removableCount: capabilities.filter((capability) => capability.kind === "remove").length,
    swappableCount: capabilities.filter((capability) => capability.kind === "swap").length,
    warnings: document.targetType === "CharacterAbilitySwap"
      ? ["Ability swaps are validated at runtime. Incompatible swaps are skipped safely."]
      : [],
    capabilities,
    librarySuggestions: cloneJson(document.librarySuggestions ?? []),
    librarySlots: cloneJson(document.librarySlots ?? []),
    iconChoices: cloneJson(document.iconChoices ?? []),
    nativeUiPlacement: cloneJson(document.nativeUiPlacement ?? null),
  };
}

export function buildMockDocumentAfterOverrideChange(
  relativePath: string,
  overrides: Record<string, JsonValue>,
): RuntimeDocument {
  const current = store.get(relativePath);
  if (!current) {
    throw new Error("Mock document not found.");
  }
  return materializeRuntimeDocument(current, overrides, current.operations?.entries ?? []);
}

export function getMockEditableOverrides(relativePath: string): Record<string, JsonValue> {
  const current = store.get(relativePath);
  if (!current) {
    return {};
  }
  return toEditableOverrideMap(current);
}

export function cloneCustomMock(relativePath: string): JsonObject {
  const current = store.get(relativePath);
  if (!current) {
    throw new Error("Mock custom document not found.");
  }
  return cloneJson(current) as unknown as JsonObject;
}
