Verification
============

Current candidate: Codex Navigator 1.7.8. This is a fresh extension identity with no
migration or backward compatibility for Repo Companion or its former patch.
Earlier development records and immutable packages remain local; the changelog
retains release history. Old patch checks are not evidence for this product.

Toolbar acceptance: 1.7.8
------------------------

All 220 public tests and the missing-private guard pass in public-only-a55maA;
all 24 commercial tests pass. Real isolated VS Code initial/restart/second-window
checks pass in integration-hbcbyK. The private checkout remains unchanged.

The isolated toolbar-smoke-uPfli3 host verifies the rendered native toolbar order:
Navigator Actions, Search, Accounts. Its new profile has no New Chat button.
Changing showNewChatButton to true immediately adds it between Search and Accounts;
changing it back removes it without reloading. The setting is scoped to that
disposable profile. Synthetic clicks and renderer inspection did not establish
popup appearance; the Computer Use native helper was unavailable, so native
popup appearance remains unverified. The menu uses the supported view/title
submenu contribution and retains the existing command handlers.

Version 1.7.7 was packaged before this toolbar follow-up and remains reserved;
the final Desktop release is 1.7.8. The exact production archive passes installed
and reinstalled acceptance in installed-acceptance-l7YnD8: 65 file hashes and
the manifest match, with expired trial state preserved. All 68 archive entries
match the allowlist. Desktop copies of the archive, receipt, notes and verification
JSON match their sources. The disposable installation was removed, and the normal
profile was unchanged. No Git push or Marketplace upload was performed.

Plan metadata and simplified account page: 1.7.7
----------------------------------------------

All 220 public tests and the missing-private guard pass in public-only-erg4mn.
All 24 commercial tests pass with the private checkout unchanged. Regression
checks cover separate plan persistence, Pro variants and bounded future codes,
stale generations, unchanged credential recapture, and failed quota reads
preserving the last quota snapshot and timestamp. No real authentication service
or owner credential was changed by these checks.

Real isolated VS Code initial/restart/second-window checks pass in
integration-VWqI0n. The actual account webview verifies Pro 5x, Pro 20x, Plus and
direct display of an unfamiliar plan code, removal of Account management,
switch/Add/rename actions and the existing small-panel layouts. An earlier run,
integration-iE1ynt, failed the existing keyboard-focus resize assertion before
the account checks; the unchanged retry integration-OUG1OI passed. The final run
above includes the subsequent direct-code fallback and plan freshness fixes.

The read-only review found no additional release blocker or private-source
packaging leak. Whitespace and changed-document local links pass. Production
packaging and exact-archive installed acceptance follow the reviewed public
commit. Real owner-account adoption and macOS/Linux retain the limits below.

Account grid acceptance: 1.7.6
-----------------------------

All 216 public tests and the missing-private guard pass in public-only-LJ46Yf.
All 24 commercial tests pass with the private checkout unchanged. New checks
cover sanitized persistent quota caches, stale generations, removal, clearing
custom labels, failed metadata reads and cancellation before switching. Usage
helper fixtures prove that no refresh token is passed, that external-token
refresh requests fail safely, and that cleanup follows helper shutdown.

Real isolated VS Code initial/restart and existing second-window checks pass in
integration-beJ1CR. The actual webview is exercised with synthetic account data:
page navigation, direct switch dispatch, final Add tile, right-click label edit,
blank-label reset, literal metadata, quota/reset tooltips, native-second reset
timestamps, cancellation and recovery. CSS sizing fixtures cover 600x120,
600x168 and 320x240, including context bounds and visible recovery at 120px high.
Earlier development runs exposed welcome-page navigation and hidden feedback;
those were corrected before this passing run. Pixel-perfect native menus and
real owner-account adoption are not claimed by synthetic event checks.

The installed Codex binary's generated experimental protocol schema confirms
the external-token login, quota response and optional banked-reset fields used
here. No real credentials or account service were queried for this inspection.
Windows is the verified test host; macOS/Linux remain best effort.

The immutable test archive receives separate exact-package installation and
reinstallation checks before Desktop delivery. The adjacent Desktop verification
receipt records that result and the final archive hash. No commits are required
or performed for this local test delivery.

Automated checks
----------------

- Account switching: 182 public tests pass in public-only-6vQkt5, including
  opt-in capture, stable generations, retired-secret cleanup, identity guards,
  lease contention, cancellation, bounded atomic replacement, write drift,
  locked-file retry, pending confirmation and recovery. All 24 commercial tests
  pass with the private checkout unchanged. The public-only full build rejects
  the missing private implementation.
- Isolated VS Code 1.137.0 initial/restart/second-window integration passes in
  integration-x20l5i. The setup has three optional sections. A synthetic account
  survives actual VS Code SecretStorage and process restart, then Forget All
  removes it. The compaction spinner scenarios still pass. One earlier run
  (integration-5gW3ND) failed the pre-existing resize/focus assertion; the
  unchanged rerun passed. Earlier runs were interrupted by low disk space and
  the user's pause and are not acceptance evidence.
- The native installed Codex binary passed the synthetic-only file/restart probe
  in account-runtime-acceptance-779LpY: the live process retained the first
  synthetic token after replacement; a restarted process read the second.
  This is evidence for requiring reload, not proof of the private IDE runtime's
  live account. The user approved pending manual verification in Codex.
- A disposable package passed 63 archive-entry checks and production-mode
  installation/reinstallation in installed-acceptance-U5wik7, with 60 runtime
  payload hashes and its manifest verified. This 0.0.0 fixture is not a release
  or Desktop install target. Subsequent publication-guard changes pass the
  account tests; the final uncommitted 1.7.3 test archive still requires exact-package
  acceptance before Desktop delivery.
- No real owner credentials were read or replaced by these tests. Native browser
  OAuth completion, real IDE adoption, macOS/Linux and cross-profile coordination
  remain unverified. Account leases coordinate Navigator windows sharing one
  VS Code storage location; unrelated clients can still write their shared auth
  file, so switching requires stopping their work and checking Codex afterward.

- Unreleased compaction recovery recognizes live ContextCompaction, Reasoning
  and CommandExecution item completion events and reads at most 1 MiB per poll.
  A local replay of three real transcript boundaries (12 MB compaction and two
  subsequent large tool results) changed from unknown in installed 1.7.2 to
  working with the correct turn ID. Replay scratch copies were removed.
- All 156 public tests and the missing-private guard passed in
  public-only-bP741N. Isolated VS Code integration passed initial, restart and
  second-window checks in integration-vsScNu, including compaction completion
  before another tool call, large output, and terminal spinner clearing. The
  first attempt, integration-IG7yCS, failed an earlier keyboard-focus assertion;
  the unchanged rerun passed. These improvements are not packaged or installed
  in the normal profile. Missing hooks/live runtime and partially written
  oversized records can still leave temporary gaps in activity evidence.

- Version 1.7.2 fixes the reproduced rotated-transcript lookup failure: the
  installed 1.7.1 reader selected an interrupted original while the current
  suffixed transcript reported working. The updated reader selects the current
  transcript, and follows subsequent rotation after cached reads.
- All 154 public tests and the missing-private guard passed in
  public-only-IqUjuM; all 24 commercial tests passed. Isolated VS Code integration
  passed initial, restart and second-window checks in integration-v8k2Q6.
  A new rotation fixture starts and clears the actual sidebar spinner with no
  live runtime and an older completed transcript. Normal-profile installation
  and repair of the unavailable live connection are not claimed.

- The disposable production package passed all 60 archive-entry checks and
  isolated installation/reinstallation in installed-acceptance-ViNQoe, with
  57 installed file hashes and manifest verification. This fixture uses version
  0.0.0; the final 1.7.2 release archive remains pending the release commit.
- Activity regressions cover an 8 MiB compaction with fresh, missing and expired
  hooks, cold tail reads, resumed tool calls, terminal records, file replacement,
  and partial records after a UTF-8 tail boundary. Newer stop/interruption hooks
  override older working/waiting transcripts without losing same-turn ready dots.
- Activity diagnostics omit content and suppress unchanged snapshots. Runtime
  tests classify a control-socket failure without logging raw stderr and retain
  the existing retry backoff. The original missing-spinner screenshot remains
  unexplained: replay with its fresh hook still selected working. These changes
  fix reproduced weaknesses and provide evidence for any recurrence.
- Version 1.7.1 passed 152 public tests in `public-only-mRM9yK`, the missing-private
  build guard and all 24 commercial tests. Isolated VS Code 1.137 integration
  passed initial, restart and second-window checks in `integration-9cdHmI`.
  The real sidebar recovered after an 8 MiB compaction with an expired hook and
  paused goal, then displayed completion and cleared a later interrupted turn.
  These are synthetic lifecycle fixtures, not a reproduction of the screenshot.
- The exact production 1.7.1 VSIX passed all 60 archive-entry checks and isolated
  installation/reinstallation in `installed-acceptance-nVW0Rs`, including 57
  installed file hashes, manifest verification and trial-expiry persistence.
  The Desktop VSIX and receipt match the verified originals. No normal-profile
  installation, remote push or Marketplace publication was performed.

- Browser inspection confirms that the supplied sandbox portal URL reaches the
  Keenan Selbee customer sign-in page with a sandbox banner. This verifies URL
  reachability only; authenticated purchase access and recovery remain unverified.
- The private split passes 123 public tests in a source snapshot without the
  private checkout and 20 commercial tests in the private repository. Full
  builds reject missing private source even with stale compiled output.
- Isolated VS Code verifies explicit trial start and protected persistence,
  expiry replacing Navigator, host/webview action denial, metadata polling
  shutdown without changing a simulated active Codex goal, and data retention.
  Label and repository pickers opened before expiry cannot apply changes afterward.
  A separate real VS Code process restart preserves the installation ID and
  original trial deadline, refuses another trial and restores chats before live
  metadata. Two simultaneous real windows share the same installation and observe
  expiry and restoration through SecretStorage. The complete run exits cleanly
  after each fixture explicitly closes its own window.
- An actual disposable VSIX installed into an isolated profile passes expiry,
  uninstall, ordinary-settings reset and reinstall checks in Production extension
  mode. The installation ID, original trial start and saved stars survive; another
  trial is refused. Installed file hashes and the manifest (apart from VS Code's
  added installation metadata) match the archive. The fixture removes
  its extension afterward and does not change the normal VS Code installation.
- Private test preparation also verifies a sandbox-configured VSIX through the
  same installed/reset/reinstall workflow. Only the compiled configuration differs
  from normal runtime modules; its receipt records that substitution, source
  revisions/status and archive hashes. Sandbox and production protected records
  remain separate. This check makes no provider requests and does not prove paid
  activation through the licence UI.
- Authenticated Polar sandbox tests pass activation, repeated validation,
  wrong-product denial, second-install refusal, deactivation, rejection of the
  old activation and transfer. The final test activation was released. This tests
  the shipping provider against real customer endpoints, not the complete
  packaged licence UI. Refund/revocation and download delivery remain unverified.
- A follow-up installed sandbox licence-screen test passes real activation,
  paid-state restoration after restarting VS Code, explicit validation and
  deactivation. Deactivation returns to the licence screen with no new trial;
  the test activation was released. The actual webview dispatches the actions,
  while the fixture supplies the masked input value and modal confirmation.
  Native dialog appearance, portal recovery and real Codex activity remain
  outside this check. Owned test files/logs contain no plaintext Navigator key.
- The actual VSIX packager passes a disposable 0.0.0 archive check: all 54 entries
  match expected hashes; private source and source-map sentinels are excluded.
  The installation fixture uses this archive only in its owned profile; it is
  not a release artifact. Production packaging
  requires clean independent Git roots and records both revisions and all hashes.

- Before the private split, layout restoration passed 116 unit tests and the isolated VS Code
  webview reload check. The saved column count and fitted row count survive
  intermediate startup sizes near a layout threshold. This does not test or
  control VS Code's restoration of the outer split-pane divider.

- Unit tests cover scope, routing, colours, history/recency, activity, goal reads
  and controls, helper installation, setup state and license/version packaging.
- The isolated VS Code 1.137 integration covers the owned sidebar, exact chat
  URI dispatch, native-menu context and command dispatch, responsive layouts, colours/stars,
  pointer ordering hold and independence of activity from native recency. Repository-menu checks cover captured-chat picker assignment and colour-page return navigation. Native overlay appearance is not inspected; the fixture supplies picker choices and suppresses the real menu while testing captured context. Pin checks
  cover icon order, persisted list position, old/missing recent entries, and unpinning.
- Long repository labels use a single-line ellipsis. Real webview measurements
  across compact, column and list layouts verify unchanged row height, reserved
  star/pin space and full-label hover text.
- Startup is exercised with native metadata deliberately blocked: local history
  appears before opening a Codex chat. Unit coverage also restores cached titles
  without the index and keeps chat actions usable after failed refreshes.
  Mouse-focus checks verify empty pins hide after star clicks; keyboard focus
  still reveals controls and both hit areas are 18px tall.
- Required hook setup, obsolete dismissal flags, missing-hook diagnosis and
  restoration of saved chats are exercised in the owned sidebar. The current
  123 public unit tests include the readiness matrix, cached versus explicit
  checks, nonblocking delivery diagnostics, local chat renaming, original-title
  lookup/reset and cancellation of an open colour picker.
  Automatic label setup, report enable/disable behavior, independent routing state
  and collapsed setup details are checked in the real webview.
- The actual setup webview is exercised through install, review dispatch,
  untrusted/trusted state transitions, recorded-event verification and removal.
  Unsaved routing fields survive checks and the page has no horizontal overflow.
- The setup fixture installs/removes hooks only in its disposable Codex home.
  Trust responses and lifecycle events are synthetic; no authenticated user
  conversation or hook trust state is changed.

Native metadata evidence
------------------------

A read-only hooks/list request through the installed Codex binary found all four
new definitions in a temporary home, reporting each enabled but untrusted with
no configuration warnings. This confirms that installation does not imply trust.
Existing native recency reads return up to 200 chats across pages. These metadata
requests do not load/resume threads, send prompts, or grant hook trust.

Limits
------

Authenticated end-to-end acceptance of this fresh extension identity is pending,
including the user's trust review, a real chat event after installation and goal
pause/resume against the owning runtime. Runtime API availability may vary with
Codex releases. Do not represent fixture trust or events as native acceptance.

Commands
--------

```powershell
npm test
npm run test:integration
npm run test:installed
npm run package
```

Packaging does not install, commit or publish. Verify the packaged payload and
retain the artifact hash before installation. Existing reserved packages must not
be overwritten with new contents or reinterpreted under the new license.


Profile and frame-fit acceptance: 1.7.0
-------------------------------------

The profile migration and workspace filter pass 146 public unit tests, including
stale snapshot merges, deletions, recovered conflicts, shared browsing admission,
exact-root filtering with unassigned chats and old saved selections. All 24
commercial tests pass; the private implementation is unchanged.

Real isolated VS Code 1.137.0 verifies profile create/copy/switch through the
command and webview, independent labels, persisted workspace selection and
unchanged routing on profile switches. Restart restores organisation. A second
workspace window inherits Default and merges independent simultaneous edits.
Frame fitting keeps the existing layout transitions and complete cells within
the available frame. The original native hook and customer-journey qualifications
remain as recorded above and in the release preparation document.

Uncommitted test packaging
-------------------------

The owner selected testing before committing for 1.7.3. Run
npm run package:test-build for a local test artifact with exact public source
hashes, base revision and dirty status in its receipt. This preserves the same
build, private-source exclusion, licensing and per-payload checks as normal
packaging. The private checkout remains clean. Both modes reserve the canonical
version/output path; later changed payloads require a new version. Normal
npm run package still rejects uncommitted release inputs.

The exact uncommitted 1.7.3 archive passed isolated installation/reinstallation
in installed-acceptance-dP0Xpt (60 installed payload hashes plus manifest; 63
archive entries). The Desktop copies match SHA-256
7ae782ebb0167923f83b4c820e7dbf986a9c4342afc59ddd6746c6553a43f789.
No commits, normal-profile installation or live owner-account changes occurred.


Account recovery acceptance: 1.7.4
---------------------------------

The owner's 1.7.3 Codex log reported 401/refresh_token_invalidated immediately
after a switch; the catalog retained two saved accounts and a pending switch.
Only safe status/shape information was inspected; no live credential was
replaced during diagnosis.

New regression checks cover invalidated sign-ins without reload, pending-switch
recovery, preserving tokens rotated before a later lookup error, rejecting a
different refreshed identity, safe error messages, and browser reauthentication
followed by a checked switch. The installed Codex binary also rejected an
isolated synthetic invalid credential and removed the temporary check home
(native-account-preflight-ZP8Tne). This does not prove real owner-account success.

All 190 public tests and the missing-private guard pass in public-only-nXdiRB.
Real isolated VS Code initial/restart/second-window integration passes in
integration-HB3xm5, including SecretStorage persistence and spinner regressions.
The safe-error/preflight tests use synthetic credentials. Exact-archive
installation acceptance and owner testing remain separate.

The exact uncommitted 1.7.4 recovery archive passed isolated installation and
reinstallation in installed-acceptance-NxRKLF: 64 archive entries, 61 installed
payload hashes and its manifest. The Desktop test VSIX and paired receipt,
recovery notes and verification JSON have matching source hashes. SHA-256:
b086ebd8d63b056003c520d4d7a852fc495e4e918273680ec17a3add03b71910.
No live account changes, normal-profile installation or project commits were
performed. The owner must retry real-account recovery after installing 1.7.4.


Account menu acceptance: 1.7.5
-----------------------------

The dedicated account menu passes real isolated VS Code webview checks for
toolbar opening, hidden-state layout, keyboard navigation, literal metadata,
inline rename, settings persistence, login cancellation controls and error-only
recovery (integration-OtPUeO, initial/restart plus the existing second-window
checks). These use synthetic metadata, not live owner accounts.

204 public tests pass in public-only-ibw4B3, including 23 account-controller
tests and 14 runtime tests. They cover switch/restart reconciliation, automatic
reauthentication continuation, wrong-account/cancel/drift handling, final token
capture after helper exit, secure-storage errors, lease-coordinated removal,
stale Forget confirmation and preserving recovery after a restart mismatch.
The missing-private guard rejects the full build; 24 commercial tests pass with
the private repository unchanged.

The exact uncommitted 1.7.5 VSIX passes isolated installation and reinstallation
in installed-acceptance-abLJTX: 63 payload hashes plus manifest and 66 archive
entries. Desktop copies of the archive, receipt, notes and verification JSON
match their sources. SHA-256:
6e8dd418bb52b22e5566bbbbca38e640c91adf05064efa385da78894cbdc579e.
Normal-profile installation and real owner-account adoption remain manual.
No project commit or push was made. Previous 1.7.3/1.7.4 hashes remain intact.
