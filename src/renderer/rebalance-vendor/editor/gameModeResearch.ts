import type { JsonValue, NamedCollectionSummary, QuickEditEntry, RuntimeDocument } from "./types";

export interface GameModeResearchStat {
  label: string;
  value: string;
}

export interface GameModeResearchMatch {
  label: string;
  path: string;
  description?: string;
  valuePreview: string;
}

export interface GameModeResearchTopic {
  key: string;
  label: string;
  subtitle: string;
  stats: GameModeResearchStat[];
  highlights: string[];
  collectionLabels: string[];
  summaryText: string;
  editableMatches: GameModeResearchMatch[];
}

interface ResearchFieldRecord {
  path: string;
  label: string;
  description?: string;
  value: JsonValue;
}

interface ResearchTopicDefinition {
  key: string;
  label: string;
  subtitle: string;
  pathTerms: string[];
  collectionIds: string[];
  extraLines: string[];
}

const RESEARCH_TOPIC_DEFINITIONS: ResearchTopicDefinition[] = [
  {
    key: "map-systems",
    label: "Map systems",
    subtitle: "Look at map rotation, zone ownership, and which map-side systems this source is already exposing.",
    pathTerms: ["map", "zone", "presetoption", "arena", "fishing", "supplydrop", "eventdrop", "eventobjective", "lootable"],
    collectionIds: ["availableMapEntities", "settingsPresetOptionData", "zoneSupplyDropSummaries"],
    extraLines: [
      "Can we change map rotation or specific arena map picks from this source?",
      "Which zone-owned values already exist here before we touch decompiled-only systems?",
      "Which map entities or interactables like fishing rods are already visible in the runtime export?",
      "If angel-route or other map-route logic does not appear here, this runtime export is not exposing it as a dedicated surface yet.",
    ],
  },
  {
    key: "drops-and-loot",
    label: "Drops and loot",
    subtitle: "Focus on item tier chances, gold drops, consumables, supply drops, and other loot-facing values.",
    pathTerms: ["drop", "loot", "itemtier", "gold", "potion", "supply", "fishing", "trash", "lootable"],
    collectionIds: ["availableItems", "zoneItemDropSummaries", "zoneSupplyDropSummaries", "lootTable.loot", "trashItems"],
    extraLines: [
      "Which knobs already influence floor loot, gold, potion, or supply-drop behavior?",
      "Which item pools are currently allowed in this game mode?",
      "If this source is a fishing system, which loot-table rows and trash outcomes are already exported?",
    ],
  },
  {
    key: "spawns-and-entities",
    label: "Spawns and entities",
    subtitle: "Review NPC spawns, respawns, entity pools, and map objects without hunting through raw indexed paths.",
    pathTerms: ["spawn", "respawn", "npc", "entity", "bot", "fishing", "prefab", "lootable", "mapentity", "interactable"],
    collectionIds: ["availableEntities", "availableMapEntities", "zoneNpcSpawnSummaries", "zoneSupplyDropSummaries", "npcPrefabsSmall", "npcPrefabsMed", "npcPrefabsLarge"],
    extraLines: [
      "Which NPC or entity pools are currently wired into this source?",
      "Which spawn-related values are editable right now from the runtime export?",
      "If this source can spawn NPCs from fishing or map interactions, which prefab lists are already exported?",
      "Use the map-entity list plus the zone summaries together when you want map objects and their spawn behavior in one place.",
    ],
  },
  {
    key: "modifiers-and-rules",
    label: "Modifiers and rules",
    subtitle: "Use this when you want the high-level rules layer: modifiers, round scoring, team/lobby rules, and similar switches.",
    pathTerms: ["modifier", "score", "team", "lobby", "timed", "friendly", "rule", "preset", "supplydrop"],
    collectionIds: ["scoresByRound", "TeamConfigs", "TeamSizeTranslationKeys", "settingsPresetOptionData"],
    extraLines: [
      "Which rules already have safe runtime fields versus UI-only labels?",
      "What should we test in-lobby versus only after the next match starts?",
    ],
  },
];

export function buildGameModeResearchTopics(
  document: RuntimeDocument | undefined,
  sourceTitle: string,
): GameModeResearchTopic[] {
  if (!document) {
    return [];
  }

  const fields = collectResearchFields(document);
  const collections = document.namedCollections ?? [];

  return RESEARCH_TOPIC_DEFINITIONS.map((definition) =>
    buildResearchTopic(definition, fields, collections, sourceTitle),
  ).filter((topic): topic is GameModeResearchTopic => Boolean(topic));
}

function buildResearchTopic(
  definition: ResearchTopicDefinition,
  fields: ResearchFieldRecord[],
  collections: NamedCollectionSummary[],
  sourceTitle: string,
): GameModeResearchTopic | null {
  const matchedFields = fields.filter((field) => matchesTopic(field, definition.pathTerms));
  const matchedCollections = collections.filter((collection) =>
    definition.collectionIds.some((collectionId) => collection.collectionId === collectionId),
  );

  if (!matchedFields.length && !matchedCollections.length) {
    return null;
  }

  const highlights = [
    ...buildFieldHighlights(matchedFields),
    ...buildCollectionHighlights(matchedCollections),
    ...definition.extraLines,
  ].slice(0, 8);

  return {
    key: definition.key,
    label: definition.label,
    subtitle: definition.subtitle,
    stats: [
      { label: "Editable fields", value: String(matchedFields.length) },
      { label: "Collections", value: String(matchedCollections.length) },
      {
        label: "Next step",
        value: matchedCollections.length ? "Use the lists plus the fields together" : "Use the runtime fields as the first probe",
      },
    ],
    highlights,
    collectionLabels: matchedCollections.map((collection) => `${collection.label} (${collection.totalCount})`),
    summaryText: buildResearchSummaryText(sourceTitle, definition, matchedFields, matchedCollections),
    editableMatches: matchedFields.slice(0, 6).map((field) => ({
      label: field.label,
      path: field.path,
      description: field.description,
      valuePreview: formatResearchValue(field.value),
    })),
  };
}

function collectResearchFields(document: RuntimeDocument): ResearchFieldRecord[] {
  const records: ResearchFieldRecord[] = [];
  const seenPaths = new Set<string>();
  const pushRecord = (
    path: string | undefined,
    label: string | undefined,
    description: string | undefined,
    value: JsonValue,
  ) => {
    if (!path || seenPaths.has(path)) {
      return;
    }

    seenPaths.add(path);
    records.push({
      path,
      label: label ?? path,
      description,
      value,
    });
  };

  for (const entry of document.quickEdit ?? []) {
    pushRecord(entry.path, entry.setting, entry.whatItDoes, entry.value);
  }

  for (const group of document.simpleSettings?.groups ?? []) {
    for (const entry of group.entries ?? []) {
      pushRecord(entry.path, entry.name, entry.description, entry.currentValue ?? entry.defaultValue ?? null);
    }
  }

  for (const field of document.advanced?.fields ?? []) {
    pushRecord(
      field.path,
      field.label ?? field.path,
      field.description,
      field.effectiveValue ?? field.currentValue ?? document.advanced?.effectiveValues?.[field.path] ?? document.advanced?.defaults?.[field.path] ?? null,
    );
  }

  return records;
}

function matchesTopic(field: ResearchFieldRecord, pathTerms: string[]): boolean {
  const text = `${field.path} ${field.label} ${field.description ?? ""}`.toLowerCase();
  return pathTerms.some((term) => text.includes(term));
}

function buildFieldHighlights(fields: ResearchFieldRecord[]): string[] {
  return fields
    .slice(0, 4)
    .map((field) => `${field.label}: ${formatResearchValue(field.value)} (${field.path})`);
}

function buildCollectionHighlights(collections: NamedCollectionSummary[]): string[] {
  return collections.slice(0, 3).map((collection) => {
    const topItems = (collection.items ?? [])
      .slice(0, 3)
      .map((item) => item.displayName ?? item.key ?? `Entry ${item.index + 1}`)
      .join(", ");
    return topItems
      ? `${collection.label}: ${topItems}`
      : `${collection.label}: ${collection.totalCount} captured entries`;
  });
}

function buildResearchSummaryText(
  sourceTitle: string,
  definition: ResearchTopicDefinition,
  fields: ResearchFieldRecord[],
  collections: NamedCollectionSummary[],
): string {
  const fieldLines = fields
    .slice(0, 10)
    .map(
      (field) =>
        `- ${field.label} (${field.path}) = ${formatResearchValue(field.value)}${field.description ? ` | ${field.description}` : ""}`,
    );
  const collectionLines = collections
    .slice(0, 5)
    .map((collection) => {
      const sample = (collection.items ?? [])
        .slice(0, 4)
        .map((item) => item.displayName ?? item.key ?? `Entry ${item.index + 1}`)
        .join(", ");
      return sample
        ? `- ${collection.label} (${collection.totalCount}): ${sample}`
        : `- ${collection.label} (${collection.totalCount})`;
    });

  return [
    `Research topic: ${definition.label}`,
    `Source: ${sourceTitle}`,
    "",
    definition.subtitle,
    "",
    "Editable runtime fields:",
    ...(fieldLines.length ? fieldLines : ["- No matching quick-edit fields were captured in this document."]),
    "",
    "Named runtime collections:",
    ...(collectionLines.length ? collectionLines : ["- No named collections were captured for this topic."]),
    "",
    "Questions this surface can answer right now:",
    ...definition.extraLines.map((line) => `- ${line}`),
  ].join("\n");
}

function formatResearchValue(value: JsonValue): string {
  if (Array.isArray(value)) {
    return value.map((entry) => formatResearchValue(entry)).join(", ");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return value ? "Enabled" : "Disabled";
  }
  return String(value ?? "null");
}
