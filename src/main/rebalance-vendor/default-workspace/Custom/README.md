# RebalanceBAP Custom Augments

Put custom augment definitions in this folder:
`C:\Users\Administrator\Downloads\BapBapRebalnce\Gamefiles\Latest\UserData\BalanceMod\Custom\Augments`

Put optional custom PNG icons in this folder:
`C:\Users\Administrator\Downloads\BapBapRebalnce\Gamefiles\Latest\UserData\BalanceMod\Custom\Icons`

Use existing game icons by copying a passive key or passive id from `Icons.index.json`.
The safest setup is to clone an existing augment with `templatePassiveKey`, then override only the paths you want to change.

Important:
- `key` becomes the new passive object name.
- `displayName` is optional and will be written to `configuration.nameTrKey` as literal text if you do not override it manually.
- `description` is optional and will be written to `configuration.descriptionTrKey` as literal text if you do not override it manually.
- `shortDescription` is optional and feeds the shorter card-summary text when the target supports it.
- `id` must be unique, non-negative, and between 5000 and 20000.
- If you leave `id` out, the loader auto-assigns the next free id starting at 5000.
- `blocks[]` is optional and lets the launcher compile simple library blocks like title, description, short description, damage, cooldown, speed, and target ability into overrides.
- Text fields can use placeholders like `%id%`, `%key%`, `%health%`, `%damage%`, `%cooldown%`, `%duration%`, or `%poison%` when matching blocks exist.
- `overrides` uses the same paths as the generated runtime JSON files under `UserData/BalanceMod/Runtime`.
- `icon.sourcePassiveKey` copies the icon from an existing passive.
- `icon.customFile` loads a PNG from the `Icons` folder and turns it into a runtime sprite.
- `characterIds` must use valid in-game character ids only. See the runtime `Characters` folder names for the shipped ids.

Reference:
[BAPBAP Modding Docs - Augments](https://epicbo.github.io/BAPBAPModdingDocs/guides/augments/)
