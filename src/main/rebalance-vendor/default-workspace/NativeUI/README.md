# RebalanceBAP NativeUI

This folder contains helper files for the extra arena custom settings UI sections injected by RebalanceBAP.

Folders:
- `HiddenDev`: Hidden/dev augment lists exposed in the arena UI.
- `Custom`: Custom augment lists exposed in the arena UI.

Important:
- The actual values still live in the generated Runtime JSON files under `UserData/BalanceMod/Runtime`.
- `ArenaCategories.index.json` only describes which groups are exposed in the arena settings UI.
- If the HiddenDev mod is loaded, RebalanceBAP tries to reuse its category source first and falls back to runtime catalog heuristics otherwise.
- Item categories such as Pins and Legacy-BR are exported here as lookup lists even when another mod is responsible for drawing the item UI itself.
