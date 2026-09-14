Release preparation
===================

Product: Codex Navigator 1.5.9 (prepared for owner publication)
Extension identity: keenanselbee.codex-navigator
License: proprietary, with selected source available for inspection; see LICENSE.md

This release removes the patch integration entirely. It does not migrate data,
restore old Codex files, alias old commands/settings, or maintain an older Repo
Companion installation. After trial or paid admission, installed, enabled and
trusted activity hooks are required to open the chat list. Setup has no bypass and returns with the
relevant next step if readiness fails. Automatic labels and project instructions
remain optional.

The hosting repository is [keenanselbee/codex-navigator](https://github.com/keenanselbee/codex-navigator).
Package links and the local origin remote follow that name. This does not rename
the local checkout folder or publish a Marketplace listing.

Release checklist
-----------------

- Run unit and isolated VS Code setup/sidebar integration checks.
- Verify docs, source-available wording and package metadata agree.
- Inspect the VSIX: no patch installer, injected assets or obsolete compiled modules.
- Retain the immutable VSIX and SHA-256 receipt.
- Review and commit public and private release inputs independently. Record both
  revisions and the per-file hashes emitted by packaging; keep private source out
  of the public commit and package.
- Verify Navigator's $5 CAD one-time checkout, seven-day local trial, one active
  transferable installation, daily validation and 30-day offline grace.
- Complete sandbox activation, repeat validation, second-install refusal,
  transfer, refund/revocation and download delivery before live publication.
- Install only when requested; remove the old extension separately if desired.
- Complete authenticated trust/event and runtime-goal acceptance before claiming it.
- Publish only after a separate publishing instruction.

Earlier releases and their original license grants remain unchanged. Source
inspection is allowed; code reuse, modification and redistribution require written
permission. New commercial releases require trial or paid admission for features.
Earlier 1.5.0 installations retain their original permissions; never overwrite
that version with a changed payload.


Owner acceptance (2026-09-13)
---------------------------

The owner confirms completing the production customer journey checks: checkout,
licence recovery, refund/revocation and customer download delivery. The owner
also confirms the final packaged-extension real-use checks: fresh setup,
authenticated Codex activity hooks, chat switching, automatic labels and goal
pause/resume. These checks are recorded as owner-verified, not agent-executed.
They are no longer outstanding acceptance gates for Codex Navigator.

Version 1.5.9 consolidates the local preview notes for release and retains the
approved extension page. Run the final automated checks and prepare a clean,
committed production package with its revision/hash receipt. The owner will
publish the verified package; preparation does not publish it.

Prepare this candidate from clean, committed public and private checkouts. A
separate worktree may be used to exclude unrelated local working files without
changing them. Keep the resulting VSIX and paired revision/hash receipt immutable.
If further fixes change the packaged payload, reserve the next patch version.
