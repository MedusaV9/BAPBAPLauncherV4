import { describe, expect, it } from "vitest";

import { materializeRuntimeDocument } from "./document";

describe("materializeRuntimeDocument", () => {
  it("applies nested slot overrides so swap previews reflect the chosen source immediately", () => {
    const materialized = materializeRuntimeDocument(
      {
        displayName: "Anna",
        slots: [
          {
            slotIndex: 0,
            slotLabel: "Basic",
            currentTargetKey: "ANNA#1/Ability[0]",
            sourceTargetKey: "ANNA#1/Ability[0]",
            sourceCommandLabel: "Spinning Slash",
          },
        ],
      } as never,
      {
        "slots[0].sourceTargetKey": "KITSU#0/Ability[0]",
        "slots[0].sourceCommandLabel": "Foxfire Burst",
      },
      [],
    );

    const slots = materialized.slots as Array<Record<string, unknown>> | undefined;
    expect(slots?.[0]?.sourceTargetKey).toBe("KITSU#0/Ability[0]");
    expect(slots?.[0]?.sourceCommandLabel).toBe("Foxfire Burst");
    expect(materialized.overrides?.["slots[0].sourceTargetKey"]).toBe("KITSU#0/Ability[0]");
  });
});
