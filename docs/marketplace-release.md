Release preparation
===================

Product: Codex Navigator 1.7.0 (verified candidate; production packaging pending)
Extension identity: keenanselbee.codex-navigator
License: proprietary, with selected source available for inspection; see LICENSE.md

This release removes the patch integration entirely. It does not migrate data,
restore old Codex files, alias old commands/settings, or maintain an older Repo
Companion installation. After trial or paid admission, installed, enabled and
trusted activity hooks are required to complete initial setup. Setup has no
first-use bypass. After verification, hook failures show nonblocking diagnostics
and preserve access to established chats. Automatic labels and
project instructions remain optional.

The hosting repository is [keenanselbee/codex-navigator](https://github.com/keenanselbee/codex-navigator).
Package links and the local origin remote follow that name. This does not rename
the local checkout folder or publish a Marketplace listing.

Release checklist
-----------------

- Run unit and isolated VS Code setup/sidebar integration checks.
- Verify docs, source-available wording and package metadata agree.
- Inspect the VSIX: no patch installer, injected assets or obsolete compiled modules.
- Retain the immutable VSIX and SHA-256 receipt.
- Review and commit public and private release inputs independently. Record both
  revisions and the per-file hashes emitted by packaging; keep private source out
  of the public commit and package.
- Verify Navigator's $5 CAD one-time checkout, seven-day local trial, one active
  transferable installation, daily validation and 30-day offline grace.
- Complete sandbox activation, repeat validation, second-install refusal,
  transfer, refund/revocation and download delivery before live publication.
- Install only when requested; remove the old extension separately if desired.
- Complete authenticated trust/event and runtime-goal acceptance before claiming it.
- Publish only after a separate publishing instruction.

Earlier releases and their original license grants remain unchanged. Source
inspection is allowed; code reuse, modification and redistribution require written
permission. New commercial releases require trial or paid admission for features.
Earlier 1.5.0 installations retain their original permissions; never overwrite
that version with a changed payload.


Owner acceptance (2026-09-13)
-----------------------------

The owner confirms completing the production customer journey checks: checkout,
licence recovery, refund/revocation and customer download delivery. The owner
also confirms the final packaged-extension real-use checks: fresh setup,
authenticated Codex activity hooks, chat switching, automatic labels and goal
pause/resume. These checks are recorded as owner-verified, not agent-executed.
They are no longer outstanding acceptance gates for Codex Navigator.

Version 1.6.4 lets the animated demo and automatic-layout comparison fill the
content column using 100% width and automatic height. It retains 1.6.2's
comparison and Reset Chat Name command for renamed chats. Publication remains
with the owner.
Before Marketplace upload, push the public source and confirm that
`https://raw.githubusercontent.com/keenanselbee/codex-navigator/main/images/adaptive-layouts.png`
loads; the new image is hosted from that repository.

Prepare this candidate from clean, committed public and private checkouts. A
separate worktree may be used to exclude unrelated local working files without
changing them. Keep the resulting VSIX and paired revision/hash receipt immutable.
If further fixes change the packaged payload, reserve the next patch version.


Prepared release inputs: 1.6.5
-----------------------------

Completed setup now persists per workspace. Later hook problems keep chats and
colour pickers available, with quiet transient retries and a nonblocking notice.
Warnings remain in setup diagnostics without invalidating exact enabled/trusted
Navigator entries. Missing collector files cannot count as installed hooks.
Matching custom labels share workspace colours; legacy colours migrate without
discarding conflicting chat overrides. Explicit chat-only colours remain available.

All 137 public tests passed in `public-only-lz3H9G`, including the missing-private
build guard. All 24 commercial tests passed. Isolated VS Code integration passed
initial, restart and second-window phases (`integration-NuxT9K`), including shared
colour edits, rename inheritance, explicit overrides and persisted completion
during a restart outage. The earlier restart assertion failure came from setup's
test deliberately switching the target to Auto; the fixture now restores its
custom label before checking persistence. An unrelated activity test encountered
a transient Windows EPERM on rename; the full public-only rerun passed.

The disposable package verified all 59 archive entries with private source
excluded (`package-acceptance-a2bDe1`). Isolated production-mode installation and
reinstallation verified 56 files plus the manifest, preserved expired trial
state, and removed the disposable extension afterward. No normal-profile
installation or authenticated provider action was performed. Markdown whitespace
and local links passed. Final production packaging and Desktop staging require
the reviewed public commit; the private checkout remains unchanged at
`279a6513450a108980544c6291bfad7f47343a65`.


Prepared release inputs: 1.6.4
-----------------------------

Both README images use 100% width with no fixed height. The existing GIF and PNG
files are unchanged. The manifest, lockfile and release notes identify version
1.6.4. Production packaging and Desktop staging are pending the reviewed public
release commit; the private checkout remains unchanged.

All 132 public tests passed. Isolated VS Code integration passed initial and
restart checks (`integration-dhd1Em`). The disposable package-boundary check
verified all 57 entries and excluded private source (`package-acceptance-Zm3PrI`).
Both image URLs returned HTTP 200; responsive image attributes, Markdown
whitespace and local documentation links passed verification.


Verified production package: 1.6.3
----------------------------------

The README now renders the layout comparison at 700 pixels wide, matching the
animated demo, with automatic aspect-ratio height (about 167 pixels). The
1192-by-285 source PNG is retained, including the owner's existing local update.
The manifest, lockfile and release notes identify the next release as 1.6.3.

All 132 public tests passed. The disposable package-boundary test verified all
57 entries and excluded private source (`package-acceptance-aLFSYZ`). Isolated
VS Code integration passed its initial and restart phases (`integration-jm64Jf`).
Comparison with the verified 1.6.2 package found only the expected README,
manifest and changelog content changes; other byte differences were line endings.
Markdown whitespace, local links and the two 700-pixel image attributes passed.

The canonical production packager produced `dist/codex-navigator-1.6.3.vsix` and
its paired receipt from public revision
`b7774cbd583aa848ad9e708d387737e37477c2b5` and unchanged private revision
`279a6513450a108980544c6291bfad7f47343a65`. SHA-256:
`9346df4d89de37fc5f5eb572afe36e0c39ca8a381d38f31ba8de9703e1f1305f`.
All 57 production entries and the packaged 700-pixel image attributes were
verified. The VSIX and receipt were copied to the Desktop and their hashes
matched. The public commit was pushed, and the hosted layout PNG matched the
local image. Marketplace upload was left to the owner.


Verified production package: 1.6.2
----------------------------------

- Upload artifact: `dist/codex-navigator-1.6.2.vsix`.
- Keep the paired receipt: `dist/codex-navigator-1.6.2.vsix.json`.
- SHA-256: `eb09f2f00520efe7f4d3e9189cc30892cfd6fa0c31a87ae27b12fd2005cd4123`.
- Public build revision: `69bd9bcb9a3062387603e1fb7fbeed2319b38718`.
- Private build revision: `279a6513450a108980544c6291bfad7f47343a65`.

The canonical packager built this universal production VSIX from clean detached
worktrees under `.codex-temp/release-1.6.2`, preserving the owner's untracked
`images/2.png` in the working checkout. All 57 archive entries passed inspection.
Public-only verification passed 132 tests and the missing-private build guard
(`public-only-0pBcS8`); all 24 commercial tests passed. The contextual rename/reset
integration passed in `integration-aqeoVv` before release metadata was finalised.

The exact VSIX passed isolated installed and reinstalled acceptance in
`installed-acceptance-MQZan0`: 54 file hashes plus the manifest matched, and trial
expiry survived uninstall, settings reset and reinstall. The disposable extension
was removed; the normal VS Code installation was unchanged. Native platform and
owner acceptance qualifications above still apply.

The verified VSIX and receipt are also on the owner's Desktop. The remaining
publication prerequisite is to push the public repository and verify the hosted
`images/adaptive-layouts.png`: its URL returned HTTP 404 during preparation.
No GitHub push or Marketplace publication was performed. This evidence update
is excluded from the packaged payload and preserves its recorded build revision.


Earlier production package: 1.6.1
----------------------------------

- Upload artifact: `dist/codex-navigator-1.6.1.vsix`.
- Keep the paired receipt: `dist/codex-navigator-1.6.1.vsix.json`.
- SHA-256: `452c064b12c6d81ddd34406c58b02ca9088c1abb45f16a9f973cd26c56bf4de6`.
- Public build revision: `5f660577e01d87b3ed85835bb418b41b42e312a4`.
- Private build revision: `279a6513450a108980544c6291bfad7f47343a65`.

The production package passed all 57 archive-entry checks from clean independent
Git roots. Public-only verification passed 132 tests and the missing-private
build guard (`public-only-8ZwOQ2`); all 24 commercial tests passed. All 53 runtime
and content files outside the manifest and changelog match the tested 1.6.0
package. Its single-line title integration checks passed in `integration-EJEuzF`.

The exact 1.6.1 VSIX passed isolated installed and reinstalled acceptance in
`installed-acceptance-uAaZ6U`, including 54 file hashes plus manifest verification
and preserved trial expiry after uninstall, settings reset and reinstall. The
disposable extension was removed. Native platform and owner-verified acceptance
qualifications above still apply. Publication is left to the owner.

The VSIX and paired receipt are also provided on the owner's Desktop. Upload the
VSIX only. This evidence update is excluded from the packaged payload and does
not change its recorded build revision or hash.


Earlier production package: 1.5.9
--------------------------------

- Upload artifact: `dist/codex-navigator-1.5.9.vsix`.
- Keep the paired receipt: `dist/codex-navigator-1.5.9.vsix.json`.
- SHA-256: `2c8ce043a191b76dce5663c29aa804eeefe8cb1a7202fa03b8d1f0e3b9817340`.
- Public build revision: `1b4c3deac7268129ab11cc7688f752605443ad42`.
- Private build revision: `279a6513450a108980544c6291bfad7f47343a65`.

The canonical production packager built the universal VSIX from clean independent
Git roots and verified all 57 archive entries against its allowlisted payload.
The package contains compiled commercial modules and no private source, source
maps or tests. Windows x64 is the tested platform; other platform qualifications
in the README still apply.

Release verification passed 132 public tests in `public-only-dBIkRM`, including
the missing-private build guard, and 24 commercial tests. Isolated VS Code
integration passed initial, restart and second-window acceptance in
`integration-Pp68Jo`. The exact release VSIX passed installed and reinstalled
acceptance in `installed-acceptance-iV0pVg`: 54 installed file hashes plus the
manifest match the receipt, and fixture-expired trial state survives uninstall,
settings reset and reinstall without granting a second trial. The disposable
extension was removed; the normal VS Code profile was unchanged. These automated
checks use synthetic hook events and trial expiry; real customer and authenticated
Codex acceptance is recorded separately above.

The GitHub-hosted small icon and demo GIF returned successfully and matched the
local asset hashes. This evidence update changes only release documentation
excluded from the VSIX; the recorded build revisions and artifact remain intact.


Owner publication
-----------------

Upload the exact verified VSIX through the Visual Studio Marketplace publisher
management page for `keenanselbee`. Keep its receipt locally; it is not an upload
artifact. After publication, verify installation from Marketplace and inspect the
page, onboarding and purchase/support links before announcing the release.
See the [official publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).


Prepared release inputs: 1.7.0
-----------------------------

Shared Default organisation, optional named chat profiles, workspace relevance
filtering and bounded row expansion are implemented. Migration imports each
workspace when opened and keeps original snapshots for conflict recovery. Profile
switching preserves the separately published routing scope and active Codex work.
The README adds one feature bullet and short layout/menu updates.

Public-only verification passed 146 tests and the missing-private guard in
`public-only-z5djLj`; all 24 commercial tests passed. Real isolated VS Code
integration passed initial, restart and second-window phases in
`integration-K6DKYr`, including profile commands, independent labels, unchanged
routing, persisted workspace selection, shared browsing admission and independent
concurrent edits. An earlier two-window failure exposed a stale-snapshot overwrite;
object-bound edit snapshots fix it, with regression coverage.

The disposable package check verified all 60 entries and excluded private source
in `package-acceptance-d4ipsC`. Installed/reinstalled acceptance passed in
`installed-acceptance-r9rrJR`, including persisted profile stars and trial expiry.
The normal VS Code installation and live provider were unchanged. Final production
packaging will record the clean reviewed public revision and unchanged private
revision `279a6513450a108980544c6291bfad7f47343a65`, followed by verification of the
exact release archive and Desktop copy. Marketplace publication remains with the
owner.
