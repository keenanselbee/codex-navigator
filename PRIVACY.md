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
Activity detection can also read bounded local transcript lifecycle/tool records
and query an existing local runtime. It does not answer approvals or store messages.

Hook setup copies the collector, merges its entries into hooks.json and backs up
changed JSON. It preserves unrelated hooks. Verification reads exact hook metadata,
Codex's trust state and recent collector diagnostics. The page launches a Codex
terminal only when you choose Open Hook Review. Trust is granted in Codex, never
by Navigator; setup does not submit test prompts.

Custom chat names, labels, stars, chat colours, modes, readiness acknowledgements and setup choices
are stored in VS Code extension state. A startup cache retains up to 200 chat IDs,
titles, ordering and recency timestamps in workspace state; it contains no messages
or live activity/goal status. Automatic repository colours retain
normalized Git paths in the local profile. Custom repository colours are stored
in user settings and may sync through VS Code Settings Sync if enabled.

Routing helpers save repository paths and scoped rules under
`<CODEX_HOME>/codex-navigator`. Routing setup adds its marked section to global
Codex instructions and backs up the original. Automatic labels independently add
a separate reporting section; turning them off removes only that section and
stops applying agent reports. Shared/project rules are read, not changed. Diagnostic output may contain paths and identifiers, never chat text.

The extension does not modify Codex or VS Code files and does not import data from
Repo Companion. Codex operates under OpenAI's terms and privacy practices. VS Code
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
