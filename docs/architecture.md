Architecture and Compatibility
==============================

The extension uses VS Code's tab API to recognize `chatgpt.conversationEditor`
editors with `openai-codex://route/local/<id>` or `/remote/<id>` resources. Those
identifiers are Codex implementation details, not a public integration contract.
Only the parsed conversation key is used for identity; query text and the visible
title are not identifiers. Sidebar identity and focus require the separate bridge.
The generic `/extension/panel/new` URI and legacy `chatgpt.panelView` webview are
recognized as launchers, never as persistent conversation identities. They can
continue displaying a completed chat without changing their underlying address.

The saved-chat picker reads up to the last 1 MiB of the local
`session_index.jsonl` metadata file, deduplicates IDs, and offers up to 200 recently
updated conversations. It opens the selected `/local/<id>` with `vscode.openWith`.
It does not guess identity from the active sidebar, title, or most recent record.


Repository ownership
--------------------

The Git extension API supplies repository roots. Assignment always selects an
exact root, including independently registered nested repositories. A chat's
working directory, the active file, and its assigned repository can differ.
The companion never changes a Codex session's working directory or permissions.

`repositoryAssignments.v1` stores conversation keys, the primary `{ root, label }`,
optional ordered members, and the automatic source. `repositoryModes.v1` stores
Auto, Pinned, or None overrides. Legacy manual assignments default to Pinned.
Clear is an explicit None override so metadata cannot immediately recreate it.
A manual override made during an asynchronous read takes precedence.

The agent helper reads `CODEX_THREAD_ID` from its own execution environment and
verifies the matching local session metadata record has the same ID and source
`vscode`. It rejects missing identity and subagent-origin metadata. The agent must
never override that environment variable or report on behalf of another agent.
It validates exact Git roots with bounded `git rev-parse` calls, deduplicates roots,
and atomically replaces its own `repo-companion/reports/<thread-id>.json` record.
Identical reports make no write. Reports contain only roots, ID, format version,
and a timestamp; empty roots explicitly represent a non-repository task.

The extension watches report filenames and applies changed reports through its
serialized queue. Labels derive from workspace aliases or repository directory
names; the primary comes first. Up to three names are displayed within the existing
100-character bridge bound. Larger scopes use two names plus `+N`; full membership
is retained in the tooltip. Report paths must be absolute and have a Git marker;
Manual pickers offer only repositories registered in this window.

Auto waits for agent reports or explicit user corrections; it never infers scope
from the session's starting directory, active editor or selected Git repository.
The optional discussion detector can supply scope when explicitly enabled. On
upgrade, unpinned directory guesses and disabled discussion guesses are removed
before publishing labels or routing. Manual corrections, custom labels and pins
remain intact. The legacy `directory` source is still parsed to preserve explicit
pins and recognize old guesses, but no new assignment uses it.

The session index remains for helper identity verification and opt-in discussion
reads. It visits at most 20,000 entries in the standard session layout, skips
symlinks and reads at most 256 KiB for a matching metadata record. Report watchers
handle scope changes; session appends trigger no scope work when detection is off.
Startup considers up to 200 recent index entries and 2,000 report files.

Reports replace current scope; they do not accumulate past projects. The latest
explicit discussion focus is primary, even before file edits. Agent instructions
state this boundary. The extension also detects clear focus requests directly
from local user-message records, as described below.
Pins retain their explicit override. Source Control selection is never changed.

The setup script installs five compiled helper modules in a stable Codex-home
location and maintains only its marked block in the effective global instructions.
It preserves unrelated text and backs up the original instructions. No network
service, additional AI classifier, or custom dynamic-tool registration is used.
Agent reporting is best effort and remains subject to the current sandbox and
user instructions. Explicit read-only/no-write tasks skip metadata reporting; a failed report must
not interrupt the actual task.


Direct discussion detection
---------------------------

`detectChatFocus` defaults to false and is opt-in. On opening a chat, the verified local session
file is read from at most its last 1 MiB. Subsequent reads use an append cursor,
again bounded to 1 MiB per read. Only complete `response_item` user messages with
`input_text` are candidates; assistant/tool output is never interpreted as focus.
Partial records wait for completion. Individual records above 256 KiB are skipped,
and candidate requests are limited to 32 KiB. IDE context, marked instruction
attachments, fenced code and block quotes are excluded from matching.

Known Git roots provide directory names and workspace aliases. A focus phrase
must name a project at its start; it cannot match a project embedded in prose.
Exact longest matches win; one-character edits or adjacent transpositions are
accepted only for names at least five characters long and without a root tie.
Explicit conjunctions can name related projects. An ambiguous list makes no change.
Catalogs are capped at 500 roots; matching examines at most 512 characters after
a focus cue. The matcher does not provide general semantic interpretation.

The reader retains at most 64 cursors. Session-change handling is throttled to
one batch per second during streaming and limited to known chats. History startup
does not scan all transcripts: initial reads happen for opened chats, or known
chats whose session file changes. Detected roots and timestamps persist in
workspace state; raw message text is never persisted or logged by the companion.
Newer reports/corrections can supersede a detection, and pins/None always win.
Disabling detection excludes those records and stops discussion reads.

No external classifier, API request, or additional model is used. The existing
agent helper is the default source of automatic labels.



Sidebar and active conversation
-------------------------------

The protocol-2 bridge observes Codex webview creation, focus, visibility, and
disposal. A small effect in the checksum-matched renderer reports the current
router path, execution host ID, and document focus. It reports initial rendering,
route changes, and focus; it does not infer identity from history or unread state.
Only recognized local-host conversation routes become assignment keys. Blank,
non-chat, and unsupported execution-host routes clear the prior identity.

The renderer observes window focus without moving element focus, intercepting
clicks, or changing input contents. Version 0.2.1 removes the element-refocusing
hook introduced in 0.2.0 after a live report that Back stopped responding. No
transcript text or other query parameters are sent to the companion.

The companion subscribes through private commands and rejects malformed state or
older revisions. The focused sidebar takes precedence over the editor behind it.
Actual editor-tab switches identify editor context; metadata updates from
background webviews do not change the focused conversation. The companion only
sends label metadata. It never calls Source Control commands or restores focus.
Legacy focus/navigation bridge commands remain inert compatibility hooks in the
existing checksum-matched Codex patch; the companion no longer invokes them.


Retired Source Control integration
----------------------------------

Version 0.5.0 removes both automatic and manual navigation, its settings and
command, and the adapters. The Git API is used only to enumerate repository roots
and observe discovery for repository names and manual label choices. It is never
used to set selection. The VS Code workbench patch is unnecessary and should be
restored. `tools/patch-vscode.cjs` and its hook text remain only for checksum-checked
restoration of v0.4.0 installations. Applying that retired patch is disabled.

User corrections are separate files under `repo-companion/corrections`, with the
same bounded schema as reports. Auto picks the newer report or correction; pins
and None mode still take precedence. The correction tool verifies a saved local
conversation and exact Git roots. A new agent report can supersede a correction,
including when its roots match an older report.

Automatic errors remain silent by default. Timestamped Output records describe
scope changes and errors without including conversation text.


Display-only title bridge
-------------------------

Codex sets its own `WebviewPanel.title`; VS Code gives that title precedence over
custom editor label patterns. The supported tab API exposes labels as read-only.
A regular companion extension cannot directly rename another extension's panel.

The opt-in local patch adds bridge calls during Codex activation, custom-editor
resolution, webview initialization, and inbound message handling. The bridge wraps
that panel instance's title accessor. Codex reads and writes its original title;
the underlying VS Code setter receives a prefixed display value. Repeated Codex
title updates keep the prefix. Clearing an assignment restores the current base
title. No app-server calls or thread-name writes are involved.

The companion sends validated assignments through the private
`codexRepoCompanion.bridge.setAssignments` command. The bridge does not load the
companion's files, read repository contents, access the network, or persist state.
It releases panel references on disposal and checks the title accessor before
wrapping it. Sidebar repository labels use the companion's status bar item; the
sidebar header also renders a prefix through a small React child component. The
saved title value and parent header props stay unchanged. The child subscribes to
a metadata-only label message, matches it against the current route, and renders
the prefix as text. The same message contains assignment keys and sanitized labels
for history rows, including while no conversation is active. Six saved local/cloud
row call sites in the verified header bundle receive a subscribing `titlePrefix`
child. Pending chats and unsupported execution hosts receive no prefix. Titles,
search fields, click handlers, and archive/rename arguments remain unchanged. Back, title-menu, and rename handlers are untouched. Clearing
an assignment or disabling `showTabPrefix` clears history, header, and tab prefixes.

Patch compatibility:

- Extension: `openai.chatgpt`, version `26.908.40401`.
- Bundle SHA-256: `820691c93be40e73f0929b633cddc694b41775050cd72283faba283e53941f4f`.
- Renderer: `webview/assets/app-initial-1e5ee25fb4ec.js`.
- Renderer SHA-256: `0d3e38dbac570fefa5a0b0ecec3522308df74aa7b1fe538e1ea2490489347dd9`.
- Header: `webview/assets/header-fc6d647f8f9f.js`.
- Header SHA-256: `8f7ef4b415a9dbad8ee0f61a1aef8ee5f5e6c5d668eff4b74a83e90911830d24`.
- Bridge protocol: `2`.
- Other bundles require a new review, checksum, and compatibility verification.

All three originals and all unique replacement anchors are verified before writes.
Patched JavaScript is syntax-checked, each replacement is atomic, and original
bytes are backed up. A failed apply rolls back files written by that attempt.
Recognized partial patches can be completed or restored; unknown edits are refused.
Restore preflights all three files before replacing any. There is no cross-file
filesystem transaction, so the window must be reloaded after staging a patch.

An update to Codex may remove the bridge. Saved editor-tab assignment and SCM
following remain available. The companion does not reinstall or bypass version
checks automatically. Version-1 patches must be restored with the old tool first.
The exact v0.2.0 through v0.2.2 renderer, header, and bridge patches are recognized by checksum
and can be upgraded directly to v0.2.3 while retaining the original backups. Unknown modifications
remain rejected.


Automation command arguments
----------------------------

`codexRepoCompanion.assignRepository` accepts an optional conversation `Uri` and
an optional repository-root `Uri`. Omitting the root opens the picker. Supplying
a root only succeeds when it is already registered as a local Git repository.
The context-menu command uses the supplied conversation resource instead of
assuming the active tab is the clicked tab.

`codexRepoCompanion.openSavedChat` opens the recent-chat picker by default. An
optional UUID argument opens that local chat directly, without reading the index.


References
----------

- [VS Code tab API](https://code.visualstudio.com/api/references/vscode-api#TabInputCustom)
- [VS Code custom editor label precedence](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/customEditor/browser/customEditorInput.ts)
- [Git extension API](https://github.com/microsoft/vscode/blob/main/extensions/git/src/api/git.d.ts)
- [Codex developer commands](https://learn.chatgpt.com/docs/developer-commands?surface=ide)


History and title repository menu
---------------------------------

The Codex header patch wraps each of the three local history-row call sites in a
display-contents element. Each conversation header title also carries
`data-vscode-context` with section `repoCompanionChat` and its exact local UUID,
even without a prefix. Original row props, click handlers and title text remain
Codex-owned. Remote hosts and unsaved/invalid IDs have no companion menu context.

The v0.8.0 route effect installs one scoped contextmenu listener. When repository
metadata is available, a right-click on that section opens a small DOM dropdown
in the webview, with the sorted open Git repositories, a name/path filter, Auto
and Clear. The list scrolls; duplicate labels include paths. Content uses textContent
and DOM properties, never HTML interpolation. Keyboard arrows, Enter and Escape are
supported. Outside clicks, blur and route cleanup dismiss it. No polling or DOM
observer is used. Ordinary webview context menus are untouched elsewhere.

The extension sends its repository catalog through the existing label bridge.
The menu captures the clicked chat key, and posts only an assign/auto/clear action
with that key and, for assignment, an exact root URI. The bridge consumes these
messages before Codex sees them. It requires a registered surface, valid local
UUID, allowed action, and a published repository root. The companion validates
again against the Git repositories still open when assignment runs. It never
falls back to the active chat when supplied identity is invalid. A removed root
cannot silently select another repository. Choose pins one root; Auto releases a
pin and reads recent discussion; Clear pauses labels for the clicked chat.

Native `webview/context` contributions remain as a picker fallback when the
renderer lacks repository metadata. They are restricted to Codex view types and
the marked section, with hidden command-palette entries. This uses the documented
[VS Code webview context-menu mechanism](https://code.visualstudio.com/api/extension-guides/webview#context-menus).
The private Codex integration is checksum-checked and reversible; it is not a
public Codex API. The v0.8.0 patch upgrades recognized earlier versions while
preserving their original bundle backups.


The v0.8.1 dropdown also includes New Chat in Sidebar. It forwards the allowlisted
`newChat` action to Codex's existing `chatgpt.newChat` command with no arguments.
The companion closes its menu but does not create a thread or assign a repository
itself. This restores access to the Codex entry hidden by the custom dropdown.


Custom labels
-------------

Version 0.9.0 adds a Custom Label action to the direct dropdown, native fallback,
editor context menu and status menu. The clicked conversation key is captured
before opening VS Code's input box, so focus changes cannot retarget the edit.
Cancel makes no changes. Input validation rejects blank text, control characters,
square brackets and trimmed values longer than the bridge's 100-character limit.

`customLabels.v1` stores a separate conversation-key-to-text map in workspace state.
It overlays display assignments and pins automatic updates without inventing a
Git root or changing the existing saved repository assignment. Rootless custom
labels therefore survive restart. Status diagnostics report source `custom` and
no assigned root while the override is active. Repository selection, Auto or Clear
removes the override; Pin current keeps it. Rendering stays text-only and the
underlying Codex conversation title is unchanged. No AI call is involved.


Manual choice policy, aliases and explanations
---------------------------------------------

Version 0.10.0 adds `pinManualLabels` (default true). Only future choices read this
preference. Existing mode overrides are retained. With the preference off,
`manualLabelTimes.v1` records a timestamp watermark alongside the existing chosen
repository or custom text; the mode is Auto. The watermark includes current known
report timestamps. Automatic updates require a strictly newer report/detected
focus; metadata fallback cannot undo the correction. A newer valid scope removes
the custom override and watermark. Explicit Auto/Clear removes both immediately.
Manual choices block in-flight reads, which recheck the watermark and mode before
publishing. The state persists per workspace, including rootless custom choices.

`repositoryAliases` maps absolute Git roots to validated display names. Aliases
precede workspace folder names for exact-root display; the discussion catalog
includes aliases, original workspace names and directory names. Ambiguous matches
remain unresolved. The Set Repository Alias command provides a picker and input
box for the map. Presentation is regenerated from roots when settings change so
existing pins follow a renamed repository alias; custom text is independent.

The display bridge carries plain-text explanations (at most 16,000 characters)
and the manual-pin preference. Header and history title attributes show the
explanation and full paths, with separate subscription snapshots so a source-only
change updates the hover text. The status bar uses the same explanation. No raw
chat text, additional model calls, Source Control actions or cross-window
synchronization are introduced by these features.


Single-repository presentation and instruction routing (v0.11)
--------------------------------------------------------------

`hideRedundantRepositoryLabels` suppresses only an automatic single-root label that
matches the one distinct local Git root in the window. It does not delete metadata
or hide custom labels and pending manual corrections. The renderer receives a
separate validated custom-label map for prefill, including when prefixes are hidden.
A zero/one-entry catalog selects inline text entry; multiple entries retain search.
Inline submissions carry only clicked identity and bounded text and are validated
again in the extension host. New Chat continues to call Codex's own command.

`instructionRouting` is opt-in, with optional absolute `mainInstructionsFile`.
`customRouting.v1` holds explicit custom-label root associations. Root association
never derives from custom text or an alias string. Association changes are separate
from label pinning. A new custom label cannot inherit a stale old association.

The original v0.11 protocol described below is superseded for new publications by
the durable scoped routing section. Legacy live records remain readable on upgrade.

Each extension host atomically publishes changed routing metadata to its own random
file under Codex home's `repo-companion/routing`. It includes its PID, main path and
up to 2,000 known local chats with ordered root lists (maximum 16 per chat), bounded
to 2 MiB. Identical refreshes make no writes. Disabling/disposal removes the file.
The helper scans at most 256 directory entries, skips dead processes and bounds
individual reads to 2 MiB. Conflicting live-window roots/main paths fail closed;
an explicit target supersedes root differences but never conflicting main files.
No active-window or latest-chat heuristic substitutes for verified thread identity.
Crash leftovers may remain and are ignored when their process is gone.

The helper verifies the local VS Code session and exact Git roots with existing
bounded helpers. It lists nonempty AGENTS.override.md/AGENTS.md files along ancestor
paths, main first, then scoped project/nested files. Up to 32 explicit target file
paths must be lexical descendants of a resolved root. It does not enumerate source
trees, parse Markdown include syntax, inject instructions or modify Codex settings.
Configured fallback filenames remain the agent's responsibility. The global helper
instruction block tells the agent to read applicable files, honor explicit user
focus, and consult on task/focus changes only. Discovery is not proof of reading or
compliance; routing and automatic scope reporting remain distinct operations.


Stars (v0.12)
-------------

`starredChats.v1` is workspace state keyed by validated local conversation IDs. It
holds at most 2,000 stars with bounded remembered titles (500 characters), separate
from assignments, modes, custom text and routing. The bridge sends only starred IDs,
not remembered titles. A separate reactive snapshot adds a star before history and
header text even when labels are absent or disabled. No editor-tab title or provider
chat title is renamed, and history list ordering stays Codex-owned.

The menu offers Star/Unstar and Starred Chats. Host-side dispatch validates registered
webviews and exact clicked identity. The picker refreshes names from the bounded
recent index and falls back to remembered names, then opens the existing saved-editor
route. Star changes use no network request, AI model, or message submission.


Agent helper setup from Settings
--------------------------------

Routing settings use Markdown descriptions with a command link to
`codexRepoCompanion.setUpAgentHelper`, also available in the Command Palette.
The command prepares a read-only installation plan with the effective global
instructions path and bundled helper bytes. A native modal names the destinations
and requires Install / Update before writes. Cancellation makes no setup writes.
Remote windows are rejected because the helper targets local VS Code sessions.

The extension and CLI share `agent-helper.ts`; the VSIX includes the compiled
installer and helper files, so GUI setup needs neither a checkout nor a terminal.
The installer rejects ambiguous markers and rechecks the effective instructions
file and contents after confirmation. It preserves unrelated guidance and the
original backup. Setup never changes routing settings, patches Codex, or reloads
windows. Its completion notification links to routing settings and the updated
global file. The setting checkbox only controls routing metadata publication.


Durable scoped routing (v1.0.2)
-------------------------------

Each local workspace publishes version 2 live snapshots including a scoped routing
profile, even when routing is disabled. Version 1 readers ignore these snapshots,
preventing old helpers from interpreting explicit off states as enabled routing.
The new reader retains the old live-only behavior for legacy version 1 records.

Profiles contain an absolute workspace identity, enabled flag, scope directories,
main path and ordered fallback filenames. Empty Instruction Scope uses local
workspace folders. A saved workspace file identifies a multi-root workspace; a
folder identifies a single-folder window. Untitled workspaces use their first local
folder until saved. Windows identities use case-insensitive normalized paths.
Profiles persist in `repo-companion/routing-config`, keyed by a SHA-256 workspace
path digest. Publication is serialized per host and uses atomic replacement;
identical records are not rewritten. Disposal removes only the live snapshot.
Invalid edits persist an error record, so stale enabled rules cannot survive a
rejected change. Correcting the setting replaces that error, even when returning
to the previously valid configuration.

The helper validates at most 256 saved directory entries and reads at most 1 MiB
per profile. A profile allows 64 absolute scope directories and 16 plain fallback
filenames. Corrupt, oversized, mismatched or invalid saved configuration stops
resolution explicitly. Live profiles supersede their own workspace's saved copy;
conflicting live windows remain distinct. Directory containment uses path segments.
The deepest matching scope wins; equally specific policies must agree on enabled
state, main path and ordered fallback names. A disabled mixed-scope request returns
no instructions; the agent can resolve each explicit target separately.

Explicit targets need verified local conversation identity but no active window.
Implicit targets still come only from current live chat associations; saved scopes
and labels never identify the user's task. Out-of-scope targets return unavailable.
Results distinguish disabled from unavailable. Standard override/AGENTS precedence
is followed by configured fallback names at each ancestor and target subdirectory.
Only explicitly supplied target files extend discovery below the root.

The installed global block also describes direct file-based fallback: read the
saved profiles, honor scope/disable/conflict rules, then read the main and relevant
project files. This does not depend on Node or the helper's compiled dependencies,
but it does require local file access and the agent following its instructions.
Invalidation records block that fallback too. No automatic instruction injection
or proof of reading is claimed. Settings are last-observed values; changes made to
a closed workspace take effect after reopening it. Independent user rules remain
authoritative, and setup never deletes handwritten routing policies.


Simple routing setup (v1.0.3)
-----------------------------

Activation schedules one non-blocking invitation after two seconds, only in a
focused, trusted local workspace. The `routingInvitation.v1` global memento stores
the number of invitations shown and whether reminders have ended. It is shared
across workspaces in the VS Code profile and is not reset by extension upgrades.
The count is saved before the notification appears. The first invitation offers
Set Up Routing / Not Now; the second offers Set Up Routing / Don't Ask Again.
Closing or ignoring a notification counts as a showing. No third invitation is
scheduled. Choosing setup, including opening setup from a command, ends reminders.
Existing enabled setups with an installed helper and managed block are skipped,
as are explicit disabled settings. The invitation never enables routing itself.

The existing `setUpAgentHelper` command ID now has the title Set Up Routing and
opens two native Quick Picks followed by a review dialog. It chooses a separate
shared file or project-only rules, then workspace/current folders or a selected
parent folder. File identity checks resolve symbolic links to reject the effective
global file as the shared main. Existing shared/scope choices can be kept, and
extra filenames are preserved. Cancelling leaves helpers and routing settings
unchanged; the reminder response remains remembered.

Enable Routing installs the prepared helper plan, saves the selected main/scope
to workspace settings, and enables routing last. Settings drift during the flow
and global-file drift before installation stop completion. Native VS Code controls
follow the editor's theme without custom HTML or fixed colors; file/folder dialogs
use the system picker. Notification and picker flow are separate from source/CLI
helper installation, which still only installs helper files and global guidance.


Combined setup in 1.0.4
-----------------------

The native Set Up Repo Companion menu presents independent chat integration and
project instruction choices, refreshes status after each flow, and returns to the
menu until Done or Escape. It preserves routingInvitation.v1 state so upgrades
never restart dismissed invitations. The first invitation allows Not Now, and the
second offers Don't Ask Again. Opening either setup command ends invitations.
Existing routing setup/off choices remain excluded from startup onboarding.

The VSIX includes only the display installer and its four bridge assets from the
development tooling. display-setup.ts discovers openai.chatgpt through the VS Code
extension API and invokes the installer asynchronously using Electron as Node.
Initial setup requires the user to enable chat labels. Version 1.1.0 also reapplies
a previously enabled integration after a supported Codex or Companion update.
Every mutation rechecks the selected installation and exact file checksums, and
requires a user-triggered reload. Remote and untrusted windows are excluded.

Mutations use an exclusive per-installation lock and revalidate after acquiring
it. Backups and bridge files cannot be symlinks or non-files. A missing bridge is
a repairable partial installation. Failed apply rolls back replaced bundles and
removes the newly created bridge if its bytes still match. Recognized interrupted
operations retain originals for retry or restore. A crashed process can leave a
lock; the error identifies it for deliberate removal after setup has stopped.
There is no multi-file filesystem transaction. Restore remains an explicit
command before uninstall; uninstalling Companion does not itself restore Codex.


Single-page setup in 1.0.5
--------------------------

A single reusable webview replaces the Quick Pick sequence. Setup and the legacy
routing command open the same page. Workspace routing remains dynamic (empty
instructionScope); custom scope choices are retained and explicitly identified.
The page subscribes to workspace and Git repository changes. The publisher also
refreshes durable scopes directly on workspace-folder changes, including folders
that are not Git repositories.

The page uses VS Code theme variables, native HTML controls, a restrictive CSP,
nonce-protected bundled JavaScript and text-only rendering of paths and names.
Only explicit enable/save/restore messages perform writes. The host validates
message actions, revision, trust, settings drift and routing inputs. The global
instruction preview is rechecked by the installer before modification. External
settings changes require Refresh. Repository updates and chat installation retain
unsaved routing fields. Browser file selection is the only extra picker.

Chat integration consent and restore explanations sit alongside their action
buttons. The page invokes the existing checked installer without a second modal.
Reload remains an explicit button. No preview or reset command is shipped.


Compact global guidance in 1.0.6
--------------------------------

The installer keeps only normal routing/report commands and essential scope,
identity, disabled-routing and read-only boundaries in the global managed block.
Using a fixed example home, the generated block shrank from 816 to 170
whitespace-separated words (79%); this is a word count, not a token measurement.

Detailed recovery instructions are generated as repo-companion/fallback.md,
installed with the helper files before the managed global block is written.
Global guidance references it only on helper failure/unavailability and explicitly
skips it for disabled routing. Missing recovery guidance is reported before using
ordinary project instructions. Scope matching, conflicts, ordered fallback names
and the missing-main-file policy are retained in that guide. A missing Node binary
or routing.js does not prevent reading it; deleting the entire helper directory
also removes the recovery guide. Setup recreates it without changing unchanged
global instructions or replacing the original backup.


Automatic patch maintenance (1.1.0)
----------------------------------

The existing chatLabelsEnabled choice gates automatic reapplication. A recognized
older patch can establish opt-in if no explicit choice was saved; an explicit
restore remains off, including a restore request when Codex already has original
files. A compatible original or recognized older patch is eligible.
Unknown versions/checksums and partial installations require attention. Attempts
are saved before mutation and keyed by installation path, Codex version and
Companion version; the latest 16 are retained. Failure does not loop on restart.
A manual retry or a new Companion release provides another opportunity.

Notifications never hold up compatibility processing. Previously enabled users
can receive at most two failure reminders per Codex version on separate startups;
Don't Ask Again for This Version ends them immediately. Dismissal suppresses
notifications, not a future supported repair. Silent Mode, an unfocused window,
manual actions and an open setup page suppress background popups. Reload stays a
user action. Notifications and retry records use VS Code global extension state;
the existing filesystem setup lock prevents concurrent patch writes across windows.

Routing status independently checks installed helper readability and JavaScript
syntax, shared-file readability for the workspace and each selected profile,
saved scope/configuration and matching-profile
conflicts. It does not load the chat bridge or assert model adherence. Automatic
chat repair never enables, disables or installs routing. Managed AGENTS.md guidance
is unchanged by this release.
