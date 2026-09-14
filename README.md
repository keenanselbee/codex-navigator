Codex Navigator
===============

Codex Navigator is an independent product, not affiliated with or endorsed by
OpenAI or Microsoft.

Your Codex chats, at a glance. Find and switch between saved chats in a compact
VS Code sidebar, with project labels, colours and activity indicators to help
you pick up where you left off.


Make your chats easier to find
-----------------------------

- **Browse and search.** Saved chats appear at startup. Resize Navigator to fit
  your workspace; the layout adjusts automatically. The order stays steady while
  you interact with the list.
- **Recognise each project.** Give chats repository labels or custom labels.
  Repositories in a multi-repository workspace get distinct, repeatable automatic
  colours, and you can choose your own.
- **Keep favourites close.** Star chats to filter favourites. Pin a chat to hold
  its position and keep it visible beyond the default 24-hour recency filter.
- **Make the list yours.** Rename chats within Navigator while keeping the
  original Codex name available. Hide chats you no longer need and restore them
  from the menu without deleting the conversations.
- **See activity and goals.** Indicators show working, ready, waiting and error
  states where Codex supplies them. Pause or resume goals directly from Navigator,
  where supported.
- **Spot recent visits.** Chats opened through Navigator briefly glow in their
  label colour. Adjust the fade duration, highlight only the last visited chat,
  or turn highlights off.

Right-click a chat for naming and label options. Use the **...** menu for
**Repository Colours**, **Restore Hidden Chats** and **Extension Settings**.
Turn off **Recent Chats Only** in Settings to include older chats in Navigator's
saved history list.

Settings are grouped by Chat list, Labels and colours, Project instructions and
Advanced. **Highlight Mode** chooses which visited chats glow; **Highlight
Duration Seconds** controls how long they fade.


Get started
-----------

Requires desktop VS Code 1.137 or newer, the OpenAI Codex extension, and Node.js
available on PATH.

1. Install Navigator and open its view. Choose **Try for free** or
   **Activate Licence**. On macOS/Linux, follow the storage check first: fully
   quit and reopen VS Code when prompted.
2. Choose **Set Up Codex Navigator**, then **Install Hooks**.
3. Choose **Open Hook Review**, type `/hooks` in the Codex terminal, and review
   and trust all Navigator hooks.

Navigator shows your chats once hooks are installed, enabled and trusted.
If setup needs attention later, it explains the next step. The review terminal
uses the Codex extension's bundled CLI; no separate Codex CLI installation is
needed.

**Tip:** Drag the Navigator heading above the Codex heading to move it to the top.

Want labels to follow your conversations? Enable **Automatic labels** in setup,
then start a new Codex chat. Labels follow the repositories the agent reports;
you can always choose a repository yourself. Optional **Project instructions**
help Codex find your repository's AGENTS.md and shared rules. Both options are
independent of the required activity hooks.


Trial and licence
-----------------

Try Codex Navigator free for **7 days**, then pay **$5 CAD once**.
One active installation, transferable between devices. Includes all
future updates. No card is required for the trial.

Open **License** from Navigator's menu to activate or transfer your licence.
Paid access checks daily and allows up to 30 days offline after successful
validation. If access expires, Navigator shows the licence screen and preserves
your data. Codex chats and tasks continue independently.

Support and privacy
-------------------

**Windows x64 is tested.** macOS and Linux on x64 or ARM64 have best-effort
support; native testing is pending. Windows ARM64 is also unverified. Remote SSH,
WSL, containers and browser VS Code are outside this support scope.

Navigator does not patch Codex or VS Code. Activity and goal controls depend on
the Codex runtime; a ready indicator means a turn finished, not necessarily that
it succeeded. Visit highlights track chats opened through Navigator, rather than
which chat is currently visible inside Codex.

See [setup, troubleshooting and advanced options](docs/advanced.md) for detailed
settings, hook removal, upgrading from Repo Companion, and build instructions.
[Privacy and local data](PRIVACY.md) explains what is stored and when licence
validation connects to Polar.

Source and component tests are available for inspection. Source reuse,
modification and redistribution require written permission; see the
[licence terms](LICENSE.md).

Made by Keenan Selbee.
