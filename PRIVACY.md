Privacy
========

Codex Repo Companion runs locally and has no telemetry, advertising or accounts.
It does not send chats, repository contents or instruction files to its own server
or another external service.

It reads local Codex conversation identifiers and titles to identify chats and
show saved or starred chats. If you enable Detect Chat Focus, it also reads local
user messages to identify clearly named projects. That option is off by default.
The message detector does not call an AI service.

The extension saves labels, stars, settings and reminder choices in VS Code's
extension storage. Its helper saves repository paths and routing configuration
under your Codex home. Routing setup adds a marked section to your global Codex
instructions and backs up their original contents. Chat integration setup backs
up and modifies supported local Codex files. Diagnostic logs may contain repository
paths and conversation identifiers, but do not include chat message text.

Codex itself continues to operate under OpenAI's terms and privacy practices.
VS Code handles extension downloads and update checks. Opening a help link visits
GitHub. Those services have their own privacy policies.

Before uninstalling, restore the chat integration from setup and reload VS Code.
Uninstalling Companion does not automatically erase all saved settings, helper
files or the marked global instruction section. See [advanced help](docs/advanced.md)
for removal details. Only include information you want to share when reporting
an issue publicly.
