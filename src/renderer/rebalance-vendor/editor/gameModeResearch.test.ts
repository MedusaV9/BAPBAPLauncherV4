import { describe, expect, it } from "vitest";

import { buildGameModeResearchTopics } from "./gameModeResearch";
import type { RuntimeDocument } from "./types";

describe("buildGameModeResearchTopics", () => {
  it("builds topic summaries from matching quick-edit fields and named collections", () => {
    const document: RuntimeDocument = {
      displayName: "Arena Game Mode",
      quickEdit: [
        {
          setting: "Enable Game Modifiers",
          category: "Rules",
          path: "enableGameModifiers",
          editable: true,
          valueType: "boolean",
          value: true,
        },
        {
          setting: "Potion Drop Chance Mult",
          category: "Drops",
          path: "potionDropChanceMult",
          editable: true,
          valueType: "number",
          value: 1.25,
        },
        {
          setting: "Zone 1 NPC Spawn Density",
          category: "Spawns",
          path: "zoneRoundDefaultGiant.zones[0].npcSpawn.overrideDensity",
          editable: true,
          valueType: "number",
          value: 0.75,
        },
        {
          setting: "Map Size",
          category: "Map",
          path: "mapSize",
          editable: true,
          valueType: "number",
          value: 128,
        },
      ],
      namedCollections: [
        {
          collectionId: "availableItems",
          label: "Allowed Items",
          totalCount: 2,
          items: [
            { index: 0, displayName: "Consumable Juice", value: "Consumable:Consumable_Juice" },
            { index: 1, displayName: "Consumable Shield Powder", value: "Consumable:Consumable_ShieldPowder" },
          ],
        },
        {
          collectionId: "availableMapEntities",
          label: "Allowed Map Entities",
          totalCount: 1,
          items: [{ index: 0, displayName: "Fishing Rod", value: "GameObject:FishingRod" }],
        },
        {
          collectionId: "scoresByRound",
          label: "Scores by Round",
          totalCount: 1,
          items: [{ index: 0, displayName: "Round 1", value: { killScore: 85, winnerScore: 300 } }],
        },
      ],
    };

    const topics = buildGameModeResearchTopics(document, "Arena Game Mode");

    expect(topics.map((topic) => topic.key)).toEqual([
      "map-systems",
      "drops-and-loot",
      "spawns-and-entities",
      "modifiers-and-rules",
    ]);

    expect(topics.find((topic) => topic.key === "map-systems")?.collectionLabels).toContain("Allowed Map Entities (1)");
    expect(topics.find((topic) => topic.key === "drops-and-loot")?.summaryText).toContain("Allowed Items (2)");
    expect(topics.find((topic) => topic.key === "spawns-and-entities")?.highlights.join("\n")).toContain("Zone 1 NPC Spawn Density");
    expect(topics.find((topic) => topic.key === "modifiers-and-rules")?.summaryText).toContain("Enable Game Modifiers");
  });

  it("omits topics that have neither fields nor named collections", () => {
    const document: RuntimeDocument = {
      displayName: "Arena Lobby Config",
      quickEdit: [
        {
          setting: "Lobby Name",
          category: "Lobby",
          path: "lobbyName",
          editable: true,
          valueType: "string",
          value: "Test Lobby",
        },
      ],
      namedCollections: [],
    };

    const topics = buildGameModeResearchTopics(document, "Arena Lobby Config");

    expect(topics).toHaveLength(1);
    expect(topics[0]?.key).toBe("modifiers-and-rules");
  });

  it("surfaces fishing loot tables and NPC prefab lists in the research summaries", () => {
    const document: RuntimeDocument = {
      displayName: "Pond Alpha Fishing Rod",
      quickEdit: [
        {
          setting: "Lootable Chance",
          category: "Fishing",
          path: "lootableChance",
          editable: true,
          valueType: "number",
          value: 0.12,
        },
        {
          setting: "NPC Chance Large",
          category: "Fishing",
          path: "npcChanceLarge",
          editable: true,
          valueType: "number",
          value: 0.08,
        },
      ],
      namedCollections: [
        {
          collectionId: "lootTable.loot",
          label: "Loot Table Entries",
          totalCount: 2,
          items: [
            { index: 0, displayName: "Common Loot Entry", value: { chance: 0.5, lootType: "Item" } },
            { index: 1, displayName: "Rare Loot Entry", value: { chance: 0.15, lootType: "HAX" } },
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
    };

    const topics = buildGameModeResearchTopics(document, "Pond Alpha Fishing Rod");

    expect(topics.find((topic) => topic.key === "drops-and-loot")?.collectionLabels).toContain("Loot Table Entries (2)");
    expect(topics.find((topic) => topic.key === "drops-and-loot")?.summaryText).toContain("Trash Items (2)");
    expect(topics.find((topic) => topic.key === "spawns-and-entities")?.summaryText).toContain("Large Catch NPCs (1)");
    expect(topics.find((topic) => topic.key === "spawns-and-entities")?.highlights.join("\n")).toContain("NPC Chance Large");
  });

  it("uses simple settings, advanced fields, and zone supply-drop summaries in research topics", () => {
    const document: RuntimeDocument = {
      displayName: "Arena Game Mode",
      quickEdit: [],
      simpleSettings: {
        groups: [
          {
            category: "Rules",
            entries: [
              {
                name: "Enable Game Modifiers",
                path: "enableGameModifiers",
                editable: true,
                valueType: "boolean",
                currentValue: true,
              },
            ],
          },
        ],
      },
      advanced: {
        fields: [
          {
            path: "zoneRoundDefaultGiant.zones[0].supplyDropChances[0].eventDropChance",
            label: "Zone 1 Supply Drop Event Chance",
            description: "Chance for the first zone-level supply drop event.",
            editable: true,
            valueType: "number",
            effectiveValue: 0.22,
          },
        ],
      },
      namedCollections: [
        {
          collectionId: "zoneSupplyDropSummaries",
          label: "Zone Supply Drops",
          totalCount: 1,
          items: [
            {
              index: 0,
              displayName: "Giant · Zone 1",
              value: {
                eventDropChance: 0.22,
                eventObjective: "SupplyDrop_Round1",
              },
            },
          ],
        },
      ],
    };

    const topics = buildGameModeResearchTopics(document, "Arena Game Mode");

    expect(topics.find((topic) => topic.key === "map-systems")?.collectionLabels).toContain("Zone Supply Drops (1)");
    expect(topics.find((topic) => topic.key === "drops-and-loot")?.summaryText).toContain("Zone Supply Drops (1)");
    expect(topics.find((topic) => topic.key === "modifiers-and-rules")?.summaryText).toContain("Enable Game Modifiers");
  });
});
