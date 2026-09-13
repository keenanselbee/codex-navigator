Codex Navigator sidebar goal
============================

Goal: deliver a sidebar-first Codex Navigator with simple, verifiable hook setup.

Accepted scope
--------------

- Remove patch application, automatic reapplication, injected assets and compatibility code.
- Provide no backward compatibility or migration, as explicitly requested.
- Rename the extension identity, visible branding, commands/settings and helper paths.
- Replace patch setup with Install Hooks, Codex trust review and real-event verification.
- Keep optional project routing and explicit-focus detection independent of activity.
- Allow official release use and source inspection; require written permission for
  source reuse, modification and redistribution. Preserve earlier MIT grants.

Implementation
--------------

The new identity is keenanselbee.codex-navigator. Commands/settings use
codexNavigator; helper data uses codex-navigator under the effective Codex home.
No legacy data is imported and no installed old extension is changed. The owning
repository's filesystem folder and remote URL remain where they are.

Setup checks Node.js, collector/configuration, Codex-reported enabled/trusted
states and an observed event since installation. The view preserves routing
drafts during checks. Only the user reviews trust in Codex; no test prompt or
trust bypass is supplied. Implementation and local verification are complete: 94 unit tests and the real
VS Code sidebar/setup integration pass. The release artifact is produced by the
immutable packaging command and its payload/hash receipt is retained locally. Authenticated acceptance is documented separately in
[verification](verification.md).
