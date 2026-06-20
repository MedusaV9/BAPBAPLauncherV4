# Boss Rush — Bundle Payload (`files/`)

This directory is the **payload root** of the Boss Rush Bundle Instance. In a
real build the curated `Mods/` and `UserData/` trees go here, exactly as they
should land at the user's instance root after install.

## What goes in here

In a production build authored by the launcher maintainers:

```
files/
  Mods/
    BAPBAPBalanceMod.dll
    BAPBAPHiddenDevArguments.dll
    SpeedrunTimer.dll
    ...
  UserData/
    BalanceMod/
      Library/AllOptions.index.json
      Library/Standards.index.json
      Runtime/...
      Custom/...
      ...
```

Each file's `relativePath` (POSIX, forward slashes, no `..`, no leading `/`) is
recorded in the parent manifest's `files[]` array, together with its lowercase
hex SHA-256 and `sizeBytes`.

## What's currently checked in

**Nothing but this README.** The placeholder bundle ships with `files: []` and
`extra.isPlaceholder: true` in `manifest.json` so the launcher can boot, the
EXE installer keeps a small footprint, and CI builds that don't have access to
the real curated payload still succeed.

## How the manifest is regenerated

```bash
# from apps/bapbap-launcher/
npm run sync:bundled-bundles
# or part of the full chain:
npm run build:v2
```

The `sync-bundled-bundles.mjs` script:

1. Walks `default-workspace/bundles/<id>/files/` recursively.
2. Computes SHA-256 + sizeBytes for every file.
3. Rewrites the `files[]` array in `<id>/manifest.json`, preserving every
   other top-level field (id, name, channel, version, buildNumber,
   publishedAtUtc, compatibility, sourceUrl, changelog, signature, extra).
4. Prints
   `sync-bundled-bundles: OK (N files, bundle <id> v<version>)`.

The top-level `README.md` directly under `files/` is treated as documentation
and intentionally excluded from `files[]` so the placeholder build records
zero shipped files. Once real payload is added in subdirectories
(`files/Mods/...`, `files/UserData/...`), it appears in the manifest as
expected.

## Don't put secrets here

This tree is shipped *inside the EXE* and is world-readable on every install.
Never check in unsigned licensed assets, private keys, or credentials.
