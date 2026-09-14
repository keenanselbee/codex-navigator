Best-effort desktop platform support
===================================

Scope
-----

Add local desktop VS Code support for macOS/Linux x64 and ARM64 while preserving
Windows behavior, one production application and the independent private
licensing implementation. The owner has no macOS or Linux machine. Completion
of this best-effort goal means portable implementation, simulated platform
checks, Windows regression evidence and explicit native-test limitations.
It does not mean certified macOS/Linux support or commercial release approval.
Remote SSH, WSL, containers and browser VS Code are outside this goal.

Implementation
--------------

- Select the Codex extension's own OS/architecture-specific executable for
  Windows, macOS and Linux, on x64 or ARM64. No other-architecture or PATH fallback.
- Show an actionable setup error when the bundled runtime is missing or cannot
  execute. Keep mandatory hook installation and trust checks; delivery remains
  diagnostic and does not block the chat list.
- Generate POSIX-safe helper paths and use one hook command builder for both
  installation and verification. Keep Windows's established command format.
- Preserve path case on Unix, including case-sensitive macOS volumes. Fold case
  only on Windows when comparing paths and checking independent Git roots.
- Package one universal VSIX; no third-party native binaries are included.
  Preserve immutable prior release artifacts and the public/private boundary.
- Make isolated desktop test launchers portable, with explicit executable/CLI
  overrides for nonstandard installations. Use directory symlinks on Unix for
  the disposable public-only source test.
- Keep existing SecretStorage/SQLite licensing, user data and Codex tasks/goals.
  No private licensing implementation changes or weaker storage fallback.

Verification
------------

Best-effort implementation completed on 2026-09-13. Verified on Windows x64:

- 128 public tests passed, including all six OS/architecture combinations,
  unsupported-host rejection, Unix case-sensitive identity, POSIX quoting,
  simulated executable-permission failures and portable test-launcher discovery.
- 20 commercial tests passed with the unchanged private implementation.
- Public-only snapshot tests passed and the full build correctly rejected a
  missing private checkout (`.codex-temp/public-only-z1KOeY`).
- Real isolated VS Code 1.137.0 integration passed, including setup, restart,
  startup history and two-window licence state (`.codex-temp/integration-cOskda`).
  The fixture explicitly simulates Codex runtime readiness and metadata; these
  runs do not establish authenticated Codex compatibility.
- A disposable universal 0.0.0 VSIX passed all 55 entry checks and the check for
  no target-platform restriction (`.codex-temp/package-acceptance-NJEIE7`).
  Private source and source maps were excluded.
- That package passed isolated install, expiry and uninstall/settings-reset/
  reinstall checks. Both phases verified 52 runtime/document files plus the
  manifest; the original installation/trial identity survived. The disposable
  extension was removed (`.codex-temp/installed-acceptance-H5qvvg`).
- Documentation links and diff whitespace passed. The immutable 1.5.1 archive
  retained SHA-256 `43649b5a0f42d1c810c38aaf37a130bc58a6697e33dece1482603d9a765b9a68`.

Scratch evidence is retained locally under `.codex-temp`. No normal-profile
installation, private-source edits, live commerce, publication or deployment
occurred. These changes are unreleased and need a new version before production
packaging; the existing 1.5.1 release artifact must not be overwritten.

Native acceptance still required
-------------------------------

Audit follow-up implemented on 2026-09-13: macOS/Linux admission now checks a
separate harmless SecretStorage value after the originating editor process has
exited. It blocks trial, activation and recovery while persistence is unknown;
successful in-memory writes cannot consume entitlement state. Users fully quit
and reopen VS Code once, or repair the keyring and retry if the value disappears.
It does not depend on telemetry session IDs or start a trial automatically.
Generated helper commands and paths now use Markdown delimiters long enough to
preserve literal backticks in Unix paths.

The check passed a real Windows VS Code restart with telemetry disabled, using
a disposable test package that forces the Unix guard in its private service
composition. That fixture passed storage preflight, trial/expiry and reinstall
checks (`.codex-temp/installed-acceptance-T07ot4`); all 56 archive entries and 53
installed runtime/document files plus the manifest were verified. This is
evidence for the restart protocol, not native macOS/Linux keychain acceptance.
The test-only composition change was recorded in the archive receipt and is
not present in production source. Normal Windows admission remains unchanged.
Final follow-up checks passed: 129 public tests, 22 commercial tests, public-only
source/missing-private checks (`.codex-temp/public-only-zLytND`), and Windows
UI/restart/two-window integration (`.codex-temp/integration-Ge7LZ9`). Documentation
links and both repositories' diff whitespace passed. The normal installation and
immutable 1.5.1 archive were unchanged; disposable test installations were removed.

The second audit found that an occupied old process ID could keep initial
verification waiting after a restart. A different editor now writes a fresh
probe tied to its own process before asking for another full exit. This does
not treat PID changes as proof: access remains blocked until that fresh probe
survives its originating editor's exit. Same-editor polling retains the probe,
and failed-persistence guidance and existing licence records are preserved.
The production build and all 24 commercial tests passed, including occupied-PID
recovery and rejection of volatile storage after retry. Native acceptance and
installation status remain unchanged.

On a real macOS and Linux desktop, for each available x64/ARM64 environment:

1. Run public, commercial, public-only, integration, package and installed-package
   checks using Node.js and a supported desktop VS Code. Also verify Windows
   ARM64 before claiming native support for it.
2. Install the candidate in an isolated profile. Confirm runtime discovery,
   hook review/trust, activity delivery, saved history, goals and reload layout.
3. Test paths with spaces, apostrophes and shell metacharacters; verify hooks
   write only within the chosen Codex home. Test distinct case-sensitive roots.
4. Verify secure-store persistence with the native Keychain/keyring and recovery
   when it is unavailable. Confirm explicit trial start, expiry, two-window
   coordination and reinstall without granting a second trial.
5. Verify sandbox activation, transfer and offline grace without live purchases.

Synthetic path tests and Windows runs cannot establish native executable
permissions, GUI PATH inheritance, keychain/keyring behavior or authenticated
Codex compatibility on another OS. Existing commercial release acceptance gates
in [commercial access](commercial-access-goal.md) remain separate and pending.
