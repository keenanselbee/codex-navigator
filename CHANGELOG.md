Release Notes
=============

1.1.8
--------

- Clarify that instruction routing complements Codex's built-in discovery for work across repositories.
- Describe lightweight local helpers without additional AI calls, while retaining instruction-context and agent-compliance limits.


1.1.7
--------

- Starred chats show one coloured star instead of a colour dot and a separate star.
- Unstarred chats retain colour dots; stars without an assigned colour follow the theme.


1.1.6
--------

- Choose chat and repository colours using eight presets, a colour picker or hex input.
- Inherit repository colours automatically, blending multiple repositories equally; manual chat colours take precedence.
- Show colour dots in chat history and headers without changing text colours or native editor tab titles.
- Upgrade the optional display patch while retaining verified originals and restoration.


1.1.5
--------

- Adopt the MIT license and welcome contributions and upstream integration.
- Highlight the optional Codex modification in setup, with restore-before-reporting guidance.
- Clarify that displaying labels and stars uses no AI tokens; instruction routing can add context.


1.1.4
--------

- Resume eligible automatic chat integration repairs when setup closes.
- Report routing readiness accurately after saving project instructions, with details when attention is needed.


1.1.3
--------

- Keep automatic patching off after restoring Codex, including when its files are already original.
- Show the explanation when an automatic patch needs attention.
- Check shared instructions selected by more specific project scopes before reporting Ready.
- Correct the privacy heading so Git's conflict-marker check accepts it.


1.1.2
-----

- Prepare the Marketplace identity `keenanselbee.codex-repo-companion` and add an icon.
- Make update searches follow the installed extension's identity.
- Require VS Code 1.137 or later on Windows x64, matching the verified integration.
- Protect existing release packages from accidental overwriting.

The earlier `local-tools` builds have a separate identity and saved chat state.
See [switching from a local build](docs/advanced.md#switching-from-a-local-build)
before installing this build alongside one.


1.1.1
-----

- Shorten the extension page and move technical help to a separate guide.
- Add free-use licensing, privacy details and support links.
- Repair development dependency metadata and prepare Windows x64 packaging.


1.1.0
-----

- Reapply supported Codex integrations automatically after updates for existing users.
- Add quiet, version-specific failure reminders and an update check.
- Check project instruction routing separately from the chat integration.


1.0.9
-----

- Improve interrupted patch recovery and show Codex compatibility changes.
- Preserve setup choices when settings change elsewhere.

Earlier local versions and their verification records are retained in
[development history](docs/verification.md).
