Commercial Access And Private Repository Split
=============================================

Status: accepted; implementation in progress
Date: 2026-09-13

Combined goal
-------------

Implement the agreed commercial access policy in Context Suite and Codex
Navigator, including Navigator's public/private repository split. Each product
is a separate $5 CAD one-time purchase including all future updates, with a
seven-day (168-hour) local trial, one active transferable installation, daily
paid validation and 30-day offline grace from successful validation.

Extend Context Suite trials from their original start times, preserving free
Analyze access and allowing admitted work to finish. Add Navigator licensing
based on Context Suite's tested patterns: explicit trial start, protected
persistent state, coordination across workspace windows, product-specific Polar
validation, and a licence screen replacing Navigator functionality when access
expires. Preserve user data and leave Codex tasks and goals unaffected. Keep
licence management, recovery, settings, and hook/guidance removal accessible.

Keep useful Navigator implementation, presentation, public contracts, tests and
portfolio documentation in the public repository. Move the commercial
implementation and its implementation tests into the independent private
repository checked out at `proprietary/`. Maintain one production extension
requiring both checkouts, with clear missing-private build failures and no
shipping test doubles, alternate free edition or access bypass. Verify public
source and release packaging boundaries, independent public checks, and full
commercial integration using compatible revisions of both repositories.

Update policy, licence, pricing, privacy, architecture and build documentation;
complete focused tests and sandbox-ready integration; and prepare versioned,
verified release artifacts. Live Polar settings, purchases, refunds, publication
and deployment require separate explicit authorization. Track owner-run Polar
configuration and verification as external dependencies; missing evidence does
not count as completed acceptance.


Repository boundary
-------------------

The public checkout remains `codex-navigator`. The independent private checkout
is `proprietary/`, with remote `keenanselbee/codex-navigator-private`. It is an
ignored nested repository, not a submodule. Its staging, commits and pushes
remain separate from the public parent. Credentials and customer licence keys
belong in neither repository.

Public code owns the chat UI, layouts, colours, stars, pins, history, activity,
goal integration, setup, hooks, repository labels, licensing interfaces and
licence-screen presentation. Public tests use test-only implementations of the
licensing interface. Public documentation explains the commercial policy and
provides substantial engineering material for co-op portfolio review.

Private code owns trial/paid policy implementation, Polar integration, protected
licence storage, activation/recovery coordination, production product
configuration and commercial implementation tests. Public components depend on
public contracts; the production composition layer connects private services.
Do not move ordinary public features solely to manufacture private dependencies.

Initially relocate `license-policy`, `license-manager`, `license-provider`,
`license-store` and `license-configuration` behind a small public licensing
contract. Retain `license-access` and the licence UI publicly, removing their
direct dependencies on private implementation types. Review each module and
test during the move rather than duplicating implementation in both repositories.

Public checks must run without private credentials or source. Full builds must
require a compatible private checkout and report a clear error when absent.
Private release checks test the complete extension and record both Git revisions
plus artifact hashes. Packaging includes necessary compiled commercial code,
never private source, source maps, tests, credentials or private Git metadata.
Use explicit packaging rules and checks in addition to `.gitignore`; reject
tracked paths under `proprietary/` in the public repository. A private checkout
does not make distributed JavaScript tamper-proof or withdraw earlier grants.


Policy
------

Codex Navigator is a separate $5 CAD one-time purchase including all future
updates, with one active transferable installation. A local trial lasts seven
days (168 elapsed hours), starting only when the user chooses Start 7-Day Trial.
No card or Polar account is required for the trial. Hooks are independent of
trial admission. Paid access refreshes daily while running and allows 30 days
offline from successful validation, capped by provider expiry. A definitive
revocation blocks access; outages neither revoke a valid cache nor extend it.

Expiry replaces Navigator's entire content with a licence screen offering Buy
and Activate. Block feature commands in the extension host, not only in HTML.
Stop Navigator metadata polling and new feature actions; never interrupt Codex
threads or goals. Retain labels, pins, colours and history. Licence management,
recovery, settings and removal of installed hooks/guidance remain accessible.

Use one installation identity across workspace windows in a local VS Code
profile. Separate profiles/editors need explicit transfer, not silent additional
activations. Store keys and activation records using VS Code SecretStorage,
coordinate mutations across windows, and keep licensing outside ordinary settings
resets. Do not promise resistance to a deliberate local state purge or patched
client. Missing/damaged state must not silently reset a known trial/activation.
Uninstall/reinstall persistence needs explicit verification before release.

Implementation boundaries
-------------------------

Port Context Suite's policy and customer-endpoint behavior to TypeScript. Do not
introduce a .NET helper, licensing service, merchant token, custom customer
accounts, hardware fingerprinting or shared cross-product framework. Navigator
must check its own organization and licence benefit. Context Suite keys must not
unlock it. Sandbox and production composition/stores must be isolated. No runtime
setting or command-line flag may grant paid access or change production identity.

Bound network requests and response sizes. Persist pending activation/deactivation
before HTTP. Lost replies require reconciliation or user-confirmed portal recovery;
never automatically retry a mutation and consume another activation slot. Late
refresh responses must not undo transfer or recovery. Never log licence keys or
send chats, repository paths, user messages or Codex credentials to Polar.

Existing released copies retain their original licence permissions. Update the
licence and public copy for future paid releases before packaging. Do not publish
live purchase links until activation, delivery and refund/revocation are verified.

Work and evidence
-----------------

- [x] Verify the independent Navigator private checkout and exclude
  `proprietary/` from public Git tracking and direct VSIX packaging.
- [x] Establish public licensing contracts and move commercial modules/tests
  into the private repository, with separate repository instructions.
- [x] Separate public checks from full production builds; verify missing-private
  failure without introducing a second application or shipping bypass.
- [ ] Verify source archive/VSIX boundaries and record both repository revisions
  in production release evidence.
- [x] Policy, clock and state validation with deterministic tests.
- [x] Polar customer transport with product identity and failure tests.
- [x] Protected persistent storage, multi-window coordination and recovery.
- [x] Host enforcement, polling shutdown and compact in-panel licence UI.
- [x] Setup/removal access without allowing expired Navigator feature actions.
- [x] Licence, privacy, pricing and customer installation/update documentation.
- [ ] Real isolated VS Code acceptance, including expiry during a Codex goal.
- [ ] Sandbox activation, repeat validation, second-install refusal, transfer,
  refund/revocation and download delivery (owner configuration required).
- [ ] Versioned, verified release artifact; production configuration and live
  release checks remain separate from packaging or installation.

The owner supplied Navigator sandbox organization/product/benefit IDs and a
checkout link; the shipping provider has verified the benefit identity in sandbox.
The owner also supplied the sandbox customer-portal URL. It is saved with the
ignored sandbox configuration. Owner screenshots confirm one activation,
customer-managed activations, no expiry and unlimited usage for Navigator Key
attached to Codex Navigator - Test. A sandbox purchase shows CA$5.00 subtotal,
CA$0.60 tax, CA$5.60 total and a granted licence benefit. Browser inspection now
verifies the sandbox portal's organization-specific sign-in page. Authenticated
customer access and portal recovery remain unverified. Production configuration
evidence is recorded below separately from sandbox acceptance.
The private service is committed independently as `21bcee7`; 18 commercial tests
pass after relocation, including competing windows, stale replies, process
termination, original trial retention and missing/corrupt storage. Public source
contains interfaces and presentation, not the relocated implementations.

Isolated VS Code acceptance verifies explicit trial admission, actual protected
storage, expiry blocking host commands and stale webview actions, metadata polling
shutdown without goal changes, and saved-data restoration after renewed access.
Codex goal and hook responses in this fixture are synthetic; authenticated Codex
goal acceptance remains outstanding. A full
VS Code process restart now verifies the same protected installation identity
and original trial deadline, refusal of a replacement trial and restoration of
chats before live metadata. The full two-window run also passes shared identity,
expiry propagation and access restoration through actual VS Code SecretStorage.
An initial run timed out during shutdown because VS Code's development-host Quit
command targets the last active window. Each fixture now closes its own window;
the rerun passes and exits cleanly. The latest run (`integration-WlqCsp`) also
checks that native label and repository pickers opened before expiry cannot
apply their choices afterward.
The explicit public-only source snapshot passes all 120 public tests and rejects
a full build without the private checkout, including when stale compiled output
is present. It contains no private source. A disposable 0.0.0 archive exercised
the real VSIX packager: all 54 entries match expected hashes and private source
and source-map sentinels are excluded. The actual disposable VSIX also passes
installation, trial expiry, uninstall, ordinary-settings reset and reinstall in
an isolated profile (`installed-acceptance-nE6Tt8`). The same protected identity,
original trial start and saved stars survive; another trial is refused. Installed
runtime file hashes and manifest match the archive (excluding the installer's
added metadata). The fixture removes its extension after
verification and leaves the normal profile untouched. It does not reserve a
release version. Production packaging now requires clean independent
checkouts and records both revisions, the archive hash and every payload hash;
an actual production artifact and paired revision receipt remain outstanding.
No live activation has been performed.
Authenticated Navigator sandbox activation, repeated validation, wrong-product
denial, second-install refusal, deactivation, old-activation rejection and transfer
passed on 2026-09-13. The final test activation was released. A prior rapid run hit
rate limiting and stopped; its known activation was explicitly released before
the successful paced rerun. Private receipts contain fixed metadata and no keys.
This confirms the supplied sandbox organization/benefit identity and licence
limits. Refund/revocation, portal recovery and actual download delivery are still
outstanding. Configured activation inside the packaged extension is now verified
through the separate licence-screen test described below.
The owner has supplied production organization/product/benefit IDs, checkout and
the live organization slug. Screenshots confirm CAD 5.00 fixed one-time pricing,
the attached Navigator licence benefit, one activation, customer deactivation,
no expiry and unlimited usage. The constants are configured only in the private
checkout; no merchant credentials or customer keys are included. Production
provider validation, portal reachability and authenticated recovery, checkout tax
presentation and delivery remain unverified. The production composition builds
successfully and all 20 commercial tests pass. A disposable package verifies all
54 archive entries and excludes private source (`package-acceptance-4aHvJP`);
it is not a versioned production release or evidence of live provider acceptance.
Isolated VS Code acceptance also passes with this composition
(`integration-di0F0b`), including trial expiry, protected restart and two-window
coordination. Provider responses and Codex hooks/goals remain fixtures there.
Context Suite configuration exists separately; reuse no product-specific IDs.
CAD tax presentation must be confirmed in checkout. Seven-day trials are local,
not subscription trials or seven-day expiry on purchased licence keys.

Context Suite's seven-day duration, original-start migration and policy copy are
committed as `02bee64`. All 2,403 foundation contract checks and the repository
check passed on 2026-09-13. An earlier run was stopped at unrelated native I/O
cleanup; the rerun passed after that test was fixed separately in `fc26cf6`.
Follow-up verification built fresh production staging
`6e4b804aa66445d8ab0264ed7212b9e0` and passed 2,650 contracts against the real
private worker and WPF activation entry point. Engine/dependency/payload checks
also passed. No Explorer installation was changed. The local receipt records
tested binary hashes; concurrent unrelated work prevents treating that staging
as clean release provenance. Installed licensing acceptance remains pending.

Navigator setup tests also verify that expired access blocks enabling hooks,
automatic labels and routing while preserving their removal actions.
Private recovery milestone `bf49517` adds explicit, portal-confirmed recovery
from a damaged protected record without granting another trial. Valid records
and unavailable keychains are not overwritten. All 20 commercial tests pass.

The public sidebar/commercial integration is committed as `5e38607`. Private
test preparation now builds a complete disposable sandbox VSIX by substituting
only fixed sandbox configuration in the copied runtime. Its receipt records both
source revisions/status, the substitution and archive/file hashes. The sandbox
installed/reset/reinstall check passes (`installed-acceptance-palTG6`), including
separate protected environment records. This makes no paid provider requests;
production release evidence remains outstanding.

The full installed sandbox licence-screen flow passes in
`installed-acceptance-vg4X1U`: activate, reveal Navigator, retain the paid identity
after restarting VS Code, explicitly validate, then deactivate and block features
without granting another trial. The final test activation was released. Native
input and confirmation values are fixture-supplied; actions otherwise pass through
the actual webview, host controller, protected store and Polar provider. A first
attempt intercepted the fixture extension's API rather than Navigator's and never
submitted a key; read-only inspection confirmed no licence record before retry.
The observer now attaches on view activation and uses Navigator's API object.
No plaintext Navigator key was found in owned test files or logs. Native dialog
appearance, real Codex goal/hook acceptance, portal recovery, refunds, delivery
and clean production release artifacts remain separate gates.

The required-hook setup revision removes Continue Without Setup and permanent
dismissal. Navigator now requires installed, enabled, trusted hooks and recorded
delivery, returning to setup with the relevant issue if readiness fails. Required
hooks appear before optional labels and project instructions. The 121 public
unit tests pass, including a recent collector write failure superseding older
success. Isolated VS Code acceptance (`integration-B0wePX`) passes the mandatory
setup view, removal diagnosis, preserved chats, licensing gates, restart and
two-window checks. Hook trust and events in that acceptance remain fixtures;
this does not satisfy the separate authenticated Codex acceptance gate.

The follow-up setup decision removes delivery from chat admission: installed,
enabled and trusted hooks are sufficient. Missing events and collector failures
remain diagnostics without hiding chats. Navigator-only chat names now preserve
the original Codex title for lookup, search and reset. The 123 public tests and
isolated VS Code run `integration-F5cpx8` pass, including native command dispatch
for rename, original-title lookup and reset. Menu titles remain static; the
Original Chat Name action displays the title in a native dialog.

Latest local boundary verification passes 123 public tests without private source
(`public-only-ZNRpgA`) and all 20 private commercial tests. The updated disposable
package (`package-acceptance-zaVJXH`) passes 54 archive-entry checks and installed
expiry/reset/reinstall acceptance in `installed-acceptance-9uopj0`; the fixture
removes its extension afterward. Label ellipsis measurements pass all three
layouts in `integration-LgdkdB`. An earlier run failed the existing resize-focus
assertion; the unchanged rerun passed and exited cleanly. Local receipts retain
the archive hash, source revisions and working-state qualification. These are
test artifacts, not the still-pending clean production release.

The supplied sandbox portal opens a page titled Customer Portal | Keenan Selbee |
Polar, with the sandbox banner and an email sign-in form. Navigation resolves to
the organization's `/portal/request` page. No email or credentials were entered
and no account settings changed. This closes portal-URL reachability only;
authenticated purchase access and activation recovery remain owner-assisted gates.
