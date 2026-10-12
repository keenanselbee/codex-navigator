Setup and troubleshooting
=========================

<a id="advanced-use-and-development"></a>
<a id="replacing-repo-companion"></a>

Use Navigator's **...** menu for setup, chat organisation, licensing and
**Extension Settings**. The optional **Show New Chat Button** setting adds **+**
between Search and Accounts. Navigator provides its own sidebar; Codex continues
to manage the conversations.

Find help
---------

- [Setup and troubleshooting](#setup)
- [Organising chats](#organising-chats)
- [Activity, notifications and goals](#activity-indicators)
- [Accounts, usage and banked resets](#account-switching)
- [Project instructions](#project-instruction-routing)
- [Licensing, platform support and local data](#licence-and-transfer)


Setup
-----

Start a trial or activate a licence, then run **Codex Navigator: Set Up Codex
Navigator**. Setup puts Activity hooks first, followed by optional Automatic
labels and Project instructions. Details and diagnostics are collapsed.

1. Choose **Install Hooks**. Navigator installs its local collector and adds its
   four activity hooks to `<CODEX_HOME>/hooks.json`. Unrelated hooks are retained,
   and changed JSON is backed up.
2. Choose **Open Hook Review**. Wait for Codex to start in the provided terminal,
   enter `/hooks`, and review and trust all four Navigator hooks. This uses the
   CLI bundled with the Codex extension; no separate CLI installation is needed.
   You can close the terminal afterward. Changed hook definitions need review again.
3. Optionally reload VS Code, send a normal chat message, then choose **Check
   Status**. A fresh collector event confirms delivery. Navigator does not submit
   a test prompt, and delivery verification does not block the chat list.

First-time setup requires installed, enabled and trusted hooks. Once setup has
been verified in this local Navigator store, later hook problems leave saved
chats available, including after a restart. A compact notice offers the next
step. Setup never writes trust records or bypasses Codex's review.

Choose **Arrange Navigator** for instructions on dragging its heading above
Codex and resizing the divider. VS Code remembers the arrangement.

### Troubleshooting hooks

**Check Status** shows the result, last-checked time and next action. Installation,
trust and delivery are separate checks: a trusted hook may not have run yet.
The visible setup page refreshes automatically and preserves unsaved options.

| Problem | What to do |
|---|---|
| Node.js unavailable | Follow the PATH, permission or timeout guidance. After fixing it, fully quit and reopen VS Code. Node must be available to the extension host, not just another terminal. |
| Hooks missing or changed | Install Navigator hooks, then review their current definitions. |
| Disabled or unverified trust | Open Hook Review and inspect `/hooks`. Codex policy or configuration may disable hooks. |
| Trusted but no event | Reload, start a new chat turn and inspect the diagnostics path shown in setup. A quiet chat does not invalidate earlier delivery evidence. |
| Activity disagrees with the chat | Check the Codex Navigator output channel for activity and runtime diagnostics. |

Choose **Remove Navigator Hooks** and reload to stop collection. Only Navigator's
definitions are removed; its collector, diagnostics and backups remain local.
Do not delete another tool's hooks to repair Navigator. See
[Codex hook review](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks).


Organising chats
----------------

### Sidebar layout and ordering

Choose **Layout...** from Navigator's **...** menu, or change **Chat Layout** in
Settings. **Auto** (the default) adapts between a compact grid, two-line columns
and a list as you resize the view. **Columns**, **List** and **Compact** keep their
presentation regardless of height; the number of columns still fits the available
width. The choice persists across restarts. The menu saves it in user settings,
or updates an existing workspace override. The accounts panel remains automatic.

Larger fonts affect how much fits. Names stay on one line; enable
**Show Chat Tooltips** for full text on hover. Very small views may need enlarging
before an entry fits. VS Code controls the outer divider and minimum view height.

Chats follow Codex's recent-chat order. Stars, colours and activity do not change
that order; pins preserve selected positions. Moving the pointer over Navigator's
content, or focusing its list with the keyboard, holds the order while indicators
continue to update. Leaving releases the latest order.

Search covers up to 200 cached local, saved VS Code chats, not an exhaustive
archive. Unsaved and remote chats are excluded. Cached entries remain available
when live reads fail. Selecting a chat opens it through Codex; VS Code may ask for
confirmation. Navigator does not reliably track selections made inside Codex.

### Chat visibility and selection

**Recent Chats Only** defaults on and hides chats last used more than 24 hours
ago, except pins, stars and chats explicitly saved in the profile. Unknown dates
remain visible. Turn it off to browse older entries in the cached history.

**Hide Chat** hides an entry in the current profile without deleting its Codex
conversation. **Restore Hidden Chats** in the title menu restores selected entries;
the recency filter still applies.

**Highlight Mode** offers Off, Recently viewed chats (default), or Last viewed chat
only. **Highlight Duration Seconds** sets the fade from 1 to 3600 seconds, with a
three-minute default. Each chat keeps its own timer; revisiting it restarts that
timer. Changes apply without reloading. Highlights mean recently opened through
Navigator, not necessarily the chat currently visible in Codex.

### Chat and repository menus

Right-click a chat, or use Shift+F10/Menu, for its context menu. Actions target that
chat even when a different conversation is visible in Codex.

- **Rename Chat** sets a name only in the current Navigator profile. Search matches
  both names; the Codex title remains in the rename dialog and optional tooltip.
  **Reset Chat Name**, or a blank rename, restores the Codex title.
- **Choose Repository** opens a searchable picker of local Git repositories in
  the workspace, including nested repositories. It preserves custom label text.
- **No repository association** removes a custom label's repository link without
  clearing the label. Label text and repository choice are separate.
- **Chat Colour** changes the shared label colour or only this chat. A chat-specific
  colour wins until reset to **Use label colour**.

Open **Repository Colours** from the **...** menu and select a repository to open
its picker. Click a swatch to preview, then click it again or choose **Apply** to
save. **Cancel** returns without applying; **Back** returns to chats. Repository
Aliases and Repository Colours are also linked from Extension Settings.

### Scope and colours

Enable **Automatic labels** in setup, then start a new Codex chat. Setup installs
reporting guidance in global Codex instructions. It does not enable hooks or
Project instructions. Turning it off retains current labels but stops accepting
new agent reports. Existing chats may retain old guidance, so start a new chat
after changing setup. Hooks report activity, not repository scope.

Auto follows agent reports and explicit user corrections. Optional **Detect Chat
Focus** can also recognise clear repository switches in local user messages.
Unrelated editor tabs, attachments, quoted examples and ambiguous mentions do not
assign a repository. Read-only, AUDIT and DNE requests suppress inferred updates.
Reporting is best effort; related repositories belong only to the current task.

**Keep current labels fixed** holds a chat's scope. **Clear** selects None and
suppresses automatic labels. **Keep Manual Labels Fixed** controls future manual
choices; it does not pin a chat's list position. Multi-repository selections
default to Auto unless this preference was explicitly configured.

Matching custom labels share a colour within the profile, ignoring case and outer
spaces. Renaming a label inherits its existing shared colour. Choosing a shared
colour clears the selected chat's override but preserves other deliberate chat
overrides. Colour sharing does not copy repository associations or routing.

Automatic colours keep repositories distinct and adjust for theme contrast. User
hex colours remain exact; **No colour** disables automatic colour for that item.
New repositories keep existing assignments. Resetting Navigator regenerates
defaults, which can differ after workspace or repository-history changes.

### Pinned chats

Pins preserve a chat's list position, not a screen coordinate; resizing can change
its row and column. Other chats keep their normal order around pinned positions.
Pins stay visible, while hover or keyboard focus reveals available star/pin actions.

Up to 200 pins can retain saved chat names beyond recent history and bypass
**Recent Chats Only**. Search and other filters still apply, and **Hide Chat**
still hides a pin. Unpinning restores ordinary ordering and age filtering.
Pinning cannot restore a conversation deleted in Codex.

### Chat profiles and workspace filtering

Each workspace initially uses Default. Open **Chat Profile** in the **...** menu
to create, copy, select, rename or remove a profile. Each workspace remembers its
selection; a custom profile name appears beside Navigator's title. Windows using
the same profile share organisation changes on refresh.

Profiles organise existing conversations without copying messages or changing
running goals, permissions or instruction routing merely by switching profiles.
New profiles can copy current organisation or start with an empty selection.

**Choose Chats for This Profile** saves an explicit selection. Those chats, stars
and pins remain available beyond the 24-hour filter. **Include All Recent Chats**
restores automatic discovery. Hiding still applies. Removing a profile leaves
Codex conversations intact and returns its other windows to Default on refresh.

**Show Chats Relevant to This Workspace** filters by associated Git repositories,
including nested roots. Unassigned chats remain visible. Custom label text alone
does not establish a repository association. The profile remembers this filter;
use its **Clear** button to remove it.

If older workspace organisation is missing from Default, **Restore Workspace
Organisation** creates a separate profile from its retained snapshot.
Profiles are local to the VS Code user profile and Codex home, not cloud-synced.


<a id="activity-indicator-prototype"></a>
<a id="activity-indicators"></a>

Activity, notifications and goals
--------------------------------

Activity indicators distinguish working, waiting for input and unknown states.
Navigator combines hooks with available local runtime and transcript evidence.
Stale or unfamiliar evidence becomes unknown. Tool exit codes and response text
alone do not establish a completed task. A blue ready dot marks a completed turn
since the chat was opened through Navigator; native Codex navigation is not
tracked reliably.

A question mark identifies a detected unanswered question. Its ring spins while
Codex continues working and stops when Codex is waiting for your answer. Answering
one question leaves the others visible; opening the chat does not clear them.
Approval waits retain their separate yellow dot. The indicator works independently
of sound and desktop-notification settings.

Async question tracking is best effort: Navigator matches accepted structured
requests to individual replies. Codex's local skip/dismiss action is not available
to Navigator, so a dismissed question may remain indicated until 15 minutes after
it was asked. At that point the indicator expires, even if the question remains
unanswered. Ordinary progress does not extend this limit. Missing transcript
history can also hide an unresolved question. Fresh live blocking-input status
does not have this async expiry. Questions written only in chat text are not
detected.

An active goal shows a spinner even between turns. Pausing the goal removes that
spinner only when the chat is not otherwise working. Goal controls use the runtime
owning the chat; if unavailable, Navigator opens the chat for native control.
Viewing goal status makes no AI calls. Resuming a goal can continue work and model
usage. Activity collection discards prompt and response text.

### Sounds and desktop notifications

Extension Settings provides four independent rules:

| Setting | Default |
|---|---|
| Response Finished Sound | Always |
| Question Sound | Always |
| Response Finished Notification | Only when VS Code is unfocused |
| Question Notification | Always |

Each rule offers Off, Always, Only when VS Code is focused, or Only when VS Code
is unfocused. Focus means any local Navigator window in the same VS Code profile,
not an individual chat. Desktop notifications include the chat name.

Question alerts cover blocking input, approvals and accepted async prompts.
Async prompts may alert while work continues. Detected answers cancel pending
question alerts across windows; notifications already shown remain in OS history.
Questions written only in response text produce a completion alert, not a separate
question alert. Very short requests between refreshes can be missed. Hidden views
do not add background polling, and reopening does not replay historical alerts.

Use **Codex Navigator: Test Notification** to preview sound and desktop delivery
regardless of the rules. **Notification Volume** controls sounds and previews
from 0 to 100%, defaulting to 50%. Zero mutes sound without disabling desktop
messages. Changes apply to subsequent alerts; system volume stays unchanged.

On Windows, clicking a chat notification targets the VS Code window that sent it.
Keep that window open: old notifications may fail or open elsewhere after it closes.
VS Code may ask for confirmation. Preview notifications have no chat action, and
click-to-chat is Windows-only.

Sound uses the locally installed Codex sound when available, then a system sound
or the bundled Balafon sound. Its [licence](notification-sound-license.txt) ships
with Navigator. OS notification permissions, quiet modes and output volume still
apply. Linux needs a notification service and `notify-send`; sound needs the
appropriate `paplay`/`aplay` or `canberra-gtk-play` helper. Windows needs VS Code's
Start menu app identity. Failures appear in the Codex Navigator output channel
and do not interrupt chats. See [platform support](#platform-support) for testing limits.


<a id="account-switching"></a>

Accounts, usage and banked resets
--------------------------------

### Switching accounts

Enable **Account Switching** in setup. The account icon opens saved sign-ins,
showing email or custom label, plan and last known usage. Compatible credentials
are remembered in VS Code SecretStorage; there is no password or token-import form.

Click an account to switch and reload this window. **Add Account** opens Codex's
browser sign-in and switches after completion. You can also sign in normally in
Codex and let Navigator remember the credentials. Right-click a saved account to
change its label, use a banked reset, sign in again or forget it. Clear a custom
label to show the email; **Back** returns to chats.

Switching affects other Codex windows and terminals sharing the same Codex home.
Finish their work first; other windows may need reloading. The first switch
explains this, and subsequent switches prompt when Navigator sees active work.
Navigator cannot observe all shared clients or independently verify the IDE's
active account. Check Codex settings if its displayed account differs.

Usable saved sign-ins switch without a browser. **Sign In Again** reconnects an
expired sign-in; **Copy Email** supplies the expected address for the browser.
A matching login completes the switch automatically. Cancelling or choosing the
wrong account keeps the current sign-in. A failed reload offers **Retry Reload**
and recovery when the previous account is available. Navigator never automatically
restores credentials after a sign-out.

Turning off account switching keeps saved accounts. **Forget All** deletes them
and turns remembering off without signing Codex out. Removal remains available
after Navigator access expires; adding and switching require normal access.

### Usage and plans

The account's second line shows last known quota. Hover for full identity, usage
windows, reset times, banked-reset count and the observation time. Available expiry
details use local time and may be incomplete. A passed cached date does not prove
that quota replenished or automatically reduce the banked-reset count.

**Refresh usage** retries account checks. Accounts refreshes stale
information on open and retries missing usage while visible. Closing it stops
those retries. Missing data means unavailable, not zero. Expired sign-ins, older
Codex runtimes or managed policies can prevent usage reads while switching remains
usable. These checks do not refresh credentials or change the active sign-in.

Plans use Codex's reported tier names, including Pro 100, Pro 200 and Pro 500.
These are not usage multipliers or localized price quotes. Unknown plan codes
display directly, and cached details can lag subscription changes. Check Codex or
ChatGPT billing for the current subscription.

### Banked resets

Choose **Use banked reset** from an account's menu to review available resets and
local expiry dates. Check the account email and workspace before confirming.
The earliest-expiring valid reset is marked **Will be used** when eligible, or
**Next to expire** otherwise.

Navigator requires **less than 10% remaining in either the five-hour or weekly
window**. Exactly 10% is unavailable. Dates remain visible while the action reads
**Reset unavailable**; **Refresh usage** checks again. Missing, failed or stale
usage cannot authorize a new reset. Eligibility is checked again before spending,
and OpenAI may still decline the request under its own rules.

A full reset refreshes both limits and moves the weekly reset date. Confirming
uses that exact credit without switching accounts or reloading. A changed credit
list requires another review. **Back** or **Cancel** returns without spending.
No resets are consumed automatically.

If the outcome is uncertain, refresh the confirmation and choose **Retry previous
reset**. This reuses the original credit and request, including after restarting
VS Code. It can resolve the attempt after quota replenishes or the credit
disappears from the available list; it never selects another credit.

A confirmed success stays visible if the usage refresh fails. Refresh usage to
update the limits and clear that warning. If sign-in or service errors persist,
reconnect the account or check Codex.

### Account credential storage

Account switching requires file-backed ChatGPT credentials in a trusted native
local workspace. Enable failures remain visible in setup; resolve the reported
reason, then try again. Disabling switching stops background credential capture.

Codex's file backend stores its active sign-in in `auth.json`; Navigator's saved
copies use SecretStorage. An existing file alone does not establish the active
backend. Keyring, auto, ephemeral and custom authentication endpoints are unsupported;
managed policies may also prevent adding accounts. Remote environments are outside
the [supported platform scope](#platform-support).

If you choose file-backed credentials, configure them through Codex and sign in
there before retrying setup. This is optional for Navigator's chat features.
Navigator never changes the backend automatically. Do not copy tokens manually
or bypass managed authentication policies.


Project instruction routing
---------------------------

Enable **Project instructions** in setup using project files alone or an optional
shared file. Workspace folders are followed automatically; Advanced options allow
custom scopes and extra instruction filenames. Conflicting scopes report an error.

**Save Project Instructions** installs helpers under `<CODEX_HOME>/codex-navigator`
and updates only its marked block in global `AGENTS.md`, with a backup. It does
not edit shared or project instruction files. Automatic labels have their own
setup; enable them separately if wanted.

Explicit task focus takes precedence over chat labels. Routing discovers shared,
project and nested instructions in order, but does not change working directories
or permissions or prove the agent read them. Disabled routing leaves ordinary
Codex instruction discovery in place. If an enabled helper fails, its generated
`fallback.md` describes the saved rules.

Routing adds local discovery and relevant instruction text without extra AI calls.
It complements Codex's built-in discovery and cannot guarantee agent adherence.


Licensing, platform support and local data
-----------------------------------------

### Licence and transfer

The seven-day trial (168 elapsed hours) starts only when you choose **Try for free**.
Hooks do not start it. Navigator is also available as a $5 CAD one-time purchase
with future updates; Context Suite requires a separate purchase.

Open **License** from the top menu to activate a key, check status or deactivate
this installation. Deactivate before moving computers or VS Code profiles.
Workspace windows in one local profile share an installation. Paid access refreshes
daily while running and allows up to 30 days offline after successful validation,
capped by any provider expiry. Known revocation blocks access.

When access expires, Navigator shows licensing and stops feature actions and
metadata polling. Saved organisation remains. Codex and running goals continue
independently. Settings and setup remain available to remove hooks and guidance.

Use **Customer Portal** to remove an unavailable installation. After an interrupted
activation or deactivation, confirm removal in Polar before **Recover Licence**.
Do not repeatedly retry activation after a lost reply: it may have consumed the
installation slot. Recovery can replace a damaged protected record when its local
presence marker remains, enabling paid activation but not another trial.
An unavailable keychain or database must be repaired, not overwritten.
Resetting Navigator settings does not reset licensing.

<a id="verification-and-release"></a>

### Platform support

Windows x64 is natively tested. macOS/Linux on x64 and ARM64 are best effort;
Windows ARM64 is also unverified. Use local desktop VS Code 1.137 or newer, the
matching Codex extension and Node.js on PATH. Remote SSH, WSL, containers and
browser VS Code are unsupported.

Navigator uses Codex's bundled runtime for the current OS and architecture.
If setup reports it missing or non-executable, update or reinstall Codex.
On macOS/Linux, Node must be visible when VS Code starts from the desktop; fully
quit and reopen VS Code after fixing PATH. Review hooks again if their command changes.

Licensing and saved accounts depend on VS Code SecretStorage. For keychain/keyring
errors, see [VS Code's troubleshooting](https://code.visualstudio.com/docs/configure/settings-sync#_troubleshooting-keychain-issues).
Before a trial or activation on macOS/Linux, Navigator checks that a harmless test
value survives a new editor session. Fully quit all VS Code windows and reopen
when prompted; an extension-host restart is insufficient. This check does not
start a trial or consume an activation. Repair failed secure storage before recovery.
The check verifies persistence, not the encryption backend.

The universal VSIX is installable across desktop platforms, but native runtime,
secure-storage and licence-transfer acceptance remains pending on macOS/Linux.

### Settings and storage

Open **Extension Settings** for the Chat list, Notifications, Labels and colours,
Project instructions, and Advanced groups. Enable Automatic labels and Project
instructions through setup so their required guidance is installed.

Chat names, labels, stars, pins, colours and profile selections are saved locally
under VS Code's extension storage, separated by Codex home. Helper reports,
routing configuration, diagnostics and backups live under
`<CODEX_HOME>/codex-navigator`. Custom repository colours use VS Code settings.
For stored data and network behavior, see [Privacy](../PRIVACY.md).

<a id="build-and-checks"></a>

For implementation and testing, see the
[developer guide](https://github.com/keenanselbee/codex-navigator/blob/main/docs/development.md)
and [architecture](https://github.com/keenanselbee/codex-navigator/blob/main/docs/architecture.md).
Packaging and publication are covered in
[Release preparation](https://github.com/keenanselbee/codex-navigator/blob/main/docs/marketplace-release.md).
