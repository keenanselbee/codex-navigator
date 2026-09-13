Advanced Use and Development
============================

A local VS Code extension that labels Codex chats with the latest project being
discussed. Labels appear in chat history, sidebar headers, and editor tabs.
Version 1.1.4 provides display labels and stars: it does not select repositories, move
Source Control, or change the saved chat title, working directory, or permissions.
It is not an official OpenAI product.


How labels work
---------------

New chats stay unlabeled until the conversation agent reports their repository
scope, or you choose a label manually. The selected Source Control repository,
active editor and chat starting directory never assign a label. Existing agent
reports can restore labels when reopening a chat; no fresh report is required.

Auto uses the newest agent report or user correction. Labels replace past projects
rather than accumulating history. Up to three labels describe projects still
discussed together; larger scopes show two names plus `+N`. Pins override updates.

**Detect Chat Focus** is an optional local shortcut, off by default. When enabled,
clear requests such as "focus on Context Suite" can update a label before the
agent reports. It matches known names and aliases, tolerating one unambiguous typo
in longer names. Unknown/ambiguous references, quoted examples, instruction
attachments and IDE active-file context do not supply a label. Implicit shifts
still depend on agent reporting. Detection uses bounded local transcript reads,
no external model or additional API call. Existing explicit opt-in settings remain
respected on upgrade.

Right-click a saved local chat in history or its title at the top of an open
conversation. The dropdown lists this workspace's open Git repositories directly:
click a repository to set that chat's label. Long lists scroll and can be filtered
by name or path. Duplicate names include paths; hovering any entry shows its path.
**Use Automatic Labels** resumes following discussion; **Clear Labels** pauses it.
**Custom Label...** lets you enter your own display prefix, such as
`Elden Ring modding`, without choosing a Git repository. Manual labels are pinned
by default and survive reloads. Use the same option to edit it; choosing a repository, Automatic Labels,
or Clear Labels replaces it. Labels use one line, up to 100 characters, without
square brackets (the display adds those).
**New Chat in Sidebar** runs Codex's existing new-chat command.
Escape, clicking outside, or changing chats closes the dropdown.

This targets the clicked chat without opening it, including chats without a label.
Remote-host and unsaved chats are excluded. The dropdown needs the v0.12.0 display
patch and a window reload after upgrading. The native Choose Repository picker
remains a fallback when the direct menu is unavailable.

Click the status-bar label for Auto, Pin current scope, Choose repositories, or
Clear labels. Pins deliberately override later reports. Clear pauses labels until
Auto is selected again. Existing pins are preserved on upgrade. Manual choices
apply to the workspace; reports and corrections are shared by conversation within
the same local Codex home.


Simple preferences
------------------

**Pin Manual Labels** defaults to on. It applies to both repository choices and
custom text. Turn it off if future manual choices should correct the label now
and allow newer scope reports to replace it. Old reports cannot immediately
undo that correction. Existing pins are unchanged when the setting changes; Use Automatic Labels still releases a pin explicitly.

Run **Codex Repo Companion: Set Repository Alias** from the Command Palette to
give a Git repository a readable name, such as `Context Suite Private`. Leave its
name blank to remove the alias. Aliases are saved in this workspace's
`codexRepoCompanion.repositoryAliases` setting, keyed by exact Git-root path.
They appear in labels and repository menus and are recognized in focus requests.
Original directory names and workspace names remain recognized too. Changing an
alias refreshes repository labels, including pinned ones, but never custom text.

Hover over a chat title or history row for its full repository paths and label
source: pinned, manually corrected, optional detected discussion, or agent report.
Custom text is identified separately without inventing a root.


Starred chats
-------------

Right-click a saved local chat in history or its open conversation title and choose
**Star Chat**. A star appears before its history/header title. Use **Unstar Chat**
to remove it. Stars remain visible when repository prefixes are hidden or labels
are cleared; they do not pin the repository label or change instruction routing.

Choose **Starred Chats...** in the same menu, or run **Codex Repo Companion: Open
Starred Chats**, to search starred conversations and open one in an editor tab.
Stars are saved per workspace and survive reloads. The picker uses current titles
from recent history, falling back to the title remembered when starred; if no title
was available, it shows the conversation ID. Deleted chats may need manual unstarring.
The original history order and saved conversation titles are unchanged. No AI call
or conversation message is sent when starring a chat.


Single-repository workspaces
----------------------------

With zero or one open local Git repository, the title/history popup shows a custom
label text field and Apply Label instead of repository search and repository rows.
Enter applies the label; invalid text keeps the popup open. Existing custom text
is prefilled. Automatic Labels, Clear Labels and New Chat in Sidebar remain available.

**Hide Redundant Repository Labels** defaults to on. An automatic label naming only
the sole open repository is hidden. Custom labels, manual choices, other-project
labels and multi-project labels stay visible. Nested independent Git repositories
count separately. Hiding is presentation only: the stored scope is retained.


Setup and project instructions
------------------------------

Run **Codex Repo Companion: Set Up Repo Companion** from the Command Palette,
or follow the link in Settings. A single page shows **Chat labels and stars** and
**Project instructions**, with current status and inline explanations. Choose
either or both. Buttons apply the stated action; leaving the page does not save
unfinished choices. The legacy **Set Up Routing** command opens this same page.

On first use, Companion asks: **Set up Codex Repo Companion?** Choose **Set Up** or
**Not Now**. One later startup offers **Set Up** or **Don't Ask Again**. Closing
both invitations also ends reminders. Opening setup ends reminders even if you
leave partway through. Existing dismissals and configured/off choices are kept on
upgrade. Dismissing the invitation never disables a feature.

**Automatically follow this workspace** is the default for project instructions.
The expandable repository list is a live preview, not a fixed selection. Names
are shown with full paths on hover. Adding or removing workspace folders updates
the saved scope; discovered Git repositories refresh the displayed list too.
Choose an optional separate shared AGENTS.md, or leave it blank to use project
instructions only. Custom folders and extra filenames are under **Advanced options**.
Existing custom scopes remain selected and are described as custom, not automatic.

**Enable Project Instructions** (or **Save Project Instructions**) adds/updates
Companion's marked section in global instructions and saves workspace settings.
Your other global rules are kept; the shared file is only read. Start a new Codex
chat afterward. **Turn Off** disables routing for this workspace while retaining
other instructions and saved choices.

**Enable Chat Labels** checks compatibility, backs up and updates the installed
Codex files, then shows **Reload Window** on the page. No terminal or separate
Node installation is needed for chat setup. Unsupported versions are left alone;
project instructions remain independently available. This integration is unofficial
and Codex updates may need a newer Companion version. Once enabled, Companion
reapplies the integration after updates only when the installed Codex version and
file checksums are supported. It never reloads your window automatically.
Compatibility is checked at startup and when Codex changes. Closing setup also
rechecks any eligible automatic repair. Setup updates its
status without replacing your unsaved choices. A status-bar warning opens setup
when chat labels need attention; **Check for Updates** helps you check for updates.
Project instructions remain available when the chat integration is unsupported.
Routing has a separate status that checks helper files and saved settings. Ready
means those checks passed; it cannot prove that an agent has read the instructions.
After saving, any remaining routing problem is shown with its details.

An automatic patch attempt runs at most once per installation and Companion
version. Failed or partial setups offer manual repair. With Silent Mode off,
previously enabled users receive a non-blocking failure reminder: **Open Setup**,
**Not Now**, or **Don't Ask Again for This Version**. Not Now or closing the message
allows one reminder on a later startup, then stops for that Codex version. Silent
Mode, unfocused windows and an open setup page suppress these notifications.
Successful automatic changes offer reload; setup and the status bar retain that
action when notifications are suppressed. Restoring Codex turns off automatic
reapplication, including when its files are already original. Failure explanations
remain visible after a failed patch rolls back. Routing readiness checks shared
files chosen by more specific project scopes too. Check for Updates uses VS Code's extension update controls; it does
not promise that a compatible release exists.

If setup was interrupted, try enabling chat labels again or restoring Codex.
If the error names a setup lock, close all Companion setup operations and remove
only that named lock before retrying. Leftover temporary files do not block a retry
and are preserved; the installer never treats their contents as originals.
Use **Remove chat integration > Restore Codex**, or the **Restore Codex** command,
before uninstalling Companion. Reload afterward. Chats and routing choices are kept.

The page follows VS Code's light, dark and high-contrast theme colours and supports
keyboard navigation. Only Browse opens a system file/folder picker. Errors and
success messages stay on the page. Refresh reloads settings and replaces unsaved
choices. External settings changes require refresh before saving.

There is no preview or reset feature. Uninstalling the extension alone does not
remove all settings, saved state, installed helpers or Codex modifications.

**Instruction Scope** limits those shared rules to explicit absolute directories.
Leave it empty to use the workspace folders, or choose a collection's parent
directory to cover its repositories. The most specific matching scope wins.
Equally specific workspaces must agree; conflicts stop routing instead of guessing.
**Instruction Fallback Names** adds ordered filenames such as `TEAM_GUIDE.md` after
the standard names. If you use custom fallback filenames in Codex, enter the same
names here; Companion does not modify or parse Codex's configuration file.

Each local workspace saves its scopes, main file, fallback names and enabled state
under `CODEX_HOME/repo-companion/routing-config`. An explicit target can use this
configuration even after the window closes. A closed workspace retains its last
observed settings; reopen it to change or disable its routing policy. An explicit
disabled state remains saved and is honored by both the helper and fallback.
Invalid settings stop routing until corrected, rather than retaining old enabled
rules. These records contain configuration paths, not chat contents.

The installed global guidance is deliberately short. On helper failure or
unavailability, it asks the agent to read `CODEX_HOME/repo-companion/fallback.md`.
That separate guide explains how to use saved JSON profiles, select the applicable
scope and discover shared/project instructions without Node. It is not loaded on
successful or explicitly disabled routing. Setup installs and repairs the guide.
Missing configuration uses ordinary project discovery. If the recovery guide is
also missing, the agent reports that and uses available project instructions.
Disabled routing never activates this fallback; independent user/project rules
still apply. Recovery needs local file access and remains best-effort guidance.

The agent consults the local read-only helper before project work and when focus
changes. It returns the main file first, followed by applicable parent/project
instruction paths. `AGENTS.override.md` takes precedence over `AGENTS.md` in each
directory. Target file paths let it discover deeper instructions without scanning
the repository. The helper checks configured fallback filenames directly; the
agent still follows the main file's own routing. Arbitrary Markdown links are not
treated as automatic includes.

Repository labels use stored roots, so aliases work. For custom text, run
**Codex Repo Companion: Associate Custom Label with Repository** while that chat
is open. Choose a repository, or No repository association to remove the link.
Custom text never silently inherits a previous repository. Its association persists
while editing that custom label; replacing it with repository/Auto/Clear and later
creating a new custom label does not reuse the old association.

Explicit user focus takes precedence over pinned labels. The helper accepts
`--target "<exact Git root>"` for that case and repeatable
`--file "<absolute file path>"` for nested instructions. Only the main agent may
use its verified local conversation identity. No instructions are automatically
injected into Codex, and no cwd, permissions or Source Control selection changes.
This is best-effort agent guidance, not a guarantee that files have been read.
Conflicting live or saved routing settings fail explicitly; the fallback must not
choose a winner. Without an explicit target, chat associations still require a live
window; saved configuration never guesses focus from old labels. No additional AI
service is used.


Agent guidance and cost
-----------------------

The installed global AGENTS guidance asks the main conversation agent to report
the latest task's exact Git roots once it identifies them, and again only when
scope changes. It excludes incidental project mentions, shared instructions,
unrelated active files and subagent reports. After resuming or compaction, one
idempotent report can restore certainty. Missing permissions or helper identity
must not interrupt the task. This is best-effort guidance, not a guaranteed hook.

The direct detector uses no AI tokens and starts no model or network request.
Agent reporting uses the existing conversation: its instructions and helper tool
call add context tokens, and the helper briefly starts Node and Git. There is no
separate classifier/API call. Exact additional tokens depend on the conversation
and have not been measured. Keep reporting tied to scope changes, not every tool.

Local work is bounded: at most 1 MiB per transcript read, incremental cached reads,
a 500-repository catalog, and session-change batches throttled to once per second.
The repository menu adds no polling or AI work. These are implementation bounds, not
a measured CPU/memory benchmark. See [architecture](architecture.md).


Setup and upgrade
-----------------

Build with Node.js 22+ and npm:

```powershell
npm ci
npm test
npm run package
code --install-extension .\dist\codex-repo-companion-1.1.4.vsix
```

The release targets Windows x64 and requires VS Code 1.137 or later. The package
command reads the version from package.json, checks the lockfile root and refuses
to overwrite an existing VSIX. Keep reserved artifacts; bump the root version and
update release documentation before packaging changed contents. The original icon
can be rebuilt on Windows with `tools/render-icon.ps1`.

After installing, use **Set Up Repo Companion** from Settings or the Command
Palette. For terminal-based setup, `node tools/install-agent-helper.cjs` remains
available from this checkout after compilation.

Helper setup installs compiled files under `CODEX_HOME/repo-companion` (normally
`~/.codex/repo-companion`) and updates only its marked block in the effective
global AGENTS file, preserving unrelated instructions and the original backup.
Node and Git must be available to the agent. No additional model or service runs.

After upgrading an existing setup to 1.0.6, open **Set Up Repo Companion** and
click **Save Project Instructions** to replace the older managed block and install
the recovery guide. Start a new chat to load the shorter instructions. Updating
the extension alone does not rewrite global instructions or enable routing.

The display installer and bridge are included in the extension package. Setup
provides the normal enable/restore flow. For development or troubleshooting, the
command-line installer is also available. Locate the installed extension using `code --locate-extension openai.chatgpt`, then run:

```powershell
node tools/patch-codex.cjs check "<Codex extension directory>"
node tools/patch-codex.cjs apply "<Codex extension directory>"
```

The patch supports Codex 26.908.40401 with exact checksums for three bundles.
It preserves byte-for-byte originals and rejects unknown versions or edits.
The v0.12.0 display patch adds direct repository menus to history rows and chat titles and upgrades recognized
older patches while preserving their originals. Previously enabled integrations are
reapplied automatically after supported updates.
Version 1.1.4 bundles the existing v0.12.0 display patch; existing patched users
do not need to apply a different patch.
Upgrade removes unpinned tentative directory labels before publishing labels or
routing metadata. Manual labels and pins remain intact. The version advances from
0.12.0 to 1.0.0 to adopt the shared version-number format, not a breaking API change.
Reload the window when convenient after installation. Setup does not close or
reload your windows. Without the patch, saved editor chats can still be assigned;
display prefixes and sidebar identity require the bridge.

Upgrading from v0.4.0 removes Source Control commands, settings, and navigation.
If its optional VS Code workbench patch was installed, restore it from an elevated
terminal when necessary (Program Files requires administrator rights):

```powershell
node tools/patch-vscode.cjs restore "<VS Code resources/app directory>"
```

The tool is retained solely to check or restore that retired patch. It rejects
unknown edits and cannot apply the patch again. Reload restores the original
workbench in each window. The Codex display patch remains separate.


Switching from a local build
---------------------------

The Marketplace build is `keenanselbee.codex-repo-companion`. Earlier development
builds use `local-tools.codex-repo-companion`. VS Code treats these as different
extensions; settings with the `codexRepoCompanion` prefix and the Codex-home helper
files retain their paths, but saved chat labels, stars and reminder state do not
automatically transfer to the new identity.

Before switching, preserve a backup of your VS Code profile while VS Code is
closed. For a normal Windows installation this is `%APPDATA%\Code\User`; portable
and named profiles can use different locations. The relevant state lives in
`globalStorage/state.vscdb`, `workspaceStorage/*/state.vscdb`, user/profile settings
and any workspace settings. Do not edit the live databases or copy an entire
database over another profile to transfer a single extension's state.

Disable the old local build before enabling the new one, so only one copy manages
labels and the patch. Recreate any saved labels and stars you need, or retain the
old disabled build and profile backup for a deliberate state transfer. The new
extension can recognise an existing supported Codex patch; restoration is not
required just to switch Companion identities. This release does not migrate or
delete the old extension's private storage automatically.


Corrections and settings
------------------------

For a user-confirmed correction to an older chat, run from the project directory:

```powershell
node tools/correct-chat-scope.cjs "<saved conversation UUID>" "<current project Git root>"
```

Corrections are separate from agent reports under `repo-companion/corrections`.
A newer agent report takes over automatically in Auto mode; pins and Clear still
win. Reporting never changes the agent's own conversation identity.

- `codexRepoCompanion.detectChatFocus`: detect clear project switches directly
  from local user messages; defaults to false. Disable to use only agent reports,
  corrections, and manual choices.
- `codexRepoCompanion.showTabPrefix`: show history, sidebar, and tab labels;
  defaults to true.
- `codexRepoCompanion.silentMode`: log automatic errors without popups;
  defaults to true. Explicit command failures still show feedback.

**Show Integration Status** shows scope source, bridge availability, and counts
in **Output > Codex Repo Companion**. Scope-change logs include identifiers and
repository roots, never chat text. **Open Saved Codex Chat** can recover a generic
editor tab using up to 200 recent index entries from at most the last 1 MiB of
`session_index.jsonl`. It does not scan transcripts or modify the index.


Verification and removal
------------------------

```powershell
npm test
npm run test:integration
node tools/verify-patch.cjs "<Codex extension directory>"
```

Integration uses isolated profiles, disposable repositories, real VS Code/Git,
and fixture conversations. It verifies labels, latest-scope changes, persistence,
sidebar history, and absence of Source Control selection changes. It does not
exercise an authenticated Codex conversation. Scratch data stays in `.codex-temp`.

Before uninstalling, run **Codex Repo Companion: Restore Codex** and reload.
The development command is also available:

```powershell
node tools/patch-codex.cjs restore "<Codex extension directory>"
```

Reload after restoring. Remove the companion through Extensions. Remove its marked
instruction block to stop agent reporting. Keep the helper metadata while you want
to preserve reports or corrections. See [architecture](architecture.md) and
[verification status](verification.md) for details.
