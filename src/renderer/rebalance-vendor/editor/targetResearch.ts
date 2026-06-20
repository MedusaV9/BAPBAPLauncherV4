import type { JsonValue, NamedCollectionSummary, RuntimeDocument } from "./types";

export interface TargetResearchStat {
  label: string;
  value: string;
}

export interface TargetResearchTopic {
  key: string;
  label: string;
  subtitle: string;
  stats: TargetResearchStat[];
  highlights: string[];
  collectionLabels: string[];
  summaryText: string;
}

interface ResearchFieldRecord {
  path: string;
  label: string;
  description?: string;
  value: JsonValue;
}

interface TargetResearchTopicDefinition {
  key: string;
  label: string;
  subtitle: string;
  pathTerms: string[];
  collectionIds: string[];
  extraLines: string[];
}

const TARGET_RESEARCH_TOPIC_DEFINITIONS: TargetResearchTopicDefinition[] = [
  {
    key: "behavior-and-spawn",
    label: "Behavior and spawn",
    subtitle: "Use this to understand how the effect triggers, how fast it moves, how long it lives, and what it spawns or links into.",
    pathTerms: [
      "spawn",
      "spellprefab",
      "empoweredspellprefab",
      "ttl",
      "speed",
      "cooldown",
      "targetability",
      "forwardspawnamount",
      "empower",
      "damage",
      "range",
      "firewave",
    ],
    collectionIds: [],
    extraLines: [
      "Which fields change the actual spawned object versus only the card text?",
      "Which fields affect travel speed, lifetime, or cooldown before the next trigger?",
    ],
  },
  {
    key: "drops-and-loot",
    label: "Drops and loot",
    subtitle: "Use this when the target can roll items, gear tiers, unique drops, pins, or other reward-table style data.",
    pathTerms: [
      "drop",
      "loot",
      "gear",
      "tierprobability",
      "pinchance",
      "uniquechance",
      "overridepin",
      "overrideunique",
      "currency",
      "consumable",
    ],
    collectionIds: ["configuration.gearDrops", "lootTable.loot", "trashItems"],
    extraLines: [
      "Which tiers are currently weighted highest?",
      "Are unique or pin rolls already possible from this target?",
    ],
  },
  {
    key: "linked-effects",
    label: "Linked effects",
    subtitle: "Review linked sub-passives, status effects, and secondary effect chains without hunting through every nested path manually.",
    pathTerms: [
      "statuseffect",
      "p_firewave_",
      "linked",
      "burn",
      "stun",
      "aoe",
      "range",
      "noabilities",
      "status",
    ],
    collectionIds: [
      "configuration.statusEffects",
      "configuration.P_FIREWAVE_BURN.configuration.statusEffects",
      "configuration.P_FIREWAVE_STUN.configuration.statusEffects",
    ],
    extraLines: [
      "Which linked effects are already exposed as editable runtime data?",
      "Do the secondary effects carry their own duration, multiplier, or reference swaps?",
    ],
  },
  {
    key: "text-and-presentation",
    label: "Text and presentation",
    subtitle: "Use this before changing card text, icon references, or runtime text keys so you can separate gameplay values from presentation values.",
    pathTerms: [
      "description",
      "shortdescription",
      "icon",
      "title",
      "name",
      "translationkey",
      "localized",
      "sprite",
    ],
    collectionIds: [],
    extraLines: [
      "If gameplay changed but the description did not, check the translation-key fields here before touching raw stat paths.",
      "Use this surface to tell text-only changes apart from actual balance changes.",
    ],
  },
];

export function buildTargetResearchTopics(
  document: RuntimeDocument | undefined,
  sourceTitle: string,
): TargetResearchTopic[] {
  if (!document) {
    return [];
  }

  const fields = collectResearchFields(document);
  const collections = document.namedCollections ?? [];
  const keyText = `${document.targetKey ?? ""} ${document.key ?? ""} ${sourceTitle}`.toLowerCase();

  return TARGET_RESEARCH_TOPIC_DEFINITIONS.map((definition) =>
    buildTargetResearchTopic(definition, fields, collections, sourceTitle, keyText),
  ).filter((topic): topic is TargetResearchTopic => Boolean(topic));
}

function buildTargetResearchTopic(
  definition: TargetResearchTopicDefinition,
  fields: ResearchFieldRecord[],
  collections: NamedCollectionSummary[],
  sourceTitle: string,
  keyText: string,
): TargetResearchTopic | null {
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
    ...buildContextHighlights(keyText, definition.key),
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
        label: "Best use",
        value: matchedCollections.length ? "Read the grouped data first" : "Read the editable paths first",
      },
    ],
    highlights,
    collectionLabels: matchedCollections.map((collection) => `${collection.label} (${collection.totalCount})`),
    summaryText: buildResearchSummaryText(sourceTitle, definition, matchedFields, matchedCollections, keyText),
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

function buildContextHighlights(keyText: string, topicKey: string): string[] {
  if (keyText.includes("p_box#234") || keyText.includes("box")) {
    if (topicKey === "drops-and-loot") {
      return [
        "Box already exposes three gear-drop rows, each with separate tier weights plus unique and pin rolls.",
        "The tierProbability rows currently bias the Box toward Rare, Epic, and Legendary outcomes instead of early-tier gear.",
      ];
    }
  }

  if (keyText.includes("p_firewave#158") || keyText.includes("firewave")) {
    if (topicKey === "behavior-and-spawn") {
      return [
        "Firewave exposes the spawned prefab, empowered prefab, target ability, travel speed, lifetime, and forward spawn amount directly in runtime data.",
        "The actual gameplay shape is split between the main passive and linked AoE, Burn, Range, No Abilities, and Stun sub-passives.",
      ];
    }
    if (topicKey === "linked-effects") {
      return [
        "Firewave already exports nested Burn and Stun status-effect paths, including duration, multiplier, and the referenced status-effect asset.",
        "This means effect behavior is partly in the main Firewave config and partly in linked sub-passive/status branches.",
      ];
    }
  }

  return [];
}

function buildResearchSummaryText(
  sourceTitle: string,
  definition: TargetResearchTopicDefinition,
  fields: ResearchFieldRecord[],
  collections: NamedCollectionSummary[],
  keyText: string,
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
    ...(fieldLines.length ? fieldLines : ["- No matching editable fields were captured for this topic."]),
    "",
    "Named runtime collections:",
    ...(collectionLines.length ? collectionLines : ["- No named collections were captured for this topic."]),
    "",
    "Concrete observations:",
    ...buildContextHighlights(keyText, definition.key).map((line) => `- ${line}`),
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
