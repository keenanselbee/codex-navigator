Codex Account Switching Plan
============================

Status: local test versions delivered; owner approved a committed production
Desktop package, version 1.7.7 (2026-09-29). Real owner-account sign-in and IDE
adoption are not claimed by the synthetic acceptance checks.

The approved 1.7.7 follow-up removes the Account management section without
relocating its actions. It recognises Codex plan variants and retains known
plan metadata independently of optional quota reads. Codex's `prolite` value
displays as Pro 5x and `pro` as Pro 20x. New bounded plan identifiers survive
metadata parsing and display directly without guessing a tier.
Cached identity metadata is not billing verification. Label mappings follow
[official pricing](https://learn.chatgpt.com/docs/pricing) and the installed
Codex billing implementation inspected on 2026-09-29; no runtime scraping or
quota-based subscription inference is used.

Approved account grid follow-up: 1.7.6
------------------------------------

The owner approved the neutral chat-sized account grid mockup. It replaces the
popover: the account icon changes Navigator's main page, a saved tile switches
and reloads, and the last tile adds an account through native sign-in. Headings
default to email and plan; right-click Change Label replaces only the display
email, and clearing the label restores it. Native hover text contains the full
identity, last known quota, reset times, banked resets and freshness.

Metadata comes from bounded sequential native app-server reads in an isolated
ephemeral home using external access tokens. The helper receives no refresh token
and cannot change the active credential file. Cached snapshots survive restart;
expired access or unsupported metadata leaves the last known values with their
timestamp. Closing the page, switching or disabling cancels optional queries.
No reset credits are consumed. Native account switching and reload safeguards
remain in place. The implementation is an uncommitted test candidate; the older
1.7.5 popup description below records that immutable package's design.

Account UX follow-up from reference research
-------------------------------------------

Status: implemented for the uncommitted 1.7.5 test candidate. The 1.7.4 package
retains its original behavior. Windows fixture acceptance, exact-package
installation/reinstallation and Desktop delivery pass. Owner-account acceptance
remains a separate manual check.
The user rejects the routine Confirm Account and Restore Previous Account rows
and wants an account-specific menu instead of VS Code Quick Pick. "Add value"
means overall customer value, not specifically usage counters. This follow-up
supersedes the proposed routine manual-confirmation UX below; it does not make
the private IDE runtime observable or change the evidence for shipped test code.

### Reference findings

Read-only source inspection covered the locally supplied nested checkouts:
`Z:\Downloads\codex-switch-master\codex-switch-master` and
`Z:\Downloads\codex-switcher-main\codex-switcher-main`. Neither reference was
executed. These observations describe code, not successful native acceptance.

- Codex Switch preserves outgoing live credentials, writes the selected saved
  credentials, and optionally restarts the extension host with a window-reload
  fallback. Restart is configurable and defaults off. Sources:
  `src/auth/profile-state-service.ts:256`,
  `src/commands/profile-command-registry.ts:60`, and
  `src/utils/vscode-restart.ts:8`. Its account selector is itself Quick Pick;
  its presentation is not the desired Navigator experience.
- Codex Switch watches auth-file changes with a debounce and preserves changed
  tokens for matching identities. Its temporary-home usage query reads refreshed
  auth after the helper process stops. Sources:
  `src/auth/profile-auth-sync-service.ts:149` and
  `src/auth/profile-rate-limit-service.ts:1028`. Useful ideas are prompt capture,
  identity-aware reconciliation and retaining the final credential generation.
  Its missing-auth reconciliation can republish a saved login; Navigator should
  continue treating a deliberate sign-out as a sign-out.
- Codex Switcher preserves outgoing credentials, refreshes a target when needed,
  and writes it to Codex's auth file without opening a browser. It blocks while
  Codex processes run; desktop close/reopen is separate. Sources:
  `src-tauri/src/commands/account.rs:141` and
  `src-tauri/src/auth/token_refresh.rs:289`.
- Codex Switcher's tray offers compact account rows, an active marker, plan and
  asynchronous usage details (`src/TrayMenu.tsx:401`). Its saved credentials use
  a JSON file rather than VS Code SecretStorage, and it implements OAuth and
  token refresh itself. Adopt interaction ideas, retaining Navigator's storage,
  native Codex login and atomic publication. Do not adopt process killing.
- Neither inspected login implementation supplies an email hint to browser
  login. Switcher's account name is local metadata, not a login-field value
  (`src-tauri/src/auth/oauth_server.rs:50`). The official
  [app-server login documentation](https://learn.chatgpt.com/docs/app-server)
  does not document an email/login_hint parameter. Do not promise prefill or
  modify opaque authorization URLs based on an unverified assumption.

### Proposed interaction

Keep the account icon beside Search and New Chat. Clicking it opens a compact
account menu at the top-right of Navigator's existing webview. This avoids Quick
Pick and a new editor tab. The native title-bar button does not provide a DOM
anchor to the webview; positioning is within Navigator's content, below the
title bar. Prototype narrow/short views before committing to geometry.

The menu contains saved accounts with a friendly name, email/workspace subtitle,
a Selected marker, and Add Account. A per-account secondary menu contains Rename,
Sign In Again and Forget. Escape/outside click close it; keyboard navigation and
focus return are required. Only account metadata enters the webview. Existing
chat context menus remain native. The architecture document's prohibition of
HTML context-menu overlays needs a narrow account-menu exception when implemented.

Selecting an account means Switch and Reload, stated in the menu. No browser is
needed when the saved sign-in is usable. Preserve and check credentials, publish
them, reload once, then automatically reconcile the selected credential identity.
Remove routine Confirm Account and Restore Previous Account entries. Transaction
state becomes internal crash/reload recovery, not an indefinite user-confirmation
queue. Use Selected rather than claiming the private IDE runtime is verified.
Show an actionable account error only when a check fails; recovery belongs there.

If reauthentication is required, retain the requested switch intent. Show the
expected email/workspace and offer Copy Email alongside native browser login.
After a matching login succeeds, securely save it and continue the original
switch/reload without requiring the user to select it again. Cancellation or
wrong-account login must preserve the existing active credentials. Add Account
should be a clearly labelled Sign In and Switch flow; automatic capture of an
ordinary Codex sign-in remains available after opt-in.

Keep the reload consequence clear. Ask only when known active work or a shared
environment requires a decision. Missing activity evidence is not proof of idle
clients: explain the shared-home scope once at setup and retain a conservative
fallback when work status is unavailable. Do not automatically switch accounts
because a usage limit is reached or forcibly stop unrelated clients.

### Implementation priorities and acceptance

1. Add the account menu and replace Quick Pick account management. Validate
   account IDs/generations in the extension host, recheck consent/access at every
   mutation, escape metadata and support accessible keyboard/focus behavior.
2. Preserve token updates promptly with a debounced auth watcher plus bounded
   reconciliation fallback. Keep identity/workspace matching, exclusions,
   SecretStorage, cross-window leases and atomic drift-checked replacement.
   Capture again before publication; do not overwrite newer live credentials.
   Avoid concurrent refreshers for the same token bundle. Investigate forcing
   refresh on every selection versus checking only when needed; an expiry hint
   alone cannot prove that a server still accepts the session.
3. Complete refresh-helper shutdown before final auth capture and cleanup, while
   preserving rotated credentials even when a later request fails. Keep the
   selected credential generation consistent across failed/aborted operations.
4. Replace manual-confirmation state with restart reconciliation and error-only
   recovery, including migration of existing pending switches. Do not silently
   reapply credentials after sign-out or label file identity as live verification.
5. Continue a requested switch after successful reauthentication; test wrong
   account/workspace, cancellation, timeout, failed secure save and reload failure.
6. Verify repeated A-B-A switches and token rotation with the real installed
   Codex extension, including two Navigator windows and restart persistence.
   Retain full window reload first; evaluate the reference's lighter extension
   host restart separately before claiming equivalent account adoption.

Customer value comes first from reliable switching in the same place as chats,
automatic remembering, clear personal/work identity, and useful recovery without
manual file management. Cached plan/remaining-limit/reset information could be
a later compact enhancement using native account/rateLimits/read, with freshness
and unavailable states. It must not add a competing refresh loop or delay menu
opening. Automatic account cycling, a second dashboard and custom OAuth handling
are not needed for the useful first version.

Changes remain uncommitted until user testing. Prior Desktop test archives remain
unchanged. The implemented first version retains native preflight for previously
saved inactive accounts, skips it after a fresh native login, and keeps full window
reload. Selected accounts are not redundantly refreshed by clicking them.
Known activity prompts again; shared-home uncertainty is explained once and in
the menu. Usage counters and a lighter host restart remain deferred.


Approved test-build adjustment
------------------------------

The installed Codex IDE extension owns a private stdio runtime and exposes no
supported account-verification API. The user explicitly selected **Switch
Account and Reload; verify in Codex**. This supersedes the automatic runtime
verification gates in the original design below for this test build.

Implemented: opt-in credential-file capture into VS Code SecretStorage,
home-scoped metadata and cross-window leases, native toolbar picker, isolated
browser login, file replacement with drift checks, reload, pending manual
confirmation, guarded recovery, rename and forget. Repeated identical captures
do not invalidate picker selections; valid older refresh timestamps cannot
replace newer saved bundles. Forgotten identities stay excluded.

The adapter reads effective config and authentication requirements through the
native Codex binary. Only file-backed ChatGPT credentials are supported; auto,
keyring, ephemeral, remote environments and custom authentication endpoints
remain unavailable. Add Account is unavailable under managed requirements or
forced workspace policy until isolated policy inheritance is verified.
Credential capture establishes identity hints, not successful authentication.
Activity indicators cannot prove all shared clients are idle; switching asks
the user to stop their work before reloading.

Windows native synthetic-runtime replacement/restart behavior and real VS Code
SecretStorage persistence are covered by the acceptance work. Owner-account
OAuth and live IDE adoption require manual testing. macOS and Linux use portable
code but have no native account-switch acceptance evidence. The original design
below remains the longer-term target where it exceeds this test-build scope.
Prepared: 2026-09-28 (America/Los_Angeles).
Target: local Windows first, with best-effort native macOS and Linux support.
The plan alone does not authorize actions; the subsequent user request authorizes
implementation and a Desktop test package, not installation or publication.


Outcome and product boundary
----------------------------

After one optional setup choice, Navigator remembers successful Codex sign-ins
on this device, keeps their credentials current, and offers an account picker
beside Search and New Chat. Routine capture and refresh require no extra prompts.
The user always chooses when to add, switch or forget an account.

Accounts are separate from Chat Profiles, repository labels and the Navigator
licence. Switching changes authentication for the resolved Codex home. It does
not assign accounts to individual chats, migrate conversations, isolate existing
history or grant another subscription's capabilities. Opening or continuing a
chat after a switch uses the account adopted by that runtime.

The existing spinner improvements remain a separate change. Their absence of a
working indicator is never evidence that an account switch cannot interrupt work.


Baseline and backup
-------------------

The public checkout is based on c708bf3, with the subsequent uncommitted activity
recovery work preserved. Before this plan was written, 113 public source and
supporting files were backed up and verified by SHA-256 under:

    .codex-temp/navigator-before-accounts-20260929T000024Z/

The backup contains files/, manifest.json and working-tree.patch. It preserves
current working bytes, including the uncommitted spinner changes. It excludes
the independent private checkout, credentials, dependencies and release archives.
It is an ignored temporary recovery snapshot, not an off-device backup.

Before restoring anything, inspect the manifest and compare the current working
tree. Restore only explicitly selected paths; do not overwrite later user work.
The new plan itself was created after the snapshot.


Proposed customer experience
----------------------------

### Setup

Add an optional Account switching section after Activity hooks. Existing hook
admission remains unchanged; account setup must never block access to chats.

Primary action: Enable Account Switching.
Description: "Remember Codex accounts on this device so you can switch quickly.
Navigator securely saves your current sign-in and future sign-ins."
Supporting explanation: saves reusable login credentials, not the password;
affects the Codex environment shared by compatible local windows.

Enabling is a deliberate local choice scoped to the resolved Codex home and
installation. Do not enable it through synced workspace settings or repository
configuration. After successful storage and runtime checks, capture the current
signed-in account automatically. If signed out, show "Ready - sign in to Codex
to remember an account." Do not start a login merely because setup was enabled.

Show compact states: Off, Checking, Ready, Sign in to Codex, Storage unavailable,
Unsupported authentication, and Needs attention. Put technical paths and storage
diagnostics behind Details.

Turning off stops future capture, refresh watchers and switching actions, but
retains saved accounts. Provide a separate Forget Saved Accounts action. Explain
the distinction beside these controls.

### Toolbar and account picker

Use a native view-title account icon at navigation@3, to the right of Search
(navigation@1) and New Chat (navigation@2). Use the standard account codicon;
match existing native focus, tooltip and overflow behavior. Show it after opt-in
and normal Navigator admission. Setup remains the entry point while disabled.

Accessible command title: Codex Accounts.
Tooltip: "Codex Accounts - <label>" when verified, otherwise a brief status.
Do not expose an email permanently in the narrow toolbar.

Clicking opens a native Quick Pick:

- Current account, with a checkmark only after runtime adoption is verified.
- Other saved accounts, with friendly label and email/workspace description.
- Add Account...
- Manage Saved Accounts...

Keep account rows stable while the picker is open. Metadata refresh must not
move the keyboard target. Distinguish multiple workspaces belonging to the same
user. An optional friendly name can be edited under Manage; no naming prompt is
required for normal automatic capture.

Manage offers Rename, Forget Account, Forget All Saved Accounts and Open Setup.
Forgetting a saved account removes Navigator's copy; it does not log Codex out.
Keep a non-secret exclusion for the forgotten identity while automatic capture
is enabled, so a watcher does not immediately save it again. Offer Remember
Current Account to clear that exclusion deliberately. Forget All also turns
automatic capture off; explain this in its confirmation.

### Adding an account

Prefer the installed Codex runtime's own browser/device login flow in a
restricted temporary Codex home. Carry only required, verified authentication
policy into that flow; do not copy unrelated user configuration or bypass
administrator restrictions. Do not implement custom OAuth or ask for passwords.

On a confirmed successful sign-in, verify user/workspace identity, save the
bundle, and offer/use the normal switch path. The picker should return with the
new account selected. Whether Add immediately switches or asks "Use this account"
must follow the same interruption rules as selecting an existing account.

Cancellation, timeout, sign-in failure or storage failure leaves the original
active account intact. Dispose the login process and remove temporary credential
files. Clean only paths created by this operation. Do not call logout to clean
a saved session: token revocation could invalidate the remembered login.

If isolated sign-in is incompatible with the installed Codex version or required
policy, report that capability limit. An alternative native sign-in path must
first prove preservation and cancellation behavior; deleting live auth is not
the default fallback.

### Switching an account

Selecting an account initiates the switch. Avoid a confirmation on every idle
switch. If a reload is required, label the action "Switch Account and Reload"
before the user selects it, and explain its scope in setup/picker help.

Known running turns, approvals, pending input and active goals block an automatic
reload or credential change. Offer a clear instruction to finish/pause work and
retry; never abort, pause, resume or retry a chat on the user's behalf.

Unknown runtime/activity state is not idle. Explain that switching cannot be
verified safe. An explicit interruption confirmation is permitted only after
the prototype establishes a supported way to retire the affected runtime;
otherwise keep switching unavailable. Never schedule an unexpected later switch
when a chat becomes idle.

A window using the same Codex home can share credentials with other windows and
CLI clients. Do not claim that reloading one window updates all processes. The
prototype must define coordination and the supported boundary for these clients.

Show Switching, Reload required, Verifying account, Sign-in required or Failed
as appropriate. Update the current-account checkmark only after actual adoption.
A successful file write alone is not a completed switch.


Authentication capability prototype
-----------------------------------

Complete this before building the full feature UI. Use disposable homes, mock
credentials for failure tests, and explicit owner participation for real sign-in
tests. Do not inspect or mutate the owner's current credentials merely to plan.

Establish and document:

1. How the installed Codex extension resolves its native runtime, Codex home,
   authentication backend and enforced login/workspace policy.
2. Whether a supported command or connection can change the authentication of
   the runtime that owns the visible chats and report its resulting identity.
3. Whether a running runtime notices externally replaced file credentials, at
   what boundary, and whether old processes can overwrite them afterward.
4. Whether extension-host restart or window reload reliably retires that runtime
   on each tested platform. Do not assume a managed server dies with its client.
5. Whether account/read on that actual runtime can verify adoption without
   unnecessary refresh. A newly spawned helper's identity is insufficient proof.
6. Whether isolated native login returns a persistable supported credential
   bundle and obeys the same authentication requirements.
7. What happens with two VS Code windows and a CLI sharing the same home,
   including token refresh during switching and a blocked or unavailable peer.

Prefer a supported runtime switch if it exists and meets these requirements.
Otherwise implement Switch and Reload only for combinations with evidence of
safe retirement, replacement and adoption. If neither works, stop the switching
implementation at a documented capability blocker; do not patch Codex bundles.

OpenAI's app-server documents account/read and login flows. Externally managed
ChatGPT token mode is experimental and makes the host responsible for token
refresh; it is not assumed to be a drop-in switch for the existing IDE runtime.


Credential capture and storage
------------------------------

Keep secret material exclusively in VS Code SecretStorage, with separate keys
from Navigator licensing. Store only display metadata, opaque secret references,
home identity, consent, exclusions and coordination state in ordinary storage.
Do not use chat-profile copy/export/recovery paths for accounts.

Verify persistence across a real VS Code restart before marking storage ready.
If secure storage is inaccessible, fail closed without replacing it with plain
files or deleting remembered accounts. Existing private licence storage can
inform test cases, but must not be repurposed or weakened for this public feature.

After opt-in, capture on initial readiness, confirmed sign-in and debounced
credential changes. Parse complete bounded records only. Ignore transient
partial writes and retry briefly. Missing live credentials indicate signed out;
never silently restore a saved account because a watcher saw deletion.

Only preserve credentials when user and workspace identity match unambiguously.
Use stable identity fields, not display names or email alone. Reject ambiguous
merges and stale captures. JWT claims can supply display/matching hints but are
not themselves proof that the runtime successfully authenticated.

Capture successful token rotation before switching away, and ensure an older
capture cannot overwrite a newer saved generation. A refreshed access token does
not by itself prove refresh-token validity. Let Codex own refresh and classify
revoked/expired saved sessions as requiring sign-in.

Bound saved accounts and auth payload size (initial proposal: 20 accounts and
1 MiB per bundle). Validate against native fixtures before finalizing limits.
Persist schema versions, keep unknown supported auth fields when restoring,
and reject unsupported auth modes instead of reconstructing guessed credentials.

Credential payloads, tokens and raw auth errors must never enter a webview,
logs, settings sync, diagnostics, source backup, chat metadata, exported state
or licensing traffic. Extension-host commands accept opaque saved-account IDs,
re-resolve them, and recheck consent, trust, admission and capabilities.


Switch transaction and concurrency
----------------------------------

Model switching explicitly:

    idle -> preflight -> preserve outgoing -> apply -> adopt -> verify -> idle
                                                 -> recover / needs attention

Use one coordinator per canonical Codex home across Navigator windows. A lock
protects Navigator operations only; it cannot prevent native Codex or an
uncoordinated CLI from refreshing credentials. Runtime retirement and external
drift checks are therefore part of the design, not replaced by the lock.

- Capture the selected account ID and generation, home, runtime capability,
  current verified identity and auth fingerprint before the operation.
- Acquire a bounded cross-window lease; reject concurrent switches and ensure
  crash recovery does not remove a live peer's lease.
- Recheck consent, secure storage, login restrictions, activity and credential
  generation immediately before mutation. Ignore stale picker actions.
- Preserve the current valid credentials in SecretStorage. Refuse to discard
  an unsaved live account if preservation fails.
- Apply through the proven backend adapter. For file mode, stage a restricted
  same-directory file, validate it, then use verified atomic replacement with
  bounded retry. Do not use a non-atomic copy fallback.
- Coordinate retirement/reload in the order proven by the prototype. Stop
  Navigator's metadata clients so they cannot race the handoff. Account-changing
  writes must never reuse a helper that does not own the intended runtime.
- Record a pending transaction without secrets, survive reload, verify the
  actual runtime identity, then mark the new account current.
- On failure, restore the prior state only when the transaction still owns
  the credential generation. Never overwrite an intervening external login.
  Otherwise present a recoverable Needs attention state with sign-in guidance.
- Do not repeat login or switch mutations automatically after an ambiguous
  result. Reconcile the observed runtime/file state first.

Test file permissions/ACL inheritance and replacement semantics on Windows;
POSIX mode bits alone do not establish Windows protection. Keep pending rollback
credentials in secure storage, not plaintext backup files. Do not promise a
filesystem rollback can undo server-side token rotation.


Platform scope
--------------

| Environment | Planned initial behavior | Evidence required |
| --- | --- | --- |
| Native Windows | Primary tested implementation | Real secure-storage persistence, switch/reload/adoption, replacement failures and two-window tests |
| Native macOS | Best effort using shared code and native adapters | Simulated platform tests; disclose missing native account-switch evidence |
| Native Linux | Best effort with usable secure storage | Simulated tests plus graceful handling of unavailable/locked secret service |
| WSL, SSH, containers, web VS Code | Outside initial scope | Explain unsupported environment; never choose a host-side auth file accidentally |

Codex supports file, keyring, auto and ephemeral credential storage. Detect the
effective backend, including enforced policy; an existing auth.json can be stale
while keyring is authoritative. Do not silently change storage settings or
downgrade a user's keyring to plaintext.

File mode is the simplest adapter but ships only after the runtime handoff is
verified. Keyring/auto require a supported Codex-owned read/apply path; do not
scrape platform vaults or assume Navigator SecretStorage is Codex's keyring.
If that path is unavailable, disable capture/switching with a precise reason.
Ephemeral mode cannot promise remembered sign-ins without a supported export
contract and is outside the first working slice.

Native OS support and credential-backend support are separate capabilities.
Best effort means portable implementation and honest diagnostics, not claiming
untested switching works. Preserve one universal production VSIX.


Implementation map
------------------

Start with small modules and only split further when complexity requires it:

- src/accounts.ts: lifecycle, consent, capture, identity matching and switch
  orchestration; framework-independent logic with injectable dependencies.
- src/account-store.ts: SecretStorage bridge, non-secret catalog, schema,
  generation checks, exclusions and cross-window coordination.
- src/account-runtime.ts: capability discovery and supported native adapters;
  isolated login, runtime handoff and identity verification.
- src/account-picker.ts: native account/manage pickers and safe action capture.
- src/setup-page.ts and media/setup.html/js/css: optional setup section and
  status; no secrets or credential-shaped messages in the webview.
- src/extension.ts: admission, activation/disposal and account command wiring.
- package.json: account commands and view-title navigation@3 contribution.
- tests/: unit, platform, failure/concurrency and isolated VS Code fixtures.
- README.md, docs/advanced.md, docs/architecture.md and PRIVACY.md: behavior,
  scope, storage, removal, limitations and network disclosure when implemented.

Do not put credentials in src/chat-profiles.ts or modify the private licence
repository for this feature. Keep normal Navigator admission enforced in both
host commands and UI. Expiry stops account automation and mutations without
signing Codex out. Forgetting stored credentials must remain available even if
Navigator admission expires.

The setup action adds a third optional feature; update tests that assume exactly
two optional sections. Preserve the existing activity, labels and routing flows.


Delivery phases and exit criteria
---------------------------------

1. Capability prototype: record the supported backend/runtime matrix and the
   proven handoff sequence. Exit only with an adopt-and-verify path, or report
   the blocker before creating a misleading switch UI.
2. Secure remembering: implement opt-in, persistence checks, identity matching,
   refresh capture, exclusions and forgetting. No auth changes on startup.
3. Explicit switching: implement coordination, transaction recovery and verified
   runtime adoption. Exercise two windows before adding convenience automation.
4. UX integration: setup section, toolbar icon, native picker and isolated Add
   Account. Successful login is automatically remembered; cancellation is safe.
5. Cross-platform hardening and release verification: run the matrix below,
   document actual platform evidence and prepare a separately approved release.

Do not add automatic quota-based rotation, background quota polling, bulk
account import/export, account sharing, custom OAuth, per-chat credentials,
automatic repository-account assignment or changes to Navigator licence policy.


Verification matrix
-------------------

| Area | Required cases |
| --- | --- |
| Opt-in | Off causes no credential reads/writes; existing login captured once after enabling; disabled state propagates to peers |
| Automatic capture | Native login, refresh, partial writes, rename events, duplicate events, stale generation, deletion/sign-out |
| Identity | Same email with different workspace, different users in one organization, missing/ambiguous claims, unsupported auth payload |
| Secure storage | Restart persistence, missing/locked keychain, damaged secret, unavailable service; no plaintext fallback |
| Picker | Search/New/Account order, keyboard and screen-reader labels, narrow overflow, current checkmark, stable selection |
| Add Account | Success, cancellation, timeout, network failure, enforced policy, storage failure, temporary-data cleanup |
| Switch | Same account no-op, idle switch, running/waiting/goal states, unknown activity, expired/revoked target, offline verification |
| Concurrency | Two windows switch at once, external login during switch, native token rotation, lost lease, crash at each mutation boundary |
| Recovery | Locked auth file, failed rename, interrupted reload, runtime survives reload, adoption mismatch, rollback conflict |
| Forget/disable | Forgotten current login stays signed in and is not recaptured; Forget All turns capture off; licence expiry still permits forgetting |
| Isolation | No changes to chat profiles, history, labels, hooks, routing, subscription entitlements or licence state |
| Platforms | Windows native tests; path case/quoting/permissions and backend capability simulations on macOS/Linux |
| Release | Public-only tests, missing-private guard, commercial regression, isolated UI/restart/two-window tests, archive and exact-install checks |

Use synthetic credentials for automated tests and redact all diagnostics.
Authenticated end-to-end acceptance requires owner-controlled test accounts and
explicit permission for the concrete sign-in/switch operation. Do not claim that
mock app-server responses prove adoption by the actual installed Codex extension.

Use the repository's existing npm scripts. Add focused tests for new behavior
and failure boundaries; avoid extending production permissions for fixtures.
Release validation follows docs/marketplace-release.md and the shared versioning
policy: a new payload needs a new version, reviewed committed inputs, immutable
VSIX/receipt, and separate installation/publication authorization.


Research and open decisions
---------------------------

Research reference: downloaded codex-switch 1.4.4, inspected statically only.
It saves credential bundles, watches for refreshes, writes the selected live
auth file, and optionally restarts the extension host or reloads the window.
Its remote store, quota polling and broad environment management are outside
this plan. Independently author Navigator's implementation; no reference source
or dependency is copied into the production application.

Open decisions resolved by the prototype:

- Supported live-switch API versus verified runtime retirement and reload.
- File/keyring/auto backend capabilities of the installed Codex version.
- Shared-home handling when other windows or CLI clients cannot be coordinated.
- How to observe successful native login without triggering refresh mutations.
- Exact account-capacity and payload limits based on valid native fixtures.

Already selected UX direction: optional setup, automatic remembering after
consent, explicit switching through a toolbar account picker, Windows primary
and best-effort native macOS/Linux. Full implementation and release readiness
remain unverified.

References:

- [codex-switch source](https://github.com/WoozyMasta/codex-switch)
- [OpenAI authentication and storage](https://learn.chatgpt.com/docs/auth)
- [OpenAI app-server authentication](https://learn.chatgpt.com/docs/app-server)
- [Navigator architecture](architecture.md)
- [Platform support boundary](platform-support-goal.md)
- [Release workflow](marketplace-release.md)
- [Privacy](../PRIVACY.md)


1.7.4 recovery correction
-------------------------

Owner testing of 1.7.3 found an invalidated saved refresh token after reload and
an unconfirmed pending switch that blocked another attempt behind a generic
error. The local Codex log reports HTTP 401 and refresh_token_invalidated just
after the switch; it does not establish what originally invalidated the token.

Before selecting a saved file, 1.7.4 performs native account/read with
refreshToken=true in an isolated home, preserving any rotated tokens securely.
A failed check leaves the active file unchanged; invalid sign-ins offer browser
reauthentication. Another explicit checked switch can replace an unconfirmed
pending operation. Safe authored errors reach the UI; raw diagnostics do not.
This verifies the saved sign-in before replacement, not the private IDE runtime
after reload. Manual confirmation in Codex remains necessary.


1.7.5 account menu delivery
--------------------------

Delivered an uncommitted test VSIX, receipt, test notes and verification JSON to
the Desktop. SHA-256:
6e8dd418bb52b22e5566bbbbca38e640c91adf05064efa385da78894cbdc579e.
The prior manual-confirmation UI is removed in this version. Post-reload
credential reconciliation, error-only recovery and continuation after a matching
native login are implemented. Unexpected sign-in changes retain recovery data;
disabled/forgotten accounts cannot be published by an overlapping switch.

204 public tests and the missing-private guard pass in public-only-ibw4B3;
24 commercial tests pass with the private checkout unchanged. Real VS Code
initial/restart/second-window integration passes in integration-OtPUeO, including
the actual account webview with synthetic metadata. The exact archive passes
installation and reinstallation in installed-acceptance-abLJTX (63 payload
hashes plus manifest; 66 archive entries). No normal-profile installation,
live owner-account changes, commits or pushes occurred. Owner-account testing
remains pending. This delivery record is excluded from the packaged payload.
