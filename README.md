Codex Navigator
===============

Find and switch between Codex chats in a compact VS Code sidebar. Saved chats
appear at startup while live metadata refreshes in the background. Give chats
clear project labels, colour your repositories and star the ones you return to.
Made by Keenan Selbee.

What it does
------------

- **Chats that fit your space.** Resize the sidebar to show more chats. Names wrap,
  width adds columns, and height chooses the layout.
- **Recent chats within reach.** Click to open a chat, search, or filter favourites.
  Chats follow Codex's recency order, left to right and then down. The order holds
  steady while you hover or use the keyboard in the list. Recent Chats Only is on
  by default, filtering known interaction recency to the last 24 hours.
- **Labels, colours and stars.** Repositories get distinct automatic colours.
  Right-click a chat for Choose Repository, Custom Label or
  Chat Colour. Choose Repository opens a searchable list of all workspace repos.
  Open Repository Colours from the top menu to edit
  repository colours in Navigator. Hover or focus beside a label to reveal its star. Hide Chat removes
  a chat from Navigator; Restore Hidden Chats in the overflow menu brings it back.
- **Pinned chats.** Hover beside a label to reveal the pin control.
  Pins hold its list position and bypass the 24-hour filter. Unpin to return
  it to normal ordering. Fixed labels are a separate preference.
- **Activity at a glance.** Required local hooks show a working spinner and a blue ready
  dot. Supported runtime signals also show waiting in yellow and errors in red.
- **Goal controls.** A circle with pause bars shows a running goal; a play triangle
  shows a paused goal. Running goals also show a spinner to the right. Click to
  pause or resume, where supported. With goal and activity indicators together,
  the title stays on one line with an ellipsis; hover for its full text.
- **Help across repositories.** Optional project instruction routing helps Codex
  find relevant AGENTS.md files and shared rules. Optional Detect Chat Focus helps
  labels follow explicit repository switches during conversation.

Chats viewed through Navigator each get a background tinted by their label colour that fades over
three minutes by default. Set **Highlight Duration Seconds** in Extension Settings
to choose 1?3600 seconds. Other chats keep their own timers; revisiting a chat refreshes
its highlight. In Extension Settings, turn off **Highlight Recently Viewed Chats**
or enable **Highlight Only Last Viewed Chat** (off by default). Hovering shows a thin outline. This does not track switches made inside Codex itself.

Get started
-----------

1. Install Codex Navigator alongside the OpenAI Codex extension.
2. Open Navigator and choose **Start 7-Day Trial** or **Activate Licence**.
   Then choose **Set Up Codex Navigator**. Setup is also available from the Command Palette.
3. Set up the required activity hooks: select **Install Hooks**, then **Open Hook Review**.
   Type `/hooks` in the Codex terminal and review and trust all Navigator hooks.
4. Reload the window and send a normal chat message. Setup confirms when it
   receives an activity event.

The review terminal opens in the right workspace and Codex home automatically;
no separate Codex CLI installation or directory command is needed. Activity hooks
require Node.js on PATH. Navigator shows chats once hooks are installed, enabled,
trusted and have delivered an event. If those checks fail later, setup returns
with the next step. Automatic labels and project instructions are optional.

Choose **Arrange Navigator** in setup, then drag its heading above Codex and resize
the divider. The view shows as many complete chats as fit, without a scrollbar or
Show more button. Full names are available in tooltips when very long text is cut
short. Right-click options also work with Shift+F10 or the Menu key.

Help and requirements
---------------------

Supports local Windows x64 with VS Code 1.137 or newer and Codex. Navigator does
not modify Codex or VS Code files. Activity and goal controls depend on the Codex
runtime; a ready dot means a turn finished, not necessarily that it succeeded.
Project instruction routing complements Codex's own discovery and makes no extra
AI calls; the agent still needs to read and follow the instructions.

See [setup, troubleshooting and advanced options](docs/advanced.md), including
removing hooks and replacing an older Repo Companion installation. Old settings
and data are not imported. [Privacy and local data](PRIVACY.md) explains storage.

The next commercial release offers a **7-day trial**, then **$5 CAD once** with
all future updates and one active installation. Transfer it by deactivating the
old installation first. Paid access checks daily, with up to 30 days offline
after successful validation. Open **License** from Navigator's menu to manage it.
After expiry, Navigator shows the licence screen; your saved data and Codex chats
remain intact. Existing releases retain their original terms. Commercial checkout
and release verification are still in progress.

Published source and component tests are available for inspection;
source reuse, modification and redistribution require written permission. See
[LICENSE.md](LICENSE.md). This independent project is not affiliated with or
endorsed by OpenAI or Microsoft.

Maintainer build and test instructions are in [advanced help](docs/advanced.md).


Automatic repository labels
---------------------------

In setup, enable **Automatic labels**, then start a new Codex chat. This adds
only the reporting guidance and local helper; it does not enable project instruction
routing or activity hooks. Auto labels follow the repositories the agent reports. Existing chats may not have loaded that guidance. Optional
**Detect Chat Focus** can recognise explicit repository switches when an agent
misses a report. Fixed labels remain unchanged until you select Auto under Label Behaviour.
