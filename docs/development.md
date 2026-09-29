Development
===========

This guide covers source inspection and local checks. For customer setup, account
switching and troubleshooting, use [Navigator help](advanced.md).
For packaging and delivery, follow [Release preparation](marketplace-release.md).


Build and checks
----------------

`npm test` compiles and runs the public unit tests. `npm run test:public-only`
exports an explicit public source snapshot without `proprietary/`, runs its
tests and verifies that a full build fails without the private checkout.

The independent `codex-navigator-private` repository belongs at `proprietary/`.
It is ignored by the public parent and has separate Git operations. `npm run
build` compiles one extension from both checkouts; `npm run test:commercial`
tests the private licensing service. Missing private source never enables a
fallback application. Credentials belong in neither repository.

`npm run test:integration` builds both checkouts and uses an isolated
VS Code profile, real Git repositories and fixture chat URIs. Hook events are
synthetic within that fixture; no authenticated chat or user installation is
modified. Current native metadata API checks are read-only. Runtime compatibility
and complete authenticated UI acceptance must be reported separately.

The isolated launchers detect common VS Code locations on each OS. For a custom
location, set `VSCODE_EXECUTABLE` to the absolute Electron executable, not the
`code` shell script. Installed-package tests also accept `VSCODE_CLI` for that
installation's `resources/app/out/cli.js`. Test profiles remain under
`.codex-temp`; the normal installation is not changed. A desktop session is
required. Icon regeneration via `tools/render-icon.ps1` remains Windows-only;
the checked-in PNG is used by builds and packaging on every OS.

`package.json` owns the release version; root lockfile metadata must match.
`npm run package` requires clean, committed public and private checkouts and
complete production licensing configuration. It builds both, inspects every VSIX
entry against the expected runtime files and hashes, and rejects changed inputs.
It emits an immutable VSIX and adjacent JSON receipt containing both Git revisions,
the archive SHA-256 and every payload hash. It refuses to overwrite a reserved
version. Private TypeScript, tests and source maps are excluded; compiled commercial
modules are required runtime payload. Synthetic archive checks run with the public
tests; a passing fixture is not an approved production release.
`npm run test:package` additionally exercises the real VSIX packager in a disposable
0.0.0 fixture, including private-source and source-map exclusion sentinels. It
does not install or reserve a release version.
Packaging, installation, commits and publication are distinct operations.
Development and redistribution permissions are governed by [the license](../LICENSE.md).


See [Architecture](architecture.md) for component responsibilities and
[Verification](verification.md) for current evidence and historical results.
