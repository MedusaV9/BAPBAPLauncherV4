import { describe, expect, it } from "vitest";

import {
  hydrateBootstrapPayload,
  hydrateDocumentPayload,
  hydrateLibraryMetadataResponse,
  hydrateLooseIconChoice,
  resolveBundledInlineIconRun,
  resolveFallbackText,
} from "./bundledFallbacks";

describe("bundled Rebalance fallbacks", () => {
  it("hydrates runtime documents with bundled preview assets and readable fallback text", () => {
    const payload = hydrateDocumentPayload({
      raw: {
        id: "entry-360-scythe",
        targetKey: "P_CharAugment_Skinny_360Scythe",
        displayName: "360 Scythe",
        overrides: {},
        operations: { entries: [] },
        quickEdit: [],
        simpleSettings: { groups: [] },
        advanced: { fields: [] },
        textTokens: [
          {
            label: "P_360SCYTHE_DESC",
            previewValue: "P_360SCYTHE_DESC",
          },
        ],
        cardPreview: {
          cardKind: "augment",
          title: "360 Scythe",
          description: "P_360SCYTHE_DESC",
          shortDescription: "P_360SCYTHE_DESC",
        },
      } as never,
      absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0200_P_360Scythe.json",
      relativePath: "Runtime/Passives/0200_P_360Scythe.json",
      mtimeMs: 1,
    });

    expect(payload.raw.cardPreview?.iconPreviewPath).toMatch(/(\.\/rebalance-previews\/|^data:image\/svg\+xml)/);
    expect(payload.raw.cardPreview?.backgroundPreviewPath).toBeTruthy();
    expect(payload.raw.cardPreview?.framePreviewPath).toBeTruthy();
    expect(payload.raw.cardPreview?.iconStatus).toBe("resolved");
    expect(payload.raw.cardPreview?.titleFontPath).toContain("Archivo");
    expect(payload.raw.cardPreview?.bodyFontPath).toContain("Archivo");
    expect(payload.raw.cardPreview?.description).not.toBe("P_360SCYTHE_DESC");
    expect(payload.raw.cardPreview?.description).toMatch(/360|hits/i);
    expect(payload.raw.textTokens?.[0]?.previewText).not.toBe("P_360SCYTHE_DESC");
  });

  it("hydrates catalog and library entries with generated icon previews", () => {
    const bootstrap = hydrateBootstrapPayload({
      workspace: {
        workspaceRoot: "C:/Profiles/Standard/UserData/BalanceMod",
      },
      catalog: [
        {
          key: "augments",
          label: "Augments",
          entries: [
            {
              id: "entry-360-scythe",
              title: "360 Scythe",
              displayName: "360 Scythe",
              targetKey: "P_CharAugment_Skinny_360Scythe",
              relativePath: "Runtime/Passives/0200_P_360Scythe.json",
            },
          ],
        },
      ],
    } as never);

    const library = hydrateLibraryMetadataResponse({
      icons: [],
      templates: [],
      allOptions: [
        {
          targetKey: "P_CharAugment_Skinny_360Scythe",
          label: "360 Scythe",
          path: "Library/Passives/0200_P_360Scythe.json",
        },
      ],
    } as never);

    expect(bootstrap.catalog[0]?.entries[0]?.iconPreviewPath).toMatch(/(\.\/rebalance-previews\/|^data:image\/svg\+xml)/);
    expect(library.allOptions[0]?.iconPreviewPath).toMatch(/(\.\/rebalance-previews\/|^data:image\/svg\+xml)/);
  });

  it("replaces non-portable AssetRip preview paths with bundled fallbacks", () => {
    const payload = hydrateDocumentPayload({
      raw: {
        targetKey: "P_CharAugment_Skinny_360Scythe",
        displayName: "360 Scythe",
        overrides: {},
        operations: { entries: [] },
        quickEdit: [],
        simpleSettings: { groups: [] },
        advanced: { fields: [] },
        cardPreview: {
          cardKind: "augment",
          title: "P_360SCYTHE_NAME",
          iconReference: "Sprite:360Scythe",
          iconPreviewPath: "file:///C:/Users/Administrator/Downloads/BapBapRebalnce/AssetRip/Latest/ExportedProject/Assets/Texture2D/sactx-2-2048x2048-DXT5_BC3-UIAtlas-fb1b03a1.png",
          backgroundPreviewPath: "file:///C:/Users/Administrator/Downloads/BapBapRebalnce/AssetRip/Latest/ExportedProject/Assets/Texture2D/daily-rare-bg.png",
          framePreviewPath: "file:///C:/Users/Administrator/Downloads/BapBapRebalnce/AssetRip/Latest/ExportedProject/Assets/Texture2D/content-border.png",
          overlayPreviewPath: "file:///C:/Users/Administrator/Downloads/BapBapRebalnce/AssetRip/Latest/ExportedProject/Assets/Texture2D/daily-rare-fg.png",
          titleFontPath: "file:///C:/Users/Administrator/Downloads/BapBapRebalnce/AssetRip/Latest/ExportedProject/Assets/Font/Archivo-Black.ttf",
          bodyFontPath: "file:///C:/Users/Administrator/Downloads/BapBapRebalnce/AssetRip/Latest/ExportedProject/Assets/Font/Archivo-Medium.ttf",
        },
        iconChoices: [
          {
            label: "360 Scythe",
            spriteName: "360Scythe",
            previewPath: "file:///C:/Users/Administrator/Downloads/BapBapRebalnce/AssetRip/Latest/ExportedProject/Assets/Texture2D/sactx-2-2048x2048-DXT5_BC3-UIAtlas-fb1b03a1.png",
          },
        ],
      } as never,
      absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0200_P_360Scythe.json",
      relativePath: "Runtime/Passives/0200_P_360Scythe.json",
      mtimeMs: 1,
    });

    expect(payload.raw.cardPreview?.iconPreviewPath).toMatch(/^(data:image\/svg\+xml|\.\/rebalance-previews\/)/);
    expect(payload.raw.cardPreview?.iconPreviewPath).not.toContain("AssetRip");
    expect(payload.raw.cardPreview?.backgroundPreviewPath).toContain("daily-rare-bg");
    expect(payload.raw.cardPreview?.framePreviewPath).toContain("content-border");
    expect(payload.raw.cardPreview?.overlayPreviewPath).toContain("daily-rare-fg");
    expect(payload.raw.cardPreview?.titleFontPath).toMatch(/(Archivo|\.\/rebalance-previews\/)/);
    expect(payload.raw.cardPreview?.bodyFontPath).toMatch(/(Archivo|\.\/rebalance-previews\/)/);
    expect(payload.raw.cardPreview?.iconStatus).toBe("resolved");
    expect(payload.raw.cardPreview?.title).toBe("360 Scythe");
    expect(payload.raw.iconChoices?.[0]?.previewPath).toMatch(/^(data:image\/svg\+xml|\.\/rebalance-previews\/)/);
  });

  it("resolves bundled inline icons without relying on mock asssetrip atlases", () => {
    const icon = resolveBundledInlineIconRun("damage", "Damage");

    expect(icon.label).toBe("Damage");
    expect(icon.previewPath).toMatch(/^data:image\/svg\+xml/);
    expect(icon.previewPath).not.toContain("mock-assetrip");
  });

  it("humanizes unresolved localization-style titles consistently", () => {
    expect(resolveFallbackText("P_360SCYTHE_NAME")).toBe("360 Scythe");
    expect(resolveFallbackText("P_360SCYTHE_DESC")).not.toBe("P_360SCYTHE_DESC");
    expect(resolveFallbackText("P_360SCYTHE_DESC")).toMatch(/360|hits/i);
  });

  it("rewrites generic character ability labels into readable slot titles and overview text", () => {
    const payload = hydrateDocumentPayload({
      raw: {
        targetType: "CharacterAbility",
        targetKey: "KITSU#0/Ability[0]",
        displayName: "Ability[0] Ability1 (Ability)",
        resolvedName: "Ability[0] Ability1 (Ability)",
        overrides: {},
        operations: { entries: [] },
        quickEdit: [],
        simpleSettings: {
          whatThisConfigDoes: "Quick overview for character target 'Ability[0] Ability1 (Ability)'. You can change Behavior.",
          groups: [],
        },
        advanced: { fields: [] },
      } as never,
      absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Characters/0000_KITSU/Abilities/00_Ability.json",
      relativePath: "Runtime/Characters/0000_KITSU/Abilities/00_Ability.json",
      mtimeMs: 1,
    });

    expect(payload.raw.displayName).toBe("Kitsu / Basic");
    expect(payload.raw.resolvedName).toBe("Kitsu / Basic");
    expect(payload.raw.simpleSettings?.whatThisConfigDoes).toContain("Kitsu / Basic");
    expect(payload.raw.simpleSettings?.whatThisConfigDoes).not.toContain("Ability[0] Ability1 (Ability)");
  });

  it("rewrites generic character ability catalog entries into readable slot titles", () => {
    const bootstrap = hydrateBootstrapPayload({
      workspace: {
        workspaceRoot: "C:/Profiles/Standard/UserData/BalanceMod",
      },
      catalog: [
        {
          key: "characters",
          label: "Characters",
          entries: [
            {
              id: "kitsu-ability-0",
              title: "Ability[0] Ability1 (Ability)",
              displayName: "Ability[0] Ability1 (Ability)",
              targetType: "CharacterAbility",
              targetKey: "KITSU#0/Ability[0]",
              relativePath: "Runtime/Characters/0000_KITSU/Abilities/00_Ability.json",
            },
          ],
        },
      ],
    } as never);

    expect(bootstrap.catalog[0]?.entries[0]?.title).toBe("Kitsu / Basic");
    expect(bootstrap.catalog[0]?.entries[0]?.displayName).toBe("Kitsu / Basic");
  });

  it("maps sprite asset preview paths onto bundled texture files", () => {
    const payload = hydrateDocumentPayload({
      raw: {
        targetKey: "P_CritBoots",
        displayName: "Crit Boots",
        overrides: {},
        operations: { entries: [] },
        quickEdit: [],
        simpleSettings: { groups: [] },
        advanced: { fields: [] },
        iconChoices: [
          {
            label: "Crit Boots",
            previewPath: "file:///C:/Users/Administrator/Downloads/BapBapRebalnce/AssetRip/Latest/ExportedProject/Assets/Sprite/CritBoots_T1_Thumb.asset",
          },
        ],
      } as never,
      absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Items/0400_CritBoots.json",
      relativePath: "Runtime/Items/0400_CritBoots.json",
      mtimeMs: 1,
    });

    expect(payload.raw.iconChoices?.[0]?.previewPath).toMatch(/(\.\/rebalance-previews\/|^data:image\/svg\+xml)/);
    expect(payload.raw.iconChoices?.[0]?.previewPath).not.toContain("/Assets/Sprite/");
    expect(payload.raw.iconChoices?.[0]?.previewPath).not.toContain(".asset");
  });

  it("resolves known bundled passive icons to packaged preview assets", () => {
    const library = hydrateLibraryMetadataResponse({
      icons: [
        {
          label: "Flamethrower",
          passiveKey: "P_AO_Flamethrower#1",
        },
      ],
      templates: [],
      allOptions: [],
    } as never);

    expect(library.icons[0]?.previewPath).toContain("./rebalance-previews/");
  });

  it("resolves icon choices from bundled sprite asset metadata even without a preview path", () => {
    const library = hydrateLibraryMetadataResponse({
      icons: [
        {
          label: "Crit Boots",
          spriteAsset: "Sprite/CritBoots_T1_Thumb.asset",
        },
      ],
      templates: [],
      allOptions: [],
    } as never);

    expect(library.icons[0]?.previewPath).toContain("./rebalance-previews/CritBoots_T1_Thumb.png");
  });

  it("hydrates loose custom-builder icon choices before the create gallery merges them", () => {
    const icon = hydrateLooseIconChoice({
      sourcePassiveKey: "P_AO_Flamethrower#1",
      label: "Flamethrower",
    });

    expect(icon.previewPath).toContain("./rebalance-previews/");
    expect(icon.label).toBe("Flamethrower");
  });
});
