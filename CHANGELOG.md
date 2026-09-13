Release Notes
=============

Unreleased
----------

- Keep repository labels on one line with an ellipsis and full-label hover text,
  so long labels do not increase chat row height.
- Add Navigator-only chat names with original-title lookup, search and reset.
- Keep event delivery verification diagnostic so new or idle chats never block Navigator.
- Require installed, enabled and trusted activity hooks before showing chats. Remove setup bypasses,
  put hooks first in setup, and explain missing or broken setup on return.

- Add explicit seven-day trial admission and a licence screen for the planned $5 CAD one-time release. Gate Navigator actions on access while preserving data, Codex tasks and setup removal.
- Keep commercial policy, Polar validation and protected storage in an independent private checkout. Public contracts, interface code and component tests remain available for inspection.
- Add cross-window storage coordination, daily paid validation, bounded offline grace and explicit recovery without another trial.
- Verify release archives against runtime file hashes and record both repository revisions. Production configuration and authenticated commerce acceptance remain pending; no commercial release is published yet.
- Remember the responsive layout across reloads, including near height thresholds. Ignore hidden startup measurements and refit columns to the restored panel width.

1.5.0
-----

- Shorten Clear Labels to Clear in the chat context menu and label behaviour picker.
- Remove the Use Automatic Labels shortcut from the chat context menu; Auto remains under Label Behaviour.


1.4.9
-----

- Wait for Git's initial repository discovery before assigning automatic colours. Use a stable light/dark baseline so startup timing does not change regenerated defaults; saved colours and custom overrides are preserved.


1.4.8
-----

- Open the colour picker directly when clicking a repository in Repository Colours.


1.4.7
-----

- Place the pin directly after the label for pinned, unstarred chats. Reveal the star after it on hover or keyboard focus; starred chats keep the star before the pin.


1.4.6
-----

- Display cached chat titles and ordering, or the local index, before live metadata and activity checks finish. Keep cached chats usable if refresh fails.
- Hide empty star/pin controls after mouse interaction while preserving keyboard access. Match the star hit area to the pin without moving the star glyph.
- Add the welcome-screen tip for moving Navigator above Codex, and stop using obsolete setup flags to hide the welcome.


1.4.5
-----

- Add Highlight Duration Seconds (1–3600, default 180). Changes apply immediately to both highlight modes and keep each chat's original visit time.


1.4.4
-----

- Replace the panel-confined HTML context menu with VS Code's native menu. Choose Repository opens a searchable workspace repository picker; Hide Chat remains last.
- Use native context menus for repository colour actions and remove the Repository Colours instruction line.
- Make a second click on the same swatch apply and close the colour picker. Keep controls next to a consistently spaced palette, and show the chat title in its heading.
- Keep titles on one line with an ellipsis when goal and activity indicators appear together, preserving full text in tooltips.
- Move stars up another pixel. Offer Clear with a neutral preview when a chat has no repository colour to inherit, instead of suggesting an unsaved blue colour.


1.4.3
-----

- Show the activity spinner immediately after an active goal icon, even between chat turns or without activity hooks. A working turn and active goal share one spinner. Paused goals do not animate unless the chat is working.


1.4.2
-----

- Separate Automatic labels from Project instructions with independent setup, managed guidance and an agent-report preference. Turning reports off keeps existing labels.
- Add a first-use setup screen with Continue Without Setup and a dismissible activity reminder. Remove the separate startup invitation.
- Simplify setup into three compact sections with details collapsed and actions matched to activity readiness. Show arrangement instructions only after Arrange Navigator is clicked.


1.4.1
-----

- Add a themed chat context menu listing current workspace repositories directly, with Custom Label and conditional custom-label association.
- Add Repository Colours to the top menu, opening an in-panel repository list with right-click colour editing and return navigation.
- Clarify how setup enables agent repository reporting for automatic labels, independently of activity hooks. Remove the duplicate Set Up Activity Indicators entry from the top menu.


1.4.0
-----

- Add a pin control after the star. Pinned chats retain their list position, bypass the 24-hour filter, and remain available beyond the recent-history window.
- Rename Pin Manual Labels to Keep Manual Labels Fixed and clarify that fixed labels do not pin chat position. Existing fixed labels remain; the renamed preference applies to future choices.


1.3.9
-----

- Add Highlight Recently Viewed Chats (on by default) and Highlight Only Last Viewed Chat (off by default). Apply changes without reloading, preserving fade timers and the hover outline.


1.3.8
-----

- Draw the complete themed hover border above chat contents so bottom separators cannot obscure its lower edge. Keep spacing and fading backgrounds unchanged.


1.3.7
-----

- Tint visited-chat backgrounds with the label colour, preserving independent three-minute fades and a neutral fallback for uncoloured chats.


1.3.6
-----

- Replace the unreliable Move View to Top action with Arrange Navigator and drag instructions.
- Give Check Status a timestamped result and next step; preserve a stable event cutoff when the installation timestamp is missing.
- Simplify hook review instructions to trust all Navigator hooks.


1.3.5
-----

- Brighten visited-chat backgrounds and retain an independent three-minute fade per chat. Revisiting refreshes only that chat; opening another leaves earlier timers running.

1.3.4
-----

- Add Hide Chat and Restore Hidden Chats without modifying Codex conversations.
- Default to chats with interaction recency within 24 hours; keep unknown recency visible and allow the filter to be disabled.
- Fade the last Navigator selection background over three minutes and outline hovered chats.

1.3.3
-----

- Keep compact layouts longer: raise height thresholds to 180px and 340px, retaining font scaling and the 12px transition buffer.
- Add Move View to Top in setup using native Move View Up; custom layouts may need repeated clicks.

1.3.2
-----

- Move label stars up one pixel and add Extension Settings at the end of Navigator's overflow actions.
- Shorten the extension page around the main features and setup, with detailed hook review and troubleshooting linked.
- Update repository, homepage and issue links to keenanselbee/codex-navigator.

1.3.1
-----

- Complete Navigator branding in the fallback colour picker and remaining internal identifiers. Preserve the already packaged 1.3.0 artifact.


1.3.0 - Codex Navigator
----------------------

- Rename the product and extension identity to Codex Navigator (`keenanselbee.codex-navigator`), with new `codexNavigator` commands/settings and `codex-navigator` helper paths.
- Remove Codex patch application, automatic reapplication, injected bridge assets, patch setup and compatibility code. No backward compatibility or data migration is provided.
- Replace patch setup with hook installation, Codex-owned trust review and verification from real lifecycle events. Keep the Navigator sidebar, optional focus detection and project routing.
- Preserve routing drafts during activity checks; explain Node.js, trust and delivery separately. Setup never grants hook trust or submits a test prompt.
- Adopt a source-available license: official releases may be installed and used, and source inspected; reuse, modification and redistribution require Keenan Selbee's written permission. Earlier MIT grants remain unchanged.
- Existing Repo Companion installations are separate and are not uninstalled, restored or upgraded by this release.


1.2.7
-----

- Follow Codex's native recency order, independently of activity, completion and display metadata. Retain the cached order during unavailable reads and across reloads.
- Preserve the whole-content pointer hold while continuing live indicator updates.
- Clarify that agents report explicit repository switches during discussion-only or acknowledgement-only requests, respecting explicit no-write restrictions. Refresh installed guidance through Save Project Instructions.
- Link optional Detect Chat Focus from setup; accept small known cue typos and reject quoted examples, ambiguity and explicit no-write requests. Existing opt-in, Auto, Pin and None choices remain unchanged.


1.2.6
-----

- Keep chat order fixed while the pointer is anywhere inside Companion's content, including blank space and controls. Leaving the chat grid alone no longer releases the hold.
- Continue updating indicators while held; apply the latest order after leaving, respecting keyboard focus.


1.2.5
-----

- Default new repository selections to Auto in multi-repository workspaces when no explicit pinning preference is configured; preserve existing pins and custom labels.
- Assign stable, visually separated automatic repository colours, with theme contrast adjustment and no reshuffling when repositories are added.
- Add Automatic, Custom and No colour repository choices; preserve custom hex values and existing chat overrides/blends.


1.2.4
-----

- Move stars beside the chat/repository label; reveal unstarred outlines on hover or keyboard focus and toggle them inline.
- Remove Companion's star context-menu action; keep filled stars visible and expose outlines for touch input.
- Thin the 10px activity spinner to a 1.5px stroke.


1.2.3
-----

- Align stars, goal controls and activity indicators; reduce the spinner to 10px.
- Add thin theme-aware separators between chat cells without changing their fit.
- Show visible chats' goals with circle pause/play controls, objective tooltips and separate turn activity.
- Route explicit pause/resume through the owning runtime, with native Codex fallback when unavailable. Goal display is verified; authenticated control acceptance remains pending.


1.2.2
-----

- Let all sidebar formats add readable columns as width grows.
- Hide unstarred stars and remove the separate title hover background; use an 11px spinner with a thicker stroke.
- Choose colours inside Companion with presets, extra shades, recent/repository colours, a spectrum, hex input and a preview.
- Add ready dots backed by local completion events; acknowledge them when opening chats through Companion.
- Add bounded transcript fallback for older sessions and experimental read-only runtime status for waiting/error indicators when the owning server is reachable.
- Add bounded hook diagnostics. Runtime connection coverage and native Codex selection tracking remain limited.


1.2.1
--------

- Fit as many complete chats as available space permits, preserving A/B/C layouts and minimum spacing, wrapping titles, and removing the scrollbar and Show more control.
- Order chats left to right by recent recorded activity, with Codex index timestamps as the fallback; defer reordering during pointer/keyboard interaction.
- Move Companion chat actions into VS Code's native right-click menu, also available through Shift+F10/Menu key.
- Keep actions bound to the clicked chat and remove the custom menu confined to the sidebar.
- Remove row ellipsis buttons; append a larger coloured star to each chat name and place the optional spinner after it.
- Add an opt-in activity prototype using Codex hooks, with local status files, stale-signal handling and setup/removal that preserves other hooks. Live authenticated IDE acceptance remains pending.


1.2.0
--------

- Rename the sidebar heading to Companion; retain Codex Repo Companion as the extension name and identity.
- Let view height drive list, two-line and compact layouts, with width-dependent columns and more chats when room permits.
- Move search and New Chat into the native heading, with secondary actions in its menu.
- Preserve keyboard targets across resize, retain search/filter state, and keep row menus within the view.
- Keep chat selection on the existing Codex URI handler; live working status remains pending.


1.1.9
--------

- Add a Companion-owned sidebar showing eight recent local chats, with search, starred filtering and more results on demand.
- Colour label text and stars without colour dots; reuse existing label, scope and colour controls.
- Open saved chats through Codex's existing URI handler, without adding a Codex patch.
- Keep the existing optional display integration and its restoration controls separate from the sidebar prototype.


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
