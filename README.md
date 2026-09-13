Codex Repo Companion
====================

Keep your Codex chats organised and help Codex find the right project instructions.
Free and open source under the MIT license. Made by Keenan Selbee.

- **Label chats** by project, or give them your own label.
- **Star favourites** so they are easy to find again.
- **Use project instructions** as you move between repositories, with an optional
  shared AGENTS.md for your workspace.


Get started
-----------

1. Install Codex Repo Companion alongside the OpenAI Codex extension.
2. Open a local project or workspace and choose **Set Up** when prompted. You can
   also run **Codex Repo Companion: Set Up Repo Companion** from the Command Palette.
3. Enable **Chat labels and stars**, **Project instructions**, or both.

Right-click a saved chat or its title to choose a project, add a custom label,
or star it. With a single project open, custom labels come first.

For project instructions, setup follows the folders in your workspace. Choose a
shared AGENTS.md if you want common rules across projects. Start a new Codex chat
after enabling instructions. Automatic labels rely on Codex reporting its project;
you can always choose a label yourself.


Compatibility
-------------

Requires VS Code 1.137 or later on Windows x64. Instruction routing needs Node.js and Git available
to Codex. It works independently of the chat integration and guides Codex to the
right files; it cannot guarantee that the agent reads them.

Chat labels and stars use an optional, unofficial modification to the installed
Codex extension. Setup checks compatibility and keeps backups. Supported updates
are reapplied automatically after you enable the feature; other versions may need
a Companion update. **Before uninstalling, run Restore Codex from setup and reload.**

Before reporting a Codex problem to OpenAI, restore Codex from setup, reload VS Code,
and check whether it still happens. Simply disabling Companion does not restore Codex.

Displaying labels and stars does not use AI tokens. Project instruction routing is
separate and can add instructions to the model's context.

Routing setup adds a small section to your global Codex instructions and keeps your
other rules. The optional shared file is only read.


Help and privacy
----------------

[Report a problem](https://github.com/keenanselbee/codex-repo-companion/issues)
| [Advanced help](docs/advanced.md)
| [Release notes](CHANGELOG.md)

Companion sends no chat content to an external service and has no telemetry.
The optional message-based project detector reads local chat messages when enabled.
[Privacy details](PRIVACY.md) | [MIT license](LICENSE.md)

Contributions and upstream integration are welcome. Third-party software and
materials retain their own licenses and terms; MIT covers Companion's own code,
not permission to modify or redistribute OpenAI Codex.

Independent project; not affiliated with or endorsed by OpenAI or Microsoft.
