Privacy
-------

Codex Navigator processes chats locally without telemetry, advertising or a
Navigator account. It does not send chats, repository contents or instruction
files to a Navigator service. Paid licensing uses Polar's customer endpoints;
payment and customer-portal activity are subject to Polar's privacy practices.

The sidebar reads local Codex chat IDs, titles and recency metadata. Ordered IDs
are cached in extension storage. Goal objectives, status and usage are read for
visible chats and remain in memory. Merely displaying these details submits no
prompts or additional AI calls. Explicitly resuming a goal can continue Codex work
and normal model usage.

Optional Detect Chat Focus reads bounded local user messages to recognize clear
repository switches. It is off by default. Raw message contents are not persisted
by the detector or sent to a classifier.

Optional activity hooks receive input that can contain prompt/response text. The
collector discards text and saves only identifiers, lifecycle status and times.
Bounded diagnostics contain event names, chat IDs, outcomes and timestamps.
The local output channel also records activity transitions for up to 200 chats
per refresh, including turn IDs, source statuses and observation times. Runtime
connection diagnostics contain short classifications and error codes, not raw
stderr or conversation contents.
Activity detection can also read bounded local transcript lifecycle/tool records
and query an existing local runtime. It does not answer approvals or store messages.

Sound and desktop alerts use the visible Navigator view's existing refresh;
there is no additional background activity poll. A local SQLite file in extension
storage shares window process IDs, focus flags, event identifiers and timestamps
to apply your focus preferences and suppress duplicate alerts. Event records expire after seven days.
Desktop notifications pass the chat name and a generic completion/input message
to your operating system, which may display them on the lock screen or keep them
in notification history. Windows notifications also carry a local activation link
containing the chat ID and VS Code window routing so a click can open the chat.
No conversation messages are included. Navigator reads
known local Codex installation directories to find its notification sound without
copying or changing the app. If unavailable, it tries a system sound and its bundled
Balafon fallback. Native playback and notifications launch short-lived local helpers.

Hook setup copies the collector, merges its entries into hooks.json and backs up
changed JSON. It preserves unrelated hooks. Verification reads exact hook metadata,
Codex's trust state and recent collector diagnostics. The page launches a Codex
terminal only when you choose Open Hook Review. Trust is granted in Codex, never
by Navigator; setup does not submit test prompts.

Custom chat names, labels, stars, chat colours, modes, readiness acknowledgements and setup choices
are stored locally in VS Code extension storage. Chat profiles, original workspace
migration snapshots and removed-profile recovery snapshots use a transactional
SQLite database separated by Codex home. The selected profile remains in workspace
state. A shared startup cache retains up to 200 chat IDs,
titles, ordering and recency timestamps; it contains no messages
or live activity/goal status. Automatic repository colours retain
normalized Git paths in the local profile. Custom repository colours are stored
in user settings and may sync through VS Code Settings Sync if enabled.

Routing helpers save repository paths and scoped rules under
`<CODEX_HOME>/codex-navigator`. Routing setup adds its marked section to global
Codex instructions and backs up the original. Automatic labels independently add
a separate reporting section; turning them off removes only that section and
stops applying agent reports. Shared/project rules are read, not changed. Diagnostic output may contain paths and identifiers, never chat text.

The extension does not modify Codex or VS Code application files and does not
import data from Repo Companion. Optional setup changes Codex hook and instruction
configuration; optional account switching replaces its local credential file
as described below. Codex operates under OpenAI's terms and privacy practices. VS Code
handles downloads and update checks; opening external project links visits the
hosting service under its own policies.

Before uninstalling, turn off Automatic labels, remove Navigator hooks in setup
and reload Codex. To remove
routing, turn it off, then remove Navigator's marked global instruction section
and local helper directory when no sessions rely on them. Uninstalling does not
erase these files, backups, saved settings or diagnostics automatically. Do not
remove another tool's instruction section or hooks. See [advanced help](docs/advanced.md).


Licensing data
--------------

A trial starts only when you choose Try for free. No card, account or network
request is required to start it. VS Code SecretStorage holds the trial start,
last observed time, random installation ID and, when activated, the licence key,
activation ID and validation times. A small local SQLite database coordinates
workspace windows and records that licensing state exists; it contains no licence
key. On macOS/Linux it also stores a hash of a random test value and the local
editor process ID to verify that SecretStorage survives exiting the editor. The
random test value is stored in SecretStorage, separately from licence records.
No trial or activation begins during this check. Licensing is separate from
ordinary Navigator settings and data resets.

Activation and validation send the licence key, product organization and relevant
activation or random installation identifiers to Polar over HTTPS. They send no
chat text, repository paths, Codex credentials or hardware fingerprint. Paid access
checks daily while Navigator is running. Outages preserve the existing offline
deadline, up to 30 days after successful validation; they do not extend it.
Sandbox and production licensing use separate state.

Navigator does not receive card details. Buy and Customer Portal open the
configured Polar pages in your browser. Deactivate the installation before
transferring it or uninstalling. Uninstallation and settings resets are not
licence deactivation or erasure requests. If a device is unavailable, remove its
activation in the customer portal before using licence recovery.


Account data
------------

Optional account switching is off by default. Enabling it reads the local Codex
credential file and stores reusable access, refresh and identity tokens in VS
Code SecretStorage, including a temporary recovery copy during a pending switch.
Passwords are not collected. A home-scoped SQLite catalog stores user/workspace
identifiers, display email/name, known plan, consent, exclusions, generations and pending
switch fingerprints; it contains no tokens. These records are separate from
chat profiles and licensing.

The plan can also come from the remembered sign-in's identity metadata. It is
retained independently of quota availability and is a last known label, not
verification of the account's current billing subscription.

Opening the Accounts page can request quota metadata from OpenAI through a
temporary native Codex helper. It uses the saved access token in ephemeral
storage, without passing a refresh token or altering the live sign-in. Only
validated plan, quota percentages/windows, reset timestamps, banked-reset count,
the earliest reported available-credit expiry and last-checked time are cached
locally alongside the matching account. Credit IDs and descriptions are not retained. Reads
are sequential and bounded. Successful quota results are cached for five minutes.
While Accounts is visible, missing usage retries after ten seconds, then with
increasing delays up to five minutes. Closing the page stops those retries;
closing it or starting a switch cancels unfinished reads. Forgetting an account
also removes its cache.
Unavailable responses keep the last known snapshot, identified by its timestamp.

Account capability checks start a private native Codex helper. Add Account
starts Codex's browser login in a temporary isolated Codex home; authentication
uses OpenAI's services and privacy practices. Navigator deletes that temporary
home after completion or cancellation once its helper has stopped. If shutdown
cannot be confirmed, that temporary home is retained rather than deleted while
the helper might still be writing credentials.
Switching replaces the supported local
Codex credential file and reloads this window. Other clients sharing that home
may need reloading. Navigator cannot verify their live account automatically.

Turn Off stops capture but keeps saved accounts. Forget removes the saved
credential and matching recovery copy and excludes the identity from automatic
capture. Forget All also turns capture off. Neither signs Codex out or removes
its own credential file. Uninstalling is not a secure-storage erasure request;
use Forget All first. No account secrets are put in webview messages, settings,
logs, exports or source backups by Navigator.

Before selecting a previously saved sign-in, Navigator asks the native Codex helper to
check and refresh the selected saved sign-in in a temporary isolated home.
This contacts OpenAI's authentication/account services and can rotate tokens.
Refreshed credentials are saved back to SecretStorage before the active login
changes, including when a later account lookup fails. Temporary check homes are
removed after the helper stops. A freshly completed native login can continue
the requested switch without another refresh. Navigator does not expose raw
native errors or token values. Copy Email writes only the displayed email to
the clipboard, and only when requested.
