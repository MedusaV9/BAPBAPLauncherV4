# RebalanceBAP JSON Guide

All automatically generated JSON files are stored in this folder:
`C:\Users\Administrator\Downloads\BapBapRebalnce\Gamefiles\Latest\UserData\BalanceMod\Runtime`

## Folders
- `Passives`: One JSON file per passive/augment.
- `Items`: One JSON file per item, including BR items, pins, consumables, currencies, and lootable abilities.
- `Managers`: Global manager files such as `AugmentManager.json`.
- `Characters`: One folder per character. Each folder contains separate files for character state, movement, hurtbox, and abilities.
- `Augments.index.json`: Central list of all generated augment/passive files.
- `Items.index.json`: Central list of all generated item files.

## How To Change Values
1. Open the JSON file you want to edit.
2. Start with `quickEdit` for the flattest simple list of values.
3. Edit `quickEdit[].value` directly when you want the simplest workflow.
4. Use `simpleSettings` if you want the same values grouped by category with more context.
5. Use `advanced.fields` when you want the full readable list of captured values. Check the `editable` flag there.
6. If you prefer raw paths, copy the `path` from a setting into the `overrides` object and set the new value there.
7. Save the file and restart the game.

## Important Rules
- The simplest way is to edit `quickEdit[].value`.
- You can still edit the raw `overrides` object if you want full control.
- `simpleSettings` is the quick grouped view. Entries with `editable: true` can be copied directly into `overrides`. Entries with `editable: false` are summary-only.
- `advanced.fields` is the full readable guide. Each entry includes an `editable` flag so you can tell whether a path is writable.
- `advanced.defaults` contains the captured baseline values for that target.
- `overrideStatus` tells you whether each override from the file was actually applied on the last run.
- `advanced.effectiveValues` is rewritten automatically and shows the currently active values after overrides are applied.
- Array access uses `[index]`, for example `abilities[0].damage`.
- Exported members include public fields and Unity `[SerializeField]` private fields.
- Supported direct override values include numeric types, `bool`, `string`, and `enum`.
- Exported Unity object references can also be reused as override values by copying the same `Type:Name` string back into `overrides` when the target object can be resolved.
- If you remove an override entry, that value falls back to the game default.

## File Layout
```json
{
  "schemaVersion": 6,
  "targetType": "Passive",
  "targetKey": "P_Stat_Damage#379",
  "quickEdit": [
    {
      "setting": "Level 1 / Tier 1 / Stat Value",
      "category": "Damage",
      "path": "configuration.levelStats.levels[0].tiers[0].stats[0].value",
      "editable": true,
      "value": 50,
      "defaultValue": 50,
      "whatItDoes": "Numeric value for this stat entry."
    }
  ],
  "simpleSettings": {
    "whatThisConfigDoes": "Quick overview for this config.",
    "whatYouCanChange": ["Damage"],
    "howToEdit": "Copy the path into overrides and assign a new value.",
    "groups": [
      {
        "category": "Damage",
        "entries": [
          {
            "name": "Level 1 / Tier 1 / Stat Value",
            "path": "configuration.levelStats.levels[0].tiers[0].stats[0].value",
            "defaultValue": 50,
            "currentValue": 50
          }
        ]
      }
    ]
  },
  "overrides": {
    "configuration.levelStats.levels[0].tiers[0].stats[0].value": 75
  },
  "operations": {
    "entries": [
      {
        "type": "replace",
        "path": "configuration.levelStats.levels[0].tiers[0].stats[0].value",
        "value": 75
      }
    ]
  },
  "overrideStatus": {
    "appliedCount": 1,
    "failedCount": 0,
    "entries": [
      {
        "path": "configuration.levelStats.levels[0].tiers[0].stats[0].value",
        "applied": true,
        "message": "Applied successfully."
      }
    ]
  },
  "instructions": [
    "Only edit the overrides object.",
    "Use simpleSettings and advanced.fields to find the exact path you want to change."
  ],
  "advanced": {
    "fields": [
      {
        "path": "configuration.levelStats.levels[0].tiers[0].stats[0].value",
        "editable": true,
        "label": "Stat Value",
        "description": "Numeric value for this stat entry."
      }
    ],
    "defaults": {
      "configuration.levelStats.levels[0].tiers[0].stats[0].value": 50
    },
    "effectiveValues": {
      "configuration.levelStats.levels[0].tiers[0].stats[0].value": 75
    }
  }
}
```

## Examples
- Passive: `Passives\0379_P_Stat_Damage.json`
- Character folder: `Characters\0001_ANNA\`
- Character ability file: `Characters\0001_ANNA\Abilities\00_Ability.json`
- Manager: `Managers\AugmentManager.json`
- Item manager: `Managers\ItemManager.json`
- Item: `Items\0001_SomeItem.json`
- Central list: `Augments.index.json`
- Item list: `Items.index.json`

## Legacy Note
Old aggregate files such as `passives.overrides.json` are still read as import sources,
but new changes should be made in the per-target files.
