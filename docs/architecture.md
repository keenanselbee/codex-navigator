Architecture
============

Codex Navigator is a local desktop VS Code extension. Windows x64 is tested;
macOS/Linux and ARM64 support are best effort pending native verification.
Its own webview renders
chat cards, a colour picker, stars, lifecycle indicators and goal controls.
VS Code owns the view container, native context menus, keyboard focus and theme
tokens. Chat and repository elements carry validated context data; contributed
menu commands receive the clicked identity. Dynamic repository choices use a
searchable picker. Accounts replace Navigator's main content with a compact
neutral grid, using the chat layout sizing rules. An account-only context menu
offers label and management actions. Messages contain metadata and validated
action IDs, never credentials. Chat context menus remain native.
No code is injected into Codex, and no Codex or VS Code bundle is modified.

Opening Accounts or choosing Refresh usage starts sequential checks under the
account lease. Successful quota results are cached for five minutes. While the
page is visible, missing usage retries after ten seconds, with increasing delays
up to five minutes. Closing Accounts stops retries and cancels unfinished reads.
An isolated ephemeral helper receives only the access token and workspace ID;
it cannot rotate a refresh token or replace the active auth file. Switching or
closing the page cancels optional reads. The home-scoped catalog retains only
validated plan, quota windows, reset count and observation time. Unknown fields
stay unavailable, and a past reset timestamp is not proof of replenished quota.

Identity and state
------------------

The extension identity is `keenanselbee.codex-navigator`; commands/settings use
`codexNavigator`. Global helper data uses `<CODEX_HOME>/codex-navigator` and its
own global instruction marker. There is no old identity or patch migration.
Existing project URLs may retain their repository slug until the hosting project
is renamed; a display-name change does not silently change a remote repository.

Custom-label colours use trimmed, case-insensitive text keys in the selected chat profile.
Legacy explicit colours seed the shared palette deterministically; conflicting
chat overrides remain explicit. Label edits inherit the destination colour, and
colour edits offer shared-label or chat-only scope. Label colour sharing never
changes repository associations or routing.

Saved chat IDs are validated UUIDs from local metadata. Sidebar actions carry
that exact ID, independent of native Codex selection. Existing editor chat URIs
can identify saved tabs through VS Code's API; generic launchers are never used
as persistent chat identities. Labels never mutate titles, cwd or permissions.

Repository scope uses exact Git roots, including nested repositories. Explicit
user task focus wins; unrelated editor files and SCM selection do not infer scope.
Saved modes are Auto, Pinned and None. An in-flight automatic read cannot overwrite
a newer manual choice. Agent reports are scoped to verified local main-agent
identity and contain roots/IDs/timestamps, not message text.

Metadata reader
---------------

`platform.ts` selects Codex's bundled runtime for the host OS and architecture:
`windows`, `macos` or `linux`, with `x86_64` or `aarch64`. Unsupported hosts do
not fall back to another architecture or a global CLI. Hook setup checks that
the runtime exists and, on Unix, is executable. POSIX helper commands quote
literal paths; Windows retains its existing command format. Hook installation
and trust verification share the same command builder. Path identity folds case
only on Windows, so distinct case-sensitive Unix repositories stay distinct.

`ChatGoals` owns a bounded local `codex app-server --stdio` metadata connection.
It initializes the protocol and reads thread recency, visible goals and setup's
hook definitions/trust. It does not load/resume threads or perform goal writes.
Requests time out; failed reads return unavailable and use bounded retry delays.
`ChatRecency` preserves server order, ties and last known order across outages.
Its bounded shared snapshot also saves titles and recency times for up to 200
chats. Startup publishes this cache merged with the local index before querying
live metadata, scope reports or activity. The cache stores no messages, goals or
activity indicators. A successful native response replaces it, including an empty
list, so known archived chats are not revived. Failed refreshes keep visible chats
actionable. Setup choices remain responsive while metadata is pending.

`RuntimeActivity` can attach to the existing runtime for status and user-triggered
goal changes. Writes require a loaded thread owned by that runtime and a matching
fresh goal snapshot. Only status changes; objective and budget remain unchanged.
Failure opens the chat rather than starting an independent execution runtime.

Activity setup
--------------

`configureActivityHooks` installs a standalone collector and merges only its four
command definitions. It uses an absolute helper/home path, preserves other entries,
backs up changed hooks.json and rejects malformed configuration or concurrent drift.
It never writes hook trust. Codex owns trust for exact definitions.

`hookSetupStatus` distinguishes installed bytes/configuration, Node availability,
Codex enabled/trusted status in each workspace folder, and actual collector events
since installation. Unknown schemas, errors and missing data do not become
trusted. Warnings remain visible in setup diagnostics; exact enabled/trusted
Navigator definitions determine trust independently of unrelated warnings. A local lifecycle event proves delivery, not successful task execution.
Setup starts a visible Codex terminal only after Open Hook Review; the user runs
`/hooks`. Polling stays local and never submits prompts or continues a turn.

The collector writes per-chat records under an exclusive short lock, atomically
replacing bounded JSON. It ignores invalid/stale IDs and delayed other-turn events.
Diagnostics rotate at a bounded size and exclude message contents. Status collection
fails open and must never interrupt the user's turn.

Setup webview
-------------

One reusable page puts required activity hooks first, with optional automatic
labels and project instructions. Each shows its next action, with diagnostics
and options under Details. Arrangement instructions appear only after the action.
Initial setup requires installed, enabled and trusted hooks; old dismissal flags
cannot bypass it. Verified browsing completion is saved across workspaces in the local profile store and admits browsing
after restart, independently of current hook trust. Later failures never replace
the chat list or cancel a colour picker. Unknown status retries quietly for 30
seconds before a nonblocking notice; confirmed configuration problems show their
next action immediately. Background checks reuse results for up to 15 seconds,
while explicit setup checks refresh immediately. Completion never grants trust.
Delivery verification and collector failures remain activity diagnostics.
Activation does not show an invitation toast.
Automatic labels have a separate managed global instruction block and an
application-level preference. Disabling reports retains existing assignments;
explicit corrections and focus detection remain independent. It uses a restrictive
CSP, nonce-protected bundled scripts, VS Code theme variables and text rendering.
Message actions are allowlisted; mutations require a trusted local workspace.
Routing saves check revision, configuration drift and global instruction drift.
Activity status refreshes preserve unsaved routing drafts. Installation and removal
are explicit page actions; no automatic patch/restore/update process exists.

Routing
-------

The publisher records bounded local workspace profiles and current known scopes.
Helpers resolve explicit roots before labels, merge applicable shared/project and
nested instructions in order, and reject conflicts. Overrides and fallback filenames
retain their precedence. Disabling routing is explicit and durable. The generated
fallback is consulted only when enabled helper discovery fails.

Routing is a consistency aid over native Codex discovery, not enforcement or proof
that an agent read instructions. Explicit discussion-only focus reports are allowed;
explicit no-write restrictions remain authoritative.

Packaging and licensing
-----------------------

Public code owns presentation and the licensing contract. An independent private
repository at `proprietary/` implements trial/paid policy, protected state, Polar
validation and recovery. `license-service` is the sole composition boundary.
The build requires compatible public and private checkouts and emits one complete
extension. Public-only checks do not load or compile the private implementation.

Licence records use VS Code SecretStorage. A small SQLite database holds only a
presence marker and coordinates transactions between windows using OS locks.
Network requests run outside those transactions. Pending mutations persist before
HTTP; stale replies cannot undo recovery or a later activation. The marker makes
loss of a known protected record an error rather than a new trial.

The host gates commands and metadata reads. Expiry replaces the sidebar with the
licence view, retains saved data and closes Navigator's metadata connections. It
does not pause or interrupt Codex tasks. Setup remains available for removal;
enabling hooks, labels or routing requires access. See the
[commercial access goal](commercial-access-goal.md) for remaining acceptance.

The VSIX includes compiled extension modules, owned media, the standalone collector
and current docs. Patch installers, injected bridge assets and compatibility code
are removed. Tests and scratch artifacts are excluded. Reserved release packages
are immutable. Source availability grants inspection; other rights follow the
[license](../LICENSE.md). Earlier MIT grants are not revoked.


Chat profile persistence
------------------------

`ChatProfiles` stores bounded JSON records in SQLite under globalStorageUri,
partitioned by normalized Codex home. BEGIN IMMEDIATE transactions serialize
writers. Map updates apply only differences from the caller's last snapshot,
preserving unrelated edits/deletions in another window. Host refresh reconciles
live maps while retaining pending local edits. Workspace state stores only the
selected profile ID for this feature; profiles may be shared across windows.

Migration retains each original workspace snapshot, imports disjoint entries to
Default and leaves conflicts recoverable as a separate profile. Old global
organisation is imported only once. Original VS Code records remain untouched.
Custom profiles can store explicit chat selections with identity/title snapshots;
no transcript bodies or live goal state are stored. Default includes bounded
recent history unless the user explicitly chooses a selection.

Profile switching invalidates in-flight scope/row reads and rejects stale webview
profile actions. Switching is deferred while an interactive Navigator action is
open. Routing uses a separate shared scope snapshot: merely hydrating another
profile establishes a comparison baseline, not a new routing instruction.
Explicit scope changes and later automatic reports can still update routing.
The workspace filter uses associated exact roots and includes unassigned chats.

Account storage and runtime boundary
------------------------------------

accounts.ts owns opt-in capture, account-page actions, admission, reload and
selected-credential reconciliation. account-store.ts stores home-scoped metadata in SQLite
and versioned credential bundles in VS Code SecretStorage. Transactions protect
consent epochs, generations, exclusions and a bounded shared switch lease.
account-runtime.ts uses a private Codex stdio helper for effective config and
isolated login, plus bounded file reads and atomic replacement with drift checks.
It does not attach to or claim to verify the IDE's private chat runtime.
The setup webview receives only status and saved-account count, never credentials.
The Accounts page receives bounded non-secret identity, plan and usage metadata.
Plan codes survive independently of quota availability; display labels live in
the account page and unknown codes receive an explicit fallback. Optional native
usage reads never refresh credentials or replace the live sign-in.
