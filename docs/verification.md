Verification Status
===================

Version 0.10.0 is labels-only. Source Control adapters, navigation commands and
settings remain removed. The optional VS Code workbench patch was previously
restored; earlier v0.4.0 navigation results describe retired functionality.


Current checks
--------------

- TypeScript compilation and 39 unit tests passed. Coverage includes conversation
  identity, metadata validation, exact nested roots, latest scope, multiple labels,
  helper identity, manual pins, rendered titles/history and global-instruction setup.
- New checks verify that changing the pin preference leaves existing pins intact,
  non-pinned repository/custom corrections resist old evidence and yield to newer
  scope, and a non-pinned custom correction survives restart. Alias tests cover
  exact paths, ambiguous detection, dropdown names and updating pinned display
  labels. Real webview title attributes contain source explanations and full paths,
  including source-only changes. The alias command's native picker/input requires
  live acceptance; integration configures the same setting directly.
- Existing checks cover custom-label validation, rootless persistence, manual editing,
  report protection and replacement through repository selection, Auto and Clear.
  The custom menu action targets the clicked chat; integration supplies input text
  directly to its command. The native input box still needs live acceptance.
- Earlier checks cover top-title context, unassigned chats, remote/invalid IDs and
  rejection of menu assignments outside the published repository catalog.
- Real VS Code 1.121.0 integration with Git and fixture Codex webviews passed initial
  and restart phases in `.codex-temp/integration-a8jGyw`. Tests open the direct
  dropdown through contextmenu events, verify the repository list, filter it,
  dismiss with Escape, and click repository/Auto/Clear entries. Both title and
  history choices target the correct chat, including when another chat is active.
  Back dismisses the dropdown. Drafts and saved provider-visible titles survive.
  New Chat closes the dropdown and forwards once to a fixture standing in for
  Codex's command; the companion does not reassign labels or navigate itself.
- Existing integration checks cover direct user-message detection, partial appends,
  ignored IDE context, detection opt-out, pins, automatic labels, multiple current
  projects and restart persistence. No Source Control selection events occur.
  The retired workbench selection command is absent.
- The v0.10.0 display patch passed syntax, recognized upgrade, idempotence,
  byte-identical restoration, incompatible-edit refusal and partial-recovery checks
  in `.codex-temp/patch-check-rjbR4l`. The exact supported build is documented in
  [architecture](architecture.md).

Scratch profiles and prior-version artifacts are retained for diagnosis, ignored
by Git and excluded from the extension package.


Live verification boundary
--------------------------

Automated integration uses fixture conversations, not an authenticated Codex chat.
Other Codex builds, WSL, SSH and remote extension hosts have not been verified.
The direct detector handles clear focus requests using known names; implicit
changes still depend on best-effort agent reporting.

After reloading, right-click a saved local history row or the title at the top of
an open chat. Repositories should appear directly in the dropdown; click one to
pin that chat's label. Filter a long list, then use Automatic Labels to release
the pin or Clear Labels to remove it. Outside clicks and Escape should dismiss
the menu; Back should close it and navigate normally. Source Control should retain
your selection throughout.


Version 0.11 verification
-------------------------

The 42 unit tests cover redundant automatic-label suppression, inline custom-text
validation and routing identity/main-first ordering, overrides, nested paths,
explicit target precedence, conflicting windows, disable/removal and subagent
rejection. The helper installer remains idempotent and preserves unrelated rules.

Isolated VS Code 1.137.0 runs in `.codex-temp/integration-FPZr6s` passed initial
and restart phases. The real webview fixture exercised single/zero repository
catalogs, no repository rows, invalid input, Enter-to-apply, custom prefill, and
extension-published routing configuration/association/disable behavior. The popup's
single/zero catalog was supplied by the fixture; actual Git discovery used two
nested repositories. Single-root suppression is covered by the unit policy tests.

Scratch patch verification in `.codex-temp/patch-check-s5DKqG` passed syntax,
apply/idempotence, recognized v0.10 upgrade, byte-identical restoration and refusal
of unknown modifications. Authenticated Codex UI interaction and an agent following
the new instructions in a live chat remain manual acceptance checks.


Version 0.12 verification
-------------------------

All 45 unit tests passed. New coverage validates star storage and clicked-chat
identity, stars without labels, remote exclusions and pass-through of ordinary
submit messages. Both isolated VS Code runs passed in
`.codex-temp/integration-jKPkvg`: the real webview menu starred/unstarred a history
row without changing the active chat, and stars survived host restart.
The Starred Chats native picker and authenticated Codex UI still need manual
acceptance. Saved-editor opening uses the existing tested path.

Scratch patch verification passed in `.codex-temp/patch-check-16EQsl`, including
v0.11 upgrade and byte-identical restore/refusal checks.

The reported "App-server queued follow-up no longer exists" error was found in
both the installed renderer and its original unpatched backup, with the same
queue-item existence guard. The companion patch does not edit that function.
The two newest normal VS Code log folders did not contain the exact error, so its
specific trigger was not established and an indirect interaction is not ruled out.
No upstream message-queue behavior was modified.


Version 1.0.0 verification
--------------------------

Version 1.0.0 removes starting-directory label guesses and defaults local phrase
recognition to off. New chats wait for agent reports or manual choices. Existing
manual pins remain intact; old unpinned directory guesses are removed at startup.
This adopts the shared version format after 0.12.0; the v0.12 display patch is
unchanged and remains compatible.

All 45 unit tests passed. Both isolated VS Code 1.137.0 phases passed in
`.codex-temp/integration-9m59Uq`. Initial checks opened chats rooted in each of two
nested Git repositories and verified no automatic assignment before a report.
Agent reports then supplied and replaced labels. With detection off, a local
focus phrase did not override the agent; explicit opt-in restored detection.
Manual labels, stars, sidebar menus and restart persistence passed existing checks.
These are fixture checks, not an authenticated Codex chat acceptance run.


Version 1.0.1 verification
--------------------------

Routing settings now explain setup, global instruction changes, workspace enablement
and the instruction-reading boundary. Both settings link to Set Up Agent Helper,
which is also available in the Command Palette. The bundled installer is shared
with the CLI and requires explicit confirmation in the GUI before setup writes.

All 50 unit tests passed, including cancellation without writes, installation,
settings/global-file actions, remote refusal, malformed markers, preservation of
the original backup, idempotence and instruction changes during confirmation.
Both isolated VS Code 1.137.0 phases passed in
`.codex-temp/integration-BZHsWL`, including command registration and links in both
setting definitions. Existing label/menu/routing/restart checks remain passing.
The VSIX contains the setup module, installer and all required helper modules.
Whitespace, documentation links and version metadata were checked.

The command flow uses a mocked VS Code UI in unit tests. Clicking the links in the
real Settings editor and visually checking the native confirmation dialog remain
manual acceptance checks. No installation into the user's live VS Code profile or
update to the user's global instructions was performed for these checks.


Version 1.0.2 verification
--------------------------

Companion now saves scoped routing policy, preserves explicit disabled states,
resolves configured fallback filenames and installs a file-based fallback in its
managed global guidance. Version 2 live records prevent older helpers from routing
disabled profiles. The previous versions' published artifacts remain unchanged.

All 56 unit tests passed. New cases cover explicit targets after window disposal,
stale labels, missing repository associations, disabled versus unavailable state,
scope boundaries, specific overrides, conflicting workspaces, fallback precedence
in nested directories, invalid configuration/recovery, idempotent persistence and
the saved configuration remaining readable after routing.js is removed.

Both isolated VS Code 1.137.0 phases passed in
`.codex-temp/integration-uNgvM8`. The live extension published the configured scope
and fallback names, resolved explicit focus independently of a label, persisted an
off state, blocked invalid settings and recovered when they were corrected. Existing
label/menu/star/routing/restart checks passed. Earlier attempts exposed a Windows
path-casing assertion and empty-association handling; both were corrected before
the passing run. Whitespace, documentation links and version metadata passed.

A read-only comparison with the installed helper returned the same ordered
instruction paths for the website and Companion repositories using the existing
shared-main configuration. The generated fallback is still agent guidance: tests
verify its rules and the surviving configuration, not an authenticated model's
behavior when Node or the helper is unavailable. Live setup/Settings visual checks
remain manual. The user's global and System instructions were not edited.


Version 1.0.3 verification
--------------------------

Set Up Routing now offers a shared-file choice, project-folder choice and final
Enable Routing review. Routing settings use shorter descriptions. A startup
invitation allows Not Now once, followed by a final Don't Ask Again reminder;
ignored invitations also stop after two showings. Choosing setup ends reminders.
Existing configured users, explicit off choices and background/remote windows are
excluded from invitations. Native VS Code controls supply theme behavior.

All 62 unit tests passed. Setup coverage includes cancellation, project-only rules,
shared files and parent folders, retaining previous choices, preserving extra
filenames, refusing the global file as shared rules, settings drift, and invitation
state across simulated restarts. Tests use mocked native UI with real disposable
helper installation. Both VS Code 1.137.0 integration phases passed in
`.codex-temp/integration-4H9Iip`. The earlier run timed out in the existing inline
label-editing check; rerunning without changing that behavior passed. The fixture
explicitly disables routing initially so onboarding does not interrupt unrelated
UI checks. Whitespace, documentation links and version metadata passed.

The invitation and setup dialogs still need live visual acceptance in light/dark
themes. The file picker follows the system theme. Tests do not run setup against
the user's global instructions or choose their shared file for them.


Version 1.0.4 verification
--------------------------

Combined native setup presents independent chat labels/stars and project
instructions, with status, Back/Done navigation, and unchanged invitation limits.
Existing dismissals remain respected. Settings link to the combined menu; the
legacy routing command remains available. Chat setup bundles the installer and
four bridge assets and offers explicit enable, restore, and reload actions.

All 74 unit tests passed, including combined setup cancellation, configuring each
feature independently, routing off without removing instructions, legacy reminder
state, display review/cancellation, missing/unsupported Codex, installation drift,
restore consent, reload, and label visibility without restoring the integration.
Both VS Code 1.137.0 integration phases passed in
`.codex-temp/integration-kRIIMd`. The initial attempt in
`.codex-temp/integration-WxkChx` found the old settings-link expectation; that
assertion was updated for the new combined command before the passing run.

`node tools/test-display-setup.cjs "<installed Codex directory>"` passed using
Codex 26.908.40401 originals copied into disposable repository scratch space.
It verified apply, idempotence, missing-bridge repair, byte-for-byte restoration,
lock refusal, failed-write rollback, external-edit refusal, unsupported-version
refusal and execution through VS Code's Electron-as-Node runtime. The copies were
removed afterward. The installed Codex files and user instructions were not mutated
by these tests. The VSIX file list includes the installer and all four assets.

Setup UI behavior is covered with mocked native controls; light/dark visual
acceptance remains manual. The real VS Code integration uses fixture conversations,
not an authenticated Codex session. This is a local release, not Marketplace
publication or evidence of Marketplace acceptance of the optional patch.


Version 1.0.5 verification
--------------------------

All 73 unit tests passed. Obsolete Quick Pick wizard tests were replaced by page
and routing-save coverage: one-panel reuse, independent actions, cancellation,
input validation, global/settings drift, trust loss, unknown messages, stale
revisions, draft preservation, workspace/Git updates and reminder persistence.
Both isolated VS Code 1.137.0 phases passed in
`.codex-temp/integration-hAHeW7`, including opening/reusing/closing the real setup
page and adding/removing a non-Git workspace folder to verify durable scope refresh.

Light and dark page layouts were rendered and visually inspected using headless
Edge with representative VS Code theme variables. Screenshots are in
`.codex-temp/setup-visual`. These are browser layout checks, not proof of every
installed VS Code theme or accessibility tool. No preview or reset feature is
included. The existing checked patch installer is unchanged in this release.


Version 1.0.6 verification
--------------------------

All 74 unit tests passed after moving detailed recovery instructions into the
installed fallback.md file. Coverage verifies upgrading a managed block while
preserving user rules before/after it, effective override selection, original
backup retention, idempotent installation, repair of a missing recovery guide,
and recovery configuration remaining readable after routing.js is removed.
Existing disabled-state, conflict and missing-main-file cases still pass.

The generated global block is 170 whitespace-separated words using the same
example home as the previous 816-word block, a 79% reduction. No token-cost or
model-adherence benchmark was performed. These checks verify installed text,
files and routing logic, not an authenticated model's response to instructions.
The VS Code UI integration suite was not repeated for this installer-only change.
The reset global instructions and routing settings are left untouched; the shorter
block is installed when the user enables or saves project instructions in setup.


Version 1.0.7
-------------

The startup invitation now says "Set up Codex Repo Companion?" using the full
extension name. Button labels and reminder behavior are unchanged. This is a
wording-only change; TypeScript compilation and packaged-text checks apply.


Version 1.0.8
-------------

Project instructions now has two introductory lines explaining automatic AGENTS.md
discovery and the optional shared workspace AGENTS.md. Behavior is unchanged.
TypeScript compilation and packaged-text checks apply to this wording-only change.


Version 1.0.9 verification
--------------------------

All 81 unit tests passed, including settings changed during label installation,
compatibility changes without losing form drafts, unsupported-version guidance,
startup monitoring, event deduplication, disposal and installation-specific reload
status. Both isolated VS Code 1.137.0 phases passed in
`.codex-temp/integration-2baYVf`. An earlier run failed because the workspace test
removed a folder before the extension host received its addition; the test now
waits for that state before removing it.

The disposable-copy patch tests passed against Codex 26.908.40401: apply,
idempotence, missing-bridge repair, exact restoration, lock refusal, abandoned
temporary files, failed-write rollback, external-edit refusal, unsupported-version
refusal and Electron-as-Node execution. Temporary publication names are unique to
each attempt. Abandoned files are preserved and cannot block a retry. A hard crash
can still require manually removing the named setup lock after closing other setup
operations; this release does not guess whether an existing lock is abandoned.

Compatibility is checked at startup and when the Codex installation changes.
Setup refreshes only chat status during those changes, preserving routing drafts
and their original conflict baseline. A status-bar warning links to setup when
labels need attention; unsupported versions offer Open Extensions. Applying or
restoring chat integration records the user's choice for subsequent startups.
No unsupported version is patched automatically. Project instruction routing
remains independent. The integration tests use fixture conversations, not an
authenticated Codex conversation or a live third-party extension update.


Version 1.1.0 verification
--------------------------

All 90 unit tests passed. New coverage checks prior opt-in, recognized legacy
patches, automatic application, unsupported versions/checksums, partial setup,
failed-attempt persistence, manual retry, explicit restoration, per-version
reminder limits, Silent Mode, focused-window and setup-page suppression, and
unanswered notifications not blocking subsequent supported updates.

A real installed-helper subprocess resolved shared, ancestor, repository and nested
instructions with no display bridge or live routing records. Separate routing
status checks detected missing helper files and kept an explicit off choice.
These checks do not prove that an authenticated model has read the instructions.

Both isolated VS Code 1.137.0 integration phases passed in
`.codex-temp/integration-6jCsPm`. Disposable Codex 26.908.40401 copies passed the
existing patch apply/restore, lock, interruption, rollback, unsupported-version,
external-edit and Electron execution checks. Automatic update decisions and popup
choices were exercised with controlled extension API fixtures; no real Codex
update or destructive failure was performed in the user's installed extension.

Version 1.1.0 follows 1.0.9 under the shared single-digit version policy. The Codex
patch payload and managed AGENTS.md instructions are unchanged. The extension now
uses a previous chat-integration opt-in to reapply supported patches after updates.
Restore disables that maintenance. Existing Silent Mode continues to suppress
background popups. Previously saved instruction-routing choices are preserved.


Version 1.1.1 verification
--------------------------

A fresh isolated npm ci completed and TypeScript compilation plus all 91 tests
passed in `.codex-temp/release-clean-2u7um0so`. Eleven dependency records corrupted
by earlier broad version replacements were restored using installed metadata with
matching integrity hashes. The new release metadata check compares root versions,
package output names and dependency versions/constraints with installed manifests.

The listing is shortened, with the previous technical guide retained in
advanced.md. Free-use licensing, privacy information and support metadata are
included. Packaging now targets Windows x64 and retains normal license/repository
checks. Runtime code and patch payloads are unchanged from 1.1.0; its integration
and disposable-copy patch results remain applicable. No minimum-version or
additional platform support is claimed as verified. Public submission remains
pending the separate release-preparation decisions.


Version 1.1.2 verification
--------------------------

All 92 unit tests passed. Update searches now use the installed extension ID;
coverage checks both keenanselbee and the earlier local-tools identity. The package
guard rejects mismatched root versions and preserves an existing release artifact.
The publisher is keenanselbee and the original chat/branch PNG icon is included.

Both isolated VS Code 1.137.0 phases passed in `.codex-temp/integration-SWHSP3`,
including startup and restart persistence under the new identity. An isolated
VS Code 1.96.2 run in `.codex-temp/integration-aYS3pM` failed by timing out on the
custom chat-label check. The released engine requirement is consequently raised
to the tested 1.137.0 minimum; no claim is made about the earliest version that
could work. Integration still uses fixture conversations, not authenticated Codex.

Disposable Codex 26.908.40401 copies passed apply, idempotence, missing-bridge
repair, exact restore, lock refusal, interrupted temporary recovery, failed-write
rollback, external-edit refusal, unsupported-version refusal and Electron Node
execution. The npm dependency audit reported zero known vulnerabilities. The
prior clean-install result remains applicable; dependency versions are unchanged.

The new identity has not been installed into the user's working profile. Local
state-transition instructions describe backups and disabling the old build;
the product does not overwrite or migrate private VS Code databases. Screenshots,
publisher account registration and patch permission remain release-preparation
items. The earlier 1.1.1 artifact is preserved unchanged.


Version 1.1.3 verification
--------------------------

All 94 unit tests passed. Focused regressions cover restoring already-original
Codex without subsequent automatic patching, including restart; displaying error
and reload explanations after rollback while keeping ordinary Off text hidden;
and validating a more specific profile's missing, empty, directory or readable
shared file. Disabled profiles remain reported as off.

The privacy heading now uses eight equals signs. Release whitespace/conflict checks
include complete working files so newly added documents are checked before a
version is packaged. Privacy wording, settings and storage formats are unchanged.
No installed Codex files or global/shared instructions were changed. The existing
1.1.2 artifact is preserved. Prior integration and patch recovery results remain
applicable to their unchanged code; this patch uses the focused regressions above.
