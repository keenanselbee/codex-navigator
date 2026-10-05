<p align="center"><img src="https://raw.githubusercontent.com/keenanselbee/codex-navigator/main/images/icon-small.png" alt="Codex Navigator icon" width="104"></p>

<h2 align="center">Codex Navigator</h2>

<p align="center"><em>Your Codex chats and accounts, in one place.</em></p>

<p align="center">An independent extension. Not affiliated with or endorsed by OpenAI.</p>

<p align="center">Explore more of my work at <a href="https://keenanselbee.com">keenanselbee.com</a>.</p>

---

Find conversations by project, switch between saved accounts, and see their last known usage, all from a compact sidebar. Make it yours with custom names, labels, colours and favourites.

It was built to make development in a multi-repository workspace more enjoyable, with less time spent hunting for conversations and more time focused on your work.

<p align="center"><img src="https://raw.githubusercontent.com/keenanselbee/codex-navigator/main/images/navigator-demo.gif" alt="Animated demonstration of Codex Navigator chats, colours, goals and saved accounts" width="100%"></p>

<p align="center">Organise your chats, personalise project colours and switch saved accounts.<br>
Recent chat highlights fade over time, showing which conversations you visited most recently.</p>

<h3 align="center">A layout that fits your workspace</h3>

<p align="center">Columns (left) &middot; List (right)</p>

<p align="center"><a href="https://raw.githubusercontent.com/keenanselbee/codex-navigator/main/images/adaptive-layouts.png"><img src="https://raw.githubusercontent.com/keenanselbee/codex-navigator/main/images/adaptive-layouts.png" alt="Codex Navigator in columns on the left and a list on the right, showing the same conversations with repository labels, colours and activity indicators" width="100%"></a></p>

<p align="center">Navigator automatically adapts to the available panel space, switching between compact grids, columns and a list. Rows gently expand to use spare height while keeping text readable.</p>

---

Features
--------

- **Keep your Codex accounts ready:** Save sign-ins securely on your device, give accounts recognisable names, and switch with a click and window reload. See last known usage, plan and reset details before choosing an account. [Supported environments and limits](https://github.com/keenanselbee/codex-navigator/blob/main/docs/advanced.md#account-switching).
- **Recognise each project:** Give chats repository labels or custom labels. Projects get distinct, repeatable automatic colours, and you can choose your own.
- **Switch conversations quickly:** Browse and search saved chats from a sidebar that adapts to your available space. The order stays steady while you interact with the list.
- **Keep favourites close:** Star chats to filter favourites. Pin a chat to hold its position and keep it visible beyond the default 24-hour recency filter.
- **Keep your organisation across workspaces:** Use the shared Default chat profile, or choose separate profiles for work, school or personal projects. Optionally show only chats associated with the current workspace, plus unassigned chats.
- **Make the list yours:** Rename chats while keeping the original Codex name available. Hide conversations you no longer need and restore them without deleting anything.
- **See activity and goals:** See working, ready, waiting and error states where Codex supplies them. Pause or resume goals from Navigator, where supported.
- **Hear when Codex needs you:** Get sounds when responses finish or chats need an answer or approval, even while working in VS Code. Question notifications appear by default; completion banners appear when VS Code is unfocused. On Windows, click a notification to open its chat. Keep Navigator visible for monitoring.
- **Spot recent visits:** Chats opened through Navigator briefly glow in their label colour. Adjust the fade, highlight only the last visited chat, or turn highlights off.

---

Get started
-----------

1. Install Navigator and open its view. Choose **Try for free** or **Activate Licence**. On macOS/Linux, follow the storage check first: fully quit and reopen VS Code when prompted.
2. Choose **Set Up Codex Navigator**, then **Install Hooks**.
3. Choose **Open Hook Review**, type `/hooks` in the Codex terminal, and review and trust all Navigator hooks.
4. In setup, enable **Account Switching** to save sign-ins, **Automatic Labels** to follow your projects, and **Project Instructions** to help Codex find repository rules, as needed. Start a new Codex chat after enabling labels or instructions.

Navigator shows your chats once hooks are installed, enabled and trusted. Later hook problems keep your chats available, with a compact notice when attention is needed.

**Tip:** Drag the Navigator heading above the Codex heading to move it to the top.

---

Settings
--------

Right-click a chat for naming and label options. Matching custom labels share a colour within the chat profile; choose Chat Colour to change the label colour or override just one chat. Open the **...** menu for **Chat Profile**, the workspace filter, **Repository Colours**, **Restore Hidden Chats** and **Extension Settings**.

- **Automatic labels:** Enable this option in setup, then start a new Codex chat. Labels follow the repositories the agent reports; you can always choose a repository yourself.
- **Chat history:** Turn off **Recent Chats Only** to include older chats.
- **New Chat button:** Enable **Show New Chat Button** to add the optional + button to Navigator's toolbar.
- **Chat tooltips:** Enable **Show Chat Tooltips** for chat details on hover. Off by default.
- **Notifications:** Set separate sound and desktop rules for finished responses and questions: Off, Always, Only when VS Code is focused, or Only when VS Code is unfocused. Use **Codex Navigator: Test Notification** to preview delivery. Sound preference remains installed Codex audio, your platform's notification sound, then a bundled Balafon chime.
- **Custom labels and repositories:** Choose Repository keeps your custom label. Choose No repository association to keep a custom label without linking it to a project.
- **Visit highlights:** Choose which visited chats glow and how long the highlight lasts.
- **Project instructions:** Optionally help Codex find your repository's AGENTS.md and shared rules.

---

Trial and licence
-----------------

Try Codex Navigator free for **7 days**, then pay **$5 CAD once**. No card is required for the trial.

One active installation, transferable between devices. Includes all future updates.

Open **License** from Navigator's menu to activate or transfer your licence. Paid access checks daily and allows up to 30 days offline after successful validation. If access expires, Navigator preserves your data. Codex chats and tasks continue independently.

---

Requirements and support
------------------------

- Desktop VS Code **1.137 or newer**, the OpenAI Codex extension, and Node.js available on PATH.
- **Windows x64 is tested.** macOS and Linux on x64 or ARM64 have best-effort support; native testing is pending. Windows ARM64 is unverified.
- Remote SSH, WSL, containers and browser VS Code are outside the current support scope.

Activity and goal controls depend on the Codex runtime. A ready indicator means a turn finished, not necessarily that it succeeded. Visit highlights track chats opened through Navigator.

[Setup and troubleshooting](https://github.com/keenanselbee/codex-navigator/blob/main/docs/advanced.md) · [Privacy and local data](https://github.com/keenanselbee/codex-navigator/blob/main/PRIVACY.md) · [Report an issue](https://github.com/keenanselbee/codex-navigator/issues)

---

Selected source code and component tests are available for inspection. Commercial licensing components remain private. Source reuse, modification and redistribution require written permission. [Licence terms](https://github.com/keenanselbee/codex-navigator/blob/main/LICENSE.md).

Made by Keenan Selbee.
