# RebalanceBAP BalanceMod Folder

This is the root folder for everything the mod writes under `UserData/BalanceMod`.

## The Important Split
- `general.cfg`, `augments.cfg`, and `characters.cfg` are the old MelonPreferences config files.
- They are hand-defined in code and therefore intentionally incomplete.
- The real large data export now lives under `Runtime` and the launcher metadata under `Library`.

## What To Edit
- Edit `Runtime` when you want to change existing shipped game content.
- Edit `Custom` when you want to build new custom augments or custom icons.
- Edit `ArenaPresets` when you want reusable arena or custom-lobby presets.
- Use `PackDrop` when you want to import a `.rbpack` by dropping it into the mod folder.

## What The Main Areas Are For
- `Runtime`: Generated per-target JSON files for passives, items, characters, managers, and arena settings.
- `Library`: Generated launcher metadata such as block suggestions, icon catalogs, templates, and the searchable all-options index.
- `Custom`: Hand-authored custom augments and optional custom PNG icons.
- `NativeUI`: Helper lists and category metadata for the extra arena settings UI. The actual values still live in `Runtime`.
- `ArenaPresets`: Saved and exportable arena preset files.
- `InstalledPacks`: Managed snapshots and active-pack state for the single active content-pack model.
- `ImportReceipts`: History and backup receipts for launcher or PackDrop imports.
- `PackDrop`: Inbox for `.rbpack` files to be processed by the mod.

## Why The CFG Files Look Small
- `general.cfg` only stores a few global mod toggles.
- `augments.cfg` only contains the augment values that were explicitly added with `addConfig(...)` in `Core.cs`.
- `characters.cfg` only contains the character and ability values that were explicitly added with `addConfig(...)` in `Core.cs`.
- If a value is missing there, that does not mean the mod cannot see it. It usually means that value was moved to the generated `Runtime` export instead.

## Quick Rule Of Thumb
- Small legacy tweak? Check the `.cfg` files.
- Real full object editing? Check `Runtime`.
- Launcher search or picker data? Check `Library`.
- New custom content? Check `Custom`.
- Packs and preset sharing? Check `ArenaPresets`, `PackDrop`, `InstalledPacks`, and `ImportReceipts`.

A machine-readable overview is also written to `_index.json` in this same folder.
