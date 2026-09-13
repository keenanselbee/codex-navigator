Verification
============

Current release: Codex Navigator 1.5.0. This is a fresh extension identity with no
migration or backward compatibility for Repo Companion or its former patch.
Earlier development records and immutable packages remain local; the changelog
retains release history. Old patch checks are not evidence for this product.

Automated checks
----------------

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
