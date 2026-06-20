import { describe, expect, it } from "vitest";

import { buildTargetResearchTopics } from "./targetResearch";
import type { RuntimeDocument } from "./types";

describe("buildTargetResearchTopics", () => {
  it("surfaces Firewave spawn and linked-effect data from runtime fields and named collections", () => {
    const document: RuntimeDocument = {
      displayName: "Fire Wave",
      targetType: "Passive",
      targetKey: "P_Firewave#158",
      quickEdit: [
        {
          setting: "Speed",
          category: "Behavior",
          path: "configuration.speed",
          editable: true,
          valueType: "number",
          value: 16,
        },
        {
          setting: "Forward Spawn Amount",
          category: "Behavior",
          path: "configuration.forwardSpawnAmount",
          editable: true,
          valueType: "number",
          value: 1.2,
        },
        {
          setting: "Target Ability",
          category: "Behavior",
          path: "configuration.targetAbility",
          editable: true,
          valueType: "string",
          value: "Ability1",
        },
        {
          setting: "Burn Duration",
          category: "Linked",
          path: "configuration.P_FIREWAVE_BURN.configuration.statusEffects.duration",
          editable: true,
          valueType: "number",
          value: 4,
        },
      ],
      namedCollections: [
        {
          collectionId: "configuration.P_FIREWAVE_BURN.configuration.statusEffects",
          label: "Burn Status Effects",
          totalCount: 1,
          items: [{ index: 0, displayName: "Burn", value: { duration: 4, multiplier: 1 } }],
        },
        {
          collectionId: "configuration.P_FIREWAVE_STUN.configuration.statusEffects",
          label: "Stun Status Effects",
          totalCount: 1,
          items: [{ index: 0, displayName: "Stunned", value: { duration: 0.5, multiplier: 1 } }],
        },
      ],
    };

    const topics = buildTargetResearchTopics(document, "Fire Wave");

    expect(topics.map((topic) => topic.key)).toContain("behavior-and-spawn");
    expect(topics.map((topic) => topic.key)).toContain("linked-effects");
    expect(topics.find((topic) => topic.key === "behavior-and-spawn")?.highlights.join("\n")).toContain("spawned prefab");
    expect(topics.find((topic) => topic.key === "linked-effects")?.collectionLabels).toContain("Burn Status Effects (1)");
    expect(topics.find((topic) => topic.key === "linked-effects")?.summaryText).toContain("linked sub-passive/status branches");
  });

  it("surfaces Box loot-pool controls and grouped gear-drop rows", () => {
    const document: RuntimeDocument = {
      displayName: "Box",
      targetType: "Passive",
      targetKey: "P_Box#234",
      quickEdit: [
        {
          setting: "Gear Drop 1 / Tier Probability 3 / Tier Probability",
          category: "Loot",
          path: "configuration.gearDrops[0].tierProbability[2]",
          editable: true,
          valueType: "number",
          value: 0.7,
        },
        {
          setting: "Gear Drop 1 / Unique Chance Norm",
          category: "Loot",
          path: "configuration.gearDrops[0].uniqueChanceNorm",
          editable: true,
          valueType: "number",
          value: 0,
        },
        {
          setting: "Gear Drop 1 / Pin Chance Norm",
          category: "Loot",
          path: "configuration.gearDrops[0].pinChanceNorm",
          editable: true,
          valueType: "number",
          value: 0,
        },
      ],
      namedCollections: [
        {
          collectionId: "configuration.gearDrops",
          label: "Gear Drops",
          totalCount: 3,
          items: [
            { index: 0, displayName: "Gear Drop 1", value: { rare: 0.7, epic: 0.2, legendary: 0.1 } },
            { index: 1, displayName: "Gear Drop 2", value: { rare: 0.65, epic: 0.25, legendary: 0.1 } },
            { index: 2, displayName: "Gear Drop 3", value: { rare: 0.6, epic: 0.25, legendary: 0.15 } },
          ],
        },
      ],
    };

    const topics = buildTargetResearchTopics(document, "Box");

    expect(topics.find((topic) => topic.key === "drops-and-loot")?.collectionLabels).toContain("Gear Drops (3)");
    expect(topics.find((topic) => topic.key === "drops-and-loot")?.highlights.join("\n")).toContain("three gear-drop rows");
    expect(topics.find((topic) => topic.key === "drops-and-loot")?.summaryText).toContain("Are unique or pin rolls already possible from this target?");
  });
});
