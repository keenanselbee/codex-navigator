Release preparation
===================

Product: Codex Navigator 1.9.5
Extension identity: keenanselbee.codex-navigator
License: proprietary, with selected source available for inspection; see [licence terms](../LICENSE.md).

This page describes the current release procedure. Package hashes, build revisions,
owner acceptance and earlier test results belong in [Verification](verification.md).
Build commands and the public/private boundary are in [Development](development.md).


Prepare and verify
------------------

1. Finish the intended changes and review the diff. Keep unrelated working files
   out of the release and preserve the independent private repository boundary.
2. Set the next unused version in package.json and both lockfile root fields.
   Update the changelog and current release documentation. A changed packaged
   file requires a new version, including documentation or demonstration assets.
3. Check documentation links, setup wording, support limits, privacy and licensing.
   README links must use full URLs because packaging disables relative-link
   rewriting. Confirm GitHub-hosted listing images are available before upload.
4. Run checks appropriate to the changes. Runtime changes require the relevant
   unit, commercial and isolated VS Code integration checks. For documentation-only
   releases, validate links, whitespace and release metadata, then compare runtime
   payload hashes with the last verified archive. Reuse prior runtime evidence
   only when those files are unchanged.
5. Review and commit the release inputs before production packaging. Keep public
   and private commits separate. Both checkouts must be clean; never include
   private source in the public repository.

Windows x64 is natively tested. macOS/Linux and Windows ARM64 limitations remain
as documented in [customer help](advanced.md#platform-support). Synthetic hooks,
credentials and licence fixtures do not prove authenticated account adoption,
provider transactions or native platform acceptance. Record owner-confirmed
acceptance separately; do not describe old pending checks as newly executed.


Package and deliver
-------------------

Run `npm run package` from clean release inputs. It builds the production extension,
requires production licensing configuration and checks every archive entry against
its allowlisted payload. Private source, tests, source maps and obsolete modules
must not ship. The universal VSIX and paired JSON receipt are written to dist/.

Keep the archive immutable. The receipt records both repository revisions, the
archive SHA-256 and payload hashes. Never overwrite a reserved version or remove
receipts to bypass the version guard. Local test packaging is separate from this
production workflow and is not a publishable release substitute.

When preparing a verified delivery, run isolated installation/reinstallation
acceptance against the exact archive, using the existing installed-package helper.
Record its result in [Verification](verification.md), including fixture limitations.
Do not install into the normal VS Code profile without a separate request.
Copy the VSIX and receipt to the requested delivery location and compare hashes.
Evidence-only documentation updates excluded from the VSIX may follow packaging;
they must preserve the original build revision and payload.


Owner publication
-----------------

Packaging, Desktop delivery, installation, commits, Git pushes and Marketplace
publication are separate actions. Publish only when requested. Push required
public documentation and hosted assets before upload, verifying their public URLs.

Upload the exact verified VSIX through the Visual Studio Marketplace publisher
management page for keenanselbee. Keep its receipt locally; it is not an upload
artifact. After publication, verify Marketplace installation and inspect the
listing, onboarding and purchase/support links before announcing the release.
See the [official publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

Earlier releases, artifact hashes and original licence grants remain unchanged.
Navigator provides a seven-day local trial, a $5 CAD one-time purchase, one active
transferable installation, daily paid validation and up to 30 days offline after
successful validation. Retain the recorded customer-journey acceptance; repeat
relevant provider checks when commerce behavior changes.
