# RebalanceBAP Arena Presets

Drop named preset JSON files here to make them available inside the in-game arena preset selector.

Fields:
- `presetId`: stable identifier for the preset.
- `name`: visible label shown in the in-game arena preset list.
- `serializedSettingsJson`: serialized arena gameplay settings created by the game itself.
- `lobbySettingsOverrides`: optional path/value overrides for the broader lobby model.
- `showInArenaUi`: when false, the preset stays on disk but is hidden from the in-game dropdown.

The launcher can author these files later, but the mod already reads them now.
