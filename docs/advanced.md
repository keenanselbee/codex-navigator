Advanced use and development
============================

Codex Navigator owns its sidebar. It does not inject UI, rename native Codex tabs,
patch extension bundles or automatically restore/reapply another extension's files.

Setup
-----

Start a trial or activate a licence in Navigator, then run **Codex Navigator:
Set Up Codex Navigator**. **Open Navigator** opens the view. First use after
admission shows a setup button until hooks are installed, enabled and trusted.
Delivery verification is diagnostic and never blocks the chat list. There is no skip or permanent dismissal.
If readiness fails later, Navigator replaces chats with setup and the relevant next
step. Previously started setup is identified as needing attention. Saved chats,
labels and other preferences remain intact. There is no separate startup popup.
Setup puts required Activity hooks first, followed by optional Automatic labels
and Project instructions. Details and diagnostics are collapsed.
**Arrange Navigator** opens the view and explains how to drag its heading above
Codex. Release at the insertion indicator and resize the divider. VS Code remembers
the arrangement. Navigator does not invoke the focus-dependent Move View Up command
or claim that the layout changed.

Navigator's title-bar overflow menu ends its extension actions with **Extension
Settings**, which opens VS Code Settings filtered to Codex Navigator.

Check Status reports the result and next step, with a last-checked time. Delivery
requires a recorded event after installation; trust alone does not prove delivery.
If the saved installation time is missing, collector and hook-file modification
times provide a stable cutoff instead of discarding events at every refresh.

Activity setup has three checks:

1. **Install Hooks** merges UserPromptSubmit, Stop, Interrupt and SessionEnd entries
   into the effective `<CODEX_HOME>/hooks.json` and installs the local collector.
   Existing unrelated hooks are retained, and changed JSON is backed up.
2. **Open Hook Review** launches the installed Codex binary in a terminal with this
   workspace and Codex home. Type `/hooks`, review the four Navigator definitions
   and trust all Navigator hooks. Navigator never writes trust records or bypasses review.
   The terminal runs the CLI bundled with the installed Codex extension, so you
   do not need a separate CLI installation. Wait for Codex to finish starting,
   then enter `/hooks` in its prompt. These entries run the local Navigator
   collector when chats start, finish, stop or close. Trust is tied to the exact
   hook definition; a changed definition needs review again. You can close the
   review terminal afterward. Setup refreshes the trust check automatically.
3. Optionally reload VS Code, send a normal message in a chat, then check setup.
   A fresh collector event confirms delivery. This check does not block Navigator,
   and no synthetic test prompt is submitted.

The page checks for Node.js on PATH, matching collector bytes and hook entries,
Codex-reported enabled/trusted states for each workspace folder, and an event since
installation. Installation alone does not mean trusted; trust alone does not mean
delivery. Unknown APIs, config errors or warnings leave trust unverified.
**Check Status** refreshes these checks; the visible page also polls every five
seconds without replacing unsaved routing fields. A recorded event verifies one
lifecycle delivery, not every hook, every chat, or a successful task result.
The visible Navigator reuses status results for up to 15 seconds; Check Status
forces a fresh check. A quiet chat does not invalidate earlier delivery evidence.
Missing, disabled, changed or untrusted hooks, unavailable Node.js, and unknown
trust status all require setup. Missing event evidence and collector write failures
are shown only as activity diagnostics; neither hides chats. Older dismissal flags
no longer bypass installation and trust checks.

If setup says Node.js needed, install Node.js and restart VS Code. If trust is
unverified, inspect `/hooks` in the provided terminal. If trusted but no event
arrives, reload and start a new turn, then inspect the diagnostics path shown in
setup. Other Codex policy or configuration can disable hooks. Official details:
[Codex hooks](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks).

Choose **Remove Navigator Hooks** and reload to stop collection. Only Navigator's
own definitions are removed; its collector, diagnostics and backups remain local.
Never delete another tool's hook definitions to repair Navigator.

Replacing Repo Companion
------------------------

Navigator uses a new extension identity, settings and helper folder. It does not
import old labels, colours, stars or routing configuration. Remove the old
extension separately. If its patch is still installed, restore Codex through that
release before removing it, or reinstall Codex from VS Code Extensions. Remove
the old helper's marked global instruction block before enabling Navigator
routing. Navigator's setup does not perform this cleanup automatically.

Sidebar layout and ordering
---------------------------

At the default text size, content heights below 180px use the compact grid,
180-339px use two-line columns, and 340px or more use the list. A 12px buffer
around each boundary prevents flicker while resizing. Larger fonts scale these
thresholds proportionally. Width adds
readable columns. Text scales within bounded limits. Names wrap to two lines,
or three in the tall layout, and labels to two lines. Exceptional long text is
clamped with a full tooltip. Actual rendered bounds determine how many complete
entries fit. Very small views can show no entries until enlarged.

Order is Codex's `thread/list` with `sortKey: recency_at`, descending, persisted
VS Code threads only. Up to 200 entries are read across bounded pages. Navigator
preserves the returned order and ties; status, completion, stars and colours do
not rank chats. A cached order survives unavailable reads and reloads; before any
successful native read, the local index seeds entries. A successful native list
also excludes archived chats from later index fallback.

The pointer holds order anywhere in Navigator's webview content, including blank
space and controls. Keyboard focus in the list also holds order. Leaving releases
the latest order. The native VS Code view heading is outside the webview.
Indicators continue to refresh while held. Search covers the bounded cache, not
an exhaustive archive. Search and starred filtering persist within this extension.

Selecting a chat uses `vscode://openai.chatgpt/local/<chat-id>`. This is an existing
Codex URI handler, not a promise of an enduring public API. VS Code may request
confirmation. Unsaved and remote chats are excluded. Automatic tracking of chats
selected through native Codex navigation is not provided.

Chat visibility and selection
-----------------------------

Hide Chat is the last chat context action. Hidden IDs and names are stored in
Navigator global state; Codex conversations remain intact. Restore Hidden Chats
in the title menu supports selecting several chats. Restoring removes the manual
hide flag; it does not bypass the recency filter.

Recent Chats Only defaults on. It uses native recencyAt or a more recent Navigator
selection, never a background update timestamp. Known recency older than 24 hours
is excluded, including starred chats. Unknown timestamps stay visible. Turn the
setting off to browse older chats in the existing bounded history cache.

Each successful Navigator open starts its own linear fade (three minutes by default) using the
hover background mixed with 20% of the chat label colour (theme foreground when
no colour is assigned). It fades only the background, preserves text and icon colours,
and keeps its elapsed time across rerenders and webview restoration. Selecting another chat leaves existing timers running; revisiting a chat refreshes
only its own timer. **Highlight Recently Viewed Chats** defaults on; turn it off
to hide fading backgrounds. **Highlight Only Last Viewed Chat** defaults off;
when enabled, only the latest Navigator visit is highlighted. The master setting
must be on. Both settings apply without reloading and preserve elapsed timers;
neither changes the hover outline. Expired entries are removed on render. These highlights mean
recently viewed through Navigator, not
confirmed currently visible in Codex. Hover uses an inset one-pixel theme outline.

Scope and colours
-----------------

Enable **Automatic labels** in setup, then start a new Codex chat. This installs
its own marked reporting guidance in global Codex instructions and sets
`agentRepositoryLabels` for this VS Code profile. It does not turn on instruction
routing or hooks. Turning it off removes that guidance and ignores later agent
reports while keeping current labels. Existing chats may retain old guidance;
start a new chat after changing setup. Explicit user corrections and optional
Detect Chat Focus remain independent.

Auto follows the newest enabled agent report or explicit user correction. Optional Detect
Chat Focus can recognize clear switches from local user messages, including known
cue typos such as "lelts talk about" and one unambiguous typo in longer names.
Quoted examples, IDE attachments, incidental mentions and ambiguous names do not
supply a label. Explicit no-write/read-only, AUDIT and DNE requests suppress inferred
metadata updates. Implicit shifts still depend on agent reporting.

Labels replace previous task scope. Related repositories appear only when they
are part of the current task. The active editor, Source Control selection and
chat starting directory do not assign a repository. Keep current labels fixed holds scope fixed;
Clear selects None, suppressing automatic labels. Custom labels can optionally
be associated with an exact repository for routing and colour inheritance.

Multi-repository workspaces default new repository selections to Auto unless
`keepManualLabelsFixed` was explicitly set. Single-repository choices and custom labels
use the fixed-label preference. Automatic colours maximise separation among current
repositories, remain stable when repositories are added, and adjust for theme
contrast. User hex colours remain exact. No colour suppresses automatic colour.
Initial colour assignment waits for Git's startup discovery to finish. Resetting
Navigator regenerates the same defaults for the same repository set, theme type
(light or dark) and custom colour choices. Later repository additions keep existing
assignments; changing that history or opening a different workspace can change
the defaults after a reset.

Activity indicator prototype
----------------------------

Hooks write one bounded status record per chat. UserPromptSubmit records working;
matching Stop or Interrupt records idle; SessionEnd records unknown. Late events
from another turn cannot stop the current spinner. The collector discards prompt
and response text and returns empty JSON without model context or continuations.
Each invocation has a one-second Codex timeout.

With activity enabled, bounded local transcript reads supplement hooks for older
sessions. Explicit lifecycle/tool events can indicate working, approval/input
waiting or a terminal failure. Tool exit codes and prose are not sufficient.
The existing local runtime can also supply status without loading/resuming chats.
Unfamiliar records leave status unknown. Working/waiting observations expire
without fresh evidence. A blue ready dot records a completed turn since opening
through Navigator; native navigation is not tracked reliably.

An active goal also displays one animated circle immediately after its goal icon,
even between turns. A working turn shares that spinner;
pausing the goal removes it only when the chat is not working. When a goal and another activity indicator appear together, the chat title uses
one line with an ellipsis so the indicators do not add another text row. The full
title stays in its tooltip. Status dots retain their existing meanings. The goal-only spinner is labelled "Goal running".

Goal status is separate from turn activity. Persisted goal reads expose objective,
status and usage for visible chats. Goal clicks request a status-only change through
the runtime that owns the loaded chat, with stale-state checks. If unavailable,
Navigator opens the chat for native control. Viewing makes no AI calls; resuming
a goal can continue normal work and model usage.

Project instruction routing
---------------------------

Setup can use project instructions alone or an optional shared file. Workspace
folders are followed automatically; Advanced options allow custom scopes and
extra instruction filenames. Scoped conflicts fail clearly rather than selecting
an arbitrary file. The helper reports applicable paths; paths returned are not
proof the agent read them. Shared rules are read before project and nested rules.

**Save Project Instructions** installs helpers under `<CODEX_HOME>/codex-navigator`
and updates only its marked block in global AGENTS.md, with a backup. It does not
edit shared/project instruction files. Explicit task focus wins over chat labels.
Automatic label reporting has its own setup and marked instruction block. Reports
include only current task Git roots, primary first; discussion-only and
acknowledgement-only switches should report. Explicit no-write restrictions,
missing identity and helper failures must not interrupt the main task.
If upgrading from combined guidance, Save Project Instructions replaces the old
Navigator routing block with routing-only guidance; enable Automatic labels
separately if wanted.

The main agent uses CODEX_THREAD_ID from its environment and must never override
it. The helper verifies local VS Code session identity and rejects subagents.
Routing changes neither working directory nor permissions. Disabled routing skips
the helper and fallback; ordinary Codex instructions still apply. If an enabled
helper is unavailable, its generated fallback.md describes the local saved rules.

Routing adds local discovery checks and relevant instruction text, with no extra
AI calls. It complements Codex's built-in AGENTS.md discovery and cannot guarantee
agent adherence. One extension's license or setup does not change Codex permissions.

Settings and storage
--------------------

Settings use the `codexNavigator` namespace. Common settings include
`agentRepositoryLabels`, `detectChatFocus`, `keepManualLabelsFixed`, `repositoryAliases`, `repositoryColours`,
`instructionRouting`, `mainInstructionsFile`, `instructionScope`,
`instructionFallbackNames`, `hideRedundantRepositoryLabels` and `silentMode`.
Use VS Code Settings for descriptions. Chat labels, stars, modes, colours and
recency IDs and pinned chat identity/title snapshots are saved in extension state. Generated repository colours live in
the local profile. Helper reports, routing configuration, diagnostics and backups
live under `<CODEX_HOME>/codex-navigator`. Custom repository colours use user settings.

There is no migration from the old Repo Companion extension, settings namespace,
helper directory or patch. Disable/remove its hooks separately and restore its
patch before uninstalling that older extension, or reinstall Codex. Remove its marked global instruction block if old routing was enabled. The new
extension does not inspect or alter that installation.

Verification and release
------------------------

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


Licence and transfer
--------------------

The next commercial release offers seven days (168 elapsed hours) starting only
when you choose **Start 7-Day Trial**, or a separate $5 CAD one-time Navigator
purchase with all future updates. Hooks do not start the trial. Context Suite
requires its own purchase. Live checkout and delivery verification are pending.

Open **License** in Navigator's top menu to activate a purchased key, check paid
status or deactivate this installation. Deactivate before moving to another
computer or VS Code profile. Multiple workspace windows in the same local profile
share one installation. Paid access refreshes daily while running and permits
up to 30 days offline from successful validation, capped by any provider expiry.
Known revocation blocks access; an outage does not extend the deadline.

When access expires, Navigator shows the licence screen and stops its feature
actions and metadata polling. Saved chats, labels, stars, pins and colours remain.
Codex continues independently, including running goals. Settings, licensing and
setup remain available so you can remove Navigator hooks and guidance.

Use **Customer Portal** to remove an unavailable installation. If an interrupted
activation or deactivation leaves recovery pending, confirm removal in Polar
before choosing **Recover Licence**. The same action can replace a damaged or
missing protected record when its local presence marker remains. That recovery
permits paid activation only; it cannot start another trial. An unavailable
keychain or database remains an error and is not overwritten.
Do not retry activation repeatedly after a lost reply;
the first request may have consumed the installation slot. Ordinary Navigator
settings resets do not reset licensing. See [privacy](../PRIVACY.md) for local data.


Pinned chats
------------

Pinned, unstarred chats show the pin directly after the label. Hover or keyboard
focus reveals the star outline after the pin without moving it. When both are
enabled, the order is label, star, pin. Hover or keyboard focus reveals an unpinned
outline; pinned chats always show the icon. Pinning preserves the chat's
list position, not a screen coordinate: resizing can change its row and column.
Other chats retain their normal recency order around pinned positions.

Pins bypass Recent Chats Only and retain saved chat identity/title metadata when
native recent history no longer includes the chat. Up to 200 pins are saved in
`pinnedChats.v1`. The latest available metadata takes precedence over the snapshot.
Filters temporarily compact the list; resizing still shows only what fits. Explicit
Hide Chat still hides a pin, and unpinning restores ordinary ordering and age filtering.
Pinning does not restore a chat deleted in Codex.

**Keep Manual Labels Fixed** replaces Pin Manual Labels and affects label/scope
updates only. It does not pin a chat's position. Existing fixed labels remain fixed;
configure the renamed preference for future manual choices.


Chat and repository menus
-------------------------

Right-click a chat (or use Shift+F10/Menu) for VS Code's native context menu.
It can extend beyond Navigator and uses VS Code's own placement, scrolling and
keyboard navigation. Custom Label, Chat Colour and automatic/fixed label options
remain available; Hide Chat stays last. Choose Repository opens a searchable
picker containing every local Git repository open in the workspace, including
nested repositories. The action targets the captured chat, independently of
which Codex chat is visible. Repository names are no longer listed directly in
the menu: the supported native menu contributions have static command titles.
See [VS Code webview context menus](https://code.visualstudio.com/api/extension-guides/webview#context-menus).

Rename Chat saves a Navigator-only name for that chat ID in this VS Code profile.
It does not change the Codex title or repository label. Original Chat Name opens
the current Codex title, which also appears in the rename dialog and hover tooltip.
Search matches either name. Use Codex Name (or a blank rename) removes the override.
The native menu cannot put a different title directly in its text for each chat.

Associate Custom Label with Repository is available only for custom text labels.
It preserves that text while linking it to a repository for routing and inherited
colour. Ordinary repository assignment does not require a custom label.

Open **Repository Colours** from Navigator's top overflow menu. It replaces the
chat contents with repository names. Click a name to open its colour picker directly.
Right-click also offers Change Colour.
Click a swatch once to preview; click the same colour again to apply and return
to the list. Changing colour or editing its value resets this confirmation. Apply
and Cancel remain available. Palette controls sit directly below a regular swatch
grid instead of stretching to the bottom of the panel. Apply or Cancel returns to this list. Back returns to chats. The list follows
workspace repository changes, and names use their current resolved colours.

Automatic labels require agent reports or the optional Detect Chat Focus fallback.
Enable Automatic labels in setup to install reporting guidance and its helper,
then start a fresh chat. An empty global instructions file has no such guidance;
hooks report activity and do not report repository scope. Reporting is best effort,
respects fixed labels and explicit no-write requests, and never uses unrelated
editor tabs to guess the task repository.
