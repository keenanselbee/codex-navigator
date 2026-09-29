Release preparation
===================

Product: Codex Navigator 1.8.2
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

Verified production package: 1.8.2
----------------------------------

Production archive and receipt are retained in `dist/` and on the Desktop.
Public build revision: `ca8ec7a844dd991cd2a50c2f84a71125629758f3`.
SHA-256: `3d83059603d6c8acbe966c0d4e2b9f5baecda847d8d1760042cf366ed84c0926`.

All four release metadata/evidence tests pass. All 68 archive entries match the
allowlist. Exact installation and reinstallation pass in
`installed-acceptance-ryFzRB`, including 65 payload hashes, the manifest and
persistent expired trial state. The disposable installation was removed.
Desktop VSIX, receipt, release notes and verification copies match their sources.
No normal-profile changes, Git push or Marketplace publication were performed.
Push the public commits before upload to update the GitHub-hosted GIF.

Demonstration refresh: 1.8.2
----------------------------

Replace the listing GIF with the owner-supplied latest recording. Runtime code
and styles are unchanged from 1.8.1, including the verified descender spacing.
Prior runtime verification remains applicable. Verify release metadata and the
exact production VSIX installation/reinstallation before Desktop delivery.

Verified production package: 1.8.1
----------------------------------

The production VSIX and paired receipt are retained under `dist/` and on the
Desktop, with matching hashes. Public build revision: `d7ab2c0f6b89b445047d7f545a7878e0616110cd`.
SHA-256: `fb037486a80932c28090d8399df1b19fc5721ab8c4a540241986643b3717e41e`.
All 68 archive entries match the allowlist; no private source is included.

Exact installation and reinstallation pass in `installed-acceptance-cwcoly`,
including 65 payload hashes, the manifest and persistent expired trial state.
The disposable installation was removed; the normal profile was unchanged.
Desktop release notes and verification include the 48-case typography check.
Push the public commits to update the GitHub-hosted GIF before Marketplace upload.
No Git push or Marketplace publication was performed.

Account text and demonstration: 1.8.1
-------------------------------------

Account labels, their row and usage text have two extra pixels below their
clipping boundary, offset by negative margins. A real VS Code webview comparison
in `descender-smoke-1W5KUf` passes 48 combinations of four font sizes, three
CSS zoom scales and four panel dimensions: tile/text positions and dimensions,
font size and horizontal ellipsis are unchanged, with extra descender clearance.
The supplied replacement GIF matches the committed listing asset byte for byte.

All 228 public tests and the missing-private guard pass in `public-only-s0wbur`.
Full initial, restart and second-window integration passes in `integration-fOaLBC`.
The private checkout and commercial logic are unchanged. Exact-package
installation/reinstallation and Desktop delivery follow the clean release commit.

Verified production package: 1.8.0
----------------------------------

The canonical production package is `dist/codex-navigator-1.8.0.vsix`, with its
paired receipt. Public build revision: `8b90a00a16f72ce6e14956ab0d743090c18b8c8a`.
The private revision remains `279a6513450a108980544c6291bfad7f47343a65`.
SHA-256: `3688ffaec8194cc784c08e8b84067a11b33b7d97c7667d61535f21768b876fd1`.

All 68 archive entries match the allowlist. Exact production installation and
reinstallation pass in `installed-acceptance-KZ1SE1`: 65 payload hashes and the
manifest match, and expired trial state survives reinstall. The disposable
extension was removed; the normal VS Code profile was unchanged.

Desktop copies of the VSIX, receipt, release notes and verification JSON match
their sources. Push the public commits before Marketplace upload so the
GitHub-hosted visuals and updated account documentation anchor are current.
No Git push or Marketplace publication was performed. Temporary presentation
fixtures are excluded; retained local artifacts preserve their release receipts.

Prepared release inputs: 1.8.0
------------------------------

The listing uses the owner-supplied demonstration GIF and updated adaptive-layout
image. Account switching no longer carries a Preview label. Get started includes
optional account switching, automatic labels and project instruction setup.
Chat tooltips default off and can be enabled in Settings. Choose Repository
preserves custom labels; adding a custom label keeps the assigned primary project.
The separate association command is removed.

All 228 public tests, the missing-private guard and 24 commercial tests pass.
Real isolated VS Code initial, restart and second-window checks pass in
`integration-3figYM`, including tooltip toggling and preserved repository labels.
Local documentation links and anchors pass; the README external URLs respond
with HTTP 200. The GIF copy matches its supplied source hash. The private
checkout is unchanged. Presentation fixtures stay ignored and outside release
payloads. Git push and Marketplace publication remain separate owner actions.

Prepared release inputs: 1.7.9
-----------------------------

The extension listing leads with chats and accounts, places saved accounts first
in the feature list, and retains the Preview and last-known-usage qualifications.
The release also fixes duplicate account-page opening, concurrent account schema
migration and account status being cleared by automatic-label updates.

Missing account usage now retries while Accounts is visible, starting at ten
seconds and backing off to five minutes. Contextual progress describes sign-in,
switching and reload. Copy Email appears only for known sign-in addresses.

All 225 public tests, the missing-private guard and 24 commercial tests pass.
The real account UI checks pass, including the ten-second retry. The full final
integration harness stops later at the known intermittent chat-resize focus
assertion; see [verification](verification.md). The exact production VSIX passes installation and
reinstallation in installed-acceptance-ohG3Ti. Desktop copies match the archive
and receipt. The private checkout is unchanged.

Public revision: 37c82ef8875f5027ccdb37a499bd2520863c24da.
Archive SHA-256: 359ffa2c382a0ae4a6f87822561fcfdb18e29a1859058be1f16be261f488c1ef.
No normal-profile installation, Git push or Marketplace publication was performed.


Verified production package: 1.7.8
---------------------------------

The committed production archive is dist/codex-navigator-1.7.8.vsix, with its
paired revision/hash receipt. It was built from public revision
ea666b60c1ac6cbe10a8f458877c82d0721b13d9 and unchanged private revision
279a6513450a108980544c6291bfad7f47343a65. SHA-256:
91217b5aa507be9056569822b1394a440351e06160bb4e7431577dadf6724457.

All 68 archive entries match the allowlisted payload. Exact-package installation
and reinstallation pass in installed-acceptance-l7YnD8: 65 file hashes and the
manifest match, and expired trial state survives reinstall. The disposable
installation was removed. Desktop copies of the VSIX, receipt, release notes
and verification JSON match their sources. Upload the VSIX only.

No normal-profile installation, Git push or Marketplace publication was performed.
The [verification qualifications](verification.md) remain applicable. This evidence
update is excluded from the packaged payload and preserves its recorded revision.


Prepared release inputs: 1.7.8
-----------------------------

The owner added a toolbar follow-up during packaging: move Navigator's actions
menu ahead of Search/Accounts, and make New Chat opt-in through the default-off
showNewChatButton setting. A contributed native submenu supplies the menu;
no webview popup or VS Code patch is used. The isolated native toolbar checks
confirm order and immediate settings-driven visibility changes.

Version 1.7.7 was already packaged from committed inputs and remains immutable.
The final Desktop delivery is 1.7.8 and includes its plan/account changes. The
release workflow and platform qualifications below continue to apply.


Prepared release inputs: 1.7.7
-----------------------------

The owner approved a committed, publishable Desktop package. The Accounts page
omits Account management and its three actions. Plan metadata recognises Codex
variants such as `prolite` (Pro 5x) and `pro` (Pro 20x), and persists independently
of optional quota data. Remembered sign-ins and successful metadata reads update
the plan without inferring a paid tier from remaining quota.

The release includes the account grid, safe sign-in recovery and compaction
activity changes from local test versions 1.7.3 through 1.7.6. Normal production
packaging requires clean committed inputs and records public/private revisions
and payload hashes. Exact-archive installed acceptance precedes Desktop delivery.
Marketplace publication and Git push remain separate actions. Windows is the
verified host; macOS/Linux and real-account IDE adoption retain the qualifications
in [verification](verification.md).


Prepared test inputs: 1.7.6
--------------------------

The approved account grid replaces the popup. Neutral chat-sized tiles show the
email/custom label and plan, then last known quota. Clicking switches and reloads;
the final tile adds an account. Right-click changes the label, and clearing it
restores the email. Hover exposes full identity, reset and freshness information.

Usage checks use an isolated ephemeral native app-server with access tokens only,
without credential refresh or live-file publication. Cached, validated metadata
is account/workspace scoped and removed on Forget. Unsupported or expired reads
cannot block switching. Existing sign-in, reload and secure-storage restrictions
remain in force. No reset credits are redeemed.

Use the existing uncommitted local test packaging route. Preserve earlier test
archives and receipts; this candidate requires its own exact-package acceptance.
No project commit, normal-profile installation or Marketplace publication is
included in Desktop delivery. See [verification](verification.md) for evidence.


Prepared test inputs: 1.7.3
--------------------------

Optional account setup remembers compatible file-backed Codex credentials in VS
Code SecretStorage and adds an account picker after Search and New Chat. Add
Account uses an isolated native browser login. Switching preserves the outgoing
credential, checks external drift, selects the saved credential, reloads this
window and stays pending until the user verifies Codex. Rename, forget, consent
removal and guarded restore are available. Other credential backends, remote
environments and custom auth endpoints remain unsupported; managed requirements
can block isolated login. The live IDE account cannot be verified automatically.

The candidate also retains the compaction/reasoning/large-output spinner fixes.
All 182 public tests, the missing-private guard, 24 commercial tests, and real
isolated VS Code initial/restart/second-window checks passed. Synthetic saved
credentials survived VS Code SecretStorage across process restart. Native Codex
synthetic testing proved file replacement needs a process restart for adoption.
Owner-account OAuth and actual IDE adoption remain manual acceptance; macOS and
Linux have no native account-switch evidence.

This is a Desktop test delivery, not a Marketplace publication. The owner explicitly selected testing before committing. Use npm run
package:test-build to record the exact uncommitted public source hashes and
base revision in a test-marked receipt. Normal npm run package still requires
clean committed inputs. Both modes reserve the same version/output path and
retain all payload, private-checkout, licensing and immutability checks.
The private checkout remains unchanged at
279a6513450a108980544c6291bfad7f47343a65.


Prepared release inputs: 1.7.2
-----------------------------

Fix the reproduced missing-spinner failure for rotated transcripts. Filename
parsing retains the conversation ID before an optional rollout ID, selects the
newest transcript timestamp, and refreshes cached paths independently of optional
focus detection. Session metadata still verifies conversation identity and source.

All 154 public tests, the missing-private build guard, 24 commercial tests and
isolated VS Code initial/restart/second-window integration passed. The new sidebar
rotation fixture verifies spinner start and completion while hooks are stale and
the live runtime is unavailable. Release packaging requires reviewed committed
inputs; the normal-profile installation remains unchanged.


Prepared release inputs: 1.7.1
-----------------------------

Activity now recovers from fresh reasoning/tool invocations after large
compactions using the current turn context. Context alone does not imply work;
unread gaps and replaced files do not retain uncertain activity. Bounded reads
keep exact byte offsets when a tail begins inside a UTF-8 character. Newer
stop/interruption hooks override older working/waiting records, and matching
completion still supplies the ready dot. Local transition and connection-error
diagnostics omit conversation contents and raw runtime stderr.

All 152 public tests and the missing-private build guard passed in
`public-only-mRM9yK`; all 24 commercial tests passed. Isolated VS Code 1.137
integration passed initial, restart and second-window checks in
`integration-9cdHmI`, including the full reader-to-sidebar compaction recovery,
completion and interruption scenarios. The first integration attempt had a
duplicate fixture variable; it was corrected before the successful run.

The original screenshot is not claimed fixed by reproduction: replay with its
fresh hook still selected working. This release addresses reproduced activity
weaknesses and adds diagnostics for any recurrence. Production packaging and
exact-archive installed acceptance follow the clean public release commit.
The private source remains at `279a6513450a108980544c6291bfad7f47343a65`.
Marketplace publication remains with the owner.


Verified production package: 1.7.1
----------------------------------

The canonical packager produced `dist/codex-navigator-1.7.1.vsix` and its paired
receipt from public revision `497f32a0f439362e4a7d3170b00cf55d872b395e` and
private revision `279a6513450a108980544c6291bfad7f47343a65`. All 60 archive entries
matched the allowlisted payload; private source and source maps were excluded.
SHA-256: `12ddc23b7fc6e00c0f294c2e2436db5ceeb1d9abee47d98de5d11069cca6ac82`.

The exact release archive passed isolated production-mode installation and
reinstallation in `installed-acceptance-nVW0Rs`: 57 file hashes and the manifest
matched, and expired trial state survived reinstall. The disposable extension
was removed; the normal installation was unchanged.

The VSIX and paired receipt are on `C:\Users\Keenan\Desktop`; both Desktop
copies match their source hashes. No Git remote push or Marketplace publication
was performed. This evidence update is excluded from the VSIX and preserves its
recorded build revision and immutable archive.

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


Verified production package: 1.7.0
----------------------------------

The canonical packager produced `dist/codex-navigator-1.7.0.vsix` and its paired
receipt from public revision `8585f3823bd7ff5cd82b8eb6eb54af09ed012588` and
private revision `279a6513450a108980544c6291bfad7f47343a65`. All 60 archive entries
matched the allowlisted payload; private source and source maps were excluded.
SHA-256: `8124850757694e34257d18ac1cfc67525f7799d071464182537b9378bc15171a`.

The exact release archive passed isolated production-mode installation and
reinstallation in `installed-acceptance-nrMkSl`: 57 file hashes and the manifest
matched, profile stars persisted and expired trial state survived reinstall.
The disposable extension was removed. The normal installation was unchanged.

The VSIX and paired receipt are on `C:\Users\Keenan\Desktop`; both Desktop
copies match their source hashes. Marketplace upload remains with the owner.
This evidence update is excluded from the VSIX and preserves the recorded build
revision and immutable archive. No Git remote push was performed.

Verified local test delivery: 1.7.3
---------------------------------

The owner explicitly requested testing before commits. The exact uncommitted
VSIX and source/payload receipt are retained under dist and copied to the Desktop
as codex-navigator-1.7.3-test.vsix and its paired JSON receipt. SHA-256:
7ae782ebb0167923f83b4c820e7dbf986a9c4342afc59ddd6746c6553a43f789.

All 63 archive entries passed allowlist/hash checks; the exact 1.7.3 archive
passed isolated installation and reinstallation in installed-acceptance-dP0Xpt
with 60 installed payload files and its manifest verified. The disposable
installation was removed. Normal-profile installation, real-account acceptance,
Git commits/pushes and Marketplace publication were not performed. Test notes
and verification JSON accompany the Desktop archive. Version 1.7.3 is reserved
for this exact payload; changed payloads require a new version.


Prepared recovery test: 1.7.4
----------------------------

Check and refresh selected credentials through native Codex before replacing
the active auth file or reloading. Offer reauthentication for invalidated saved
sign-ins, retain refreshed tokens and allow explicit recovery from an unconfirmed
switch. Display only authored account errors, never private native diagnostics.
The owner requested testing before commits; package with package:test-build.
The immutable 1.7.3 archive and receipt remain intact.

The recovery candidate passes 190 public checks and the missing-private guard
(public-only-nXdiRB), plus real initial/restart/second-window integration
(integration-HB3xm5). A native Codex probe rejects synthetic invalid credentials
without replacing a live login. Real owner-account recovery still needs testing.

The exact uncommitted 1.7.4 recovery archive passed isolated installation and
reinstallation in installed-acceptance-NxRKLF: 64 archive entries, 61 installed
payload hashes and its manifest. The Desktop test VSIX and paired receipt,
recovery notes and verification JSON have matching source hashes. SHA-256:
b086ebd8d63b056003c520d4d7a852fc495e4e918273680ec17a3add03b71910.
No live account changes, normal-profile installation or project commits were
performed. The owner must retry real-account recovery after installing 1.7.4.


Verified account-menu test delivery: 1.7.5
-----------------------------------------

The owner requested the streamlined account menu implementation and a Desktop
test artifact without commits. The canonical 1.7.5 VSIX and source/payload
receipt remain under dist; Desktop copies use the -test filename and include
test notes and verification JSON. SHA-256:
6e8dd418bb52b22e5566bbbbca38e640c91adf05064efa385da78894cbdc579e.

204 public tests, the missing-private guard and 24 commercial tests pass.
Real initial/restart/second-window VS Code integration includes the account
webview with synthetic metadata. The exact 66-entry archive passes isolated
installation and reinstallation with 63 payload hashes plus manifest checked.
The isolated installation was removed; the normal profile was not changed.
Real-account acceptance remains pending. Nothing was committed, pushed or
published. Version 1.7.5 is reserved for this exact payload.
