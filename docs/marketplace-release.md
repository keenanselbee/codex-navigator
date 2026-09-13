Marketplace Release Preparation
===============================

Status: 1.1.8 installed locally; not submitted to the Marketplace. Remaining release steps:

- Publisher setup was confirmed by the user; verify dashboard access when submitting.
- Resolve the optional Codex patch distribution permission described below.
- Add the user's screenshots and finalize a new version for those packaged changes.
- Review/commit/push the source and listing so the packaged GitHub help links resolve.
- Verify the final artifact and submit it only after explicit publication approval.

Version 1.1.8 clarifies that lightweight routing complements built-in AGENTS.md
discovery, without extra AI calls or a guarantee of agent compliance. All 13 setup
tests, compilation, whitespace and local-link checks passed. Archive checks verified
all 38 extension files and confirmed only wording/version differences from 1.1.7.
Installed and verified as `keenanselbee.codex-repo-companion@1.1.8`; reload is pending.
Verified current artifact: `dist/codex-repo-companion-1.1.8.vsix`, SHA-256
`bb7ac0d7a83f6d67a837950dd6b310bf73df36cd284ef978bbb1cc592574e88f`. The 1.1.7 artifact is unchanged.

Version 1.1.7 uses a coloured star instead of a dot for starred chats. All 106 unit
tests and isolated VS Code initial/restart integration passed. Disposable patch
upgrade/restoration and archive-source checks passed; 1.1.6 is preserved.
Preserved prior artifact: `dist/codex-repo-companion-1.1.7.vsix`, SHA-256
`a962483da223c582013e1af017005a549ab450bc32a9220a90551bb1ac234e98`.

Version 1.1.6 adds chat and repository colours with eight presets, a native picker,
custom hex input, manual overrides and equal repository-colour blending. All 105
unit tests and isolated VS Code initial/restart integration passed. A disposable
Codex copy upgraded from the 1.1.5 patch and restored its original files exactly.
Native colour-picker interaction remains pending manual acceptance.

Preserved prior artifact: `dist/codex-repo-companion-1.1.6.vsix`, SHA-256
`cdf887a38d6c515e6d7597e75ec940ad0bbab5fdeb3a543bf1a62a293f4c06f7`.
Archive inspection matched all 38 extension files to source, accounting for
Markdown link rewriting, and checked the new colour assets and Windows x64 target.
The 1.1.5 artifact is unchanged. No installation, commit or publication was performed.

Version 1.1.5 adopts MIT for Companion's own code, welcomes contributions and
upstream integration, and adds a theme-aware setup warning with restoration and
token-usage guidance. Patching remains opt-in and routing remains independent.
MIT and these disclosures do not establish permission to modify Codex.

Preserved prior artifact: `dist/codex-repo-companion-1.1.5.vsix`, SHA-256
`d3b942d8a449cf92d1eaca75914d76fecf0d625d03e31aa354a27d92de5a9ac5`.
All 96 unit tests and whitespace/conflict/local Markdown link checks passed.
Archive inspection checked all 34 extension files: 32 match the source byte for
byte; README/changelog content was checked separately because vsce rewrites links.
MIT metadata, setup warning text and Windows x64 target were verified. The 1.1.4
artifact is unchanged. No new live VS Code UI acceptance run was performed.

Preserved prior artifact: `dist/codex-repo-companion-1.1.4.vsix`, SHA-256
`4c4a183d787994eeef841497a210bcbbe902e0c668a70f5961e46ab89f53fcb6`.
All 96 unit tests passed, including deferred repair on setup closure and truthful
routing save results. Complete-file whitespace/conflict checks and local Markdown
links passed. Archive inspection matched all 34 packaged files to the working
source, accounting for vsce's Markdown link rewriting, and checked metadata,
privacy heading and exclusions. The 1.1.3 artifact is preserved unchanged.

Preserved prior artifact: `dist/codex-repo-companion-1.1.3.vsix`, SHA-256
`817fcb637dcace2a7dd8711b8fe934a041f56f466a652a115c8031d07697c7f1`.
All 94 tests passed, including restore opt-out across restart, visible rollback
failure details and shared files selected by more specific routing profiles.
Complete working-file whitespace/conflict checks and local Markdown links passed,
including new documents. Archive inspection matched all 34 packaged files to the
working source, accounting for vsce's Markdown link rewriting, and checked the
privacy heading, metadata and exclusions. These 1.1.3 changes were committed as
94acc48. The 1.1.4 setup fixes need a new DIFF/COMMIT review.

Preserved prior artifact: `dist/codex-repo-companion-1.1.2.vsix`, SHA-256
`50ff1e10b24fc8b2219999f525073bd4e6c432aa663eab96c1f13c2b2950e208`.
Archive inspection confirmed publisher, engine requirement, Windows x64 target,
all required documents, the 256-pixel PNG, development-file exclusions, rewritten
help links and byte-identical contents for all 25 packaged runtime files.
The prior 1.1.1 artifact checksum is unchanged. Test profiles, audit output and
the isolated old VS Code download remain under ignored .codex-temp for diagnosis.


Publisher and listing
---------------------

Use **Keenan Selbee** as the publisher display name. The account identifier is
separate; `keenanselbee` is the user-approved ID and is now set in package.json.
The user confirmed publisher setup at https://marketplace.visualstudio.com/publishers/keenanselbee.
Microsoft documents this distinction in its
[publisher instructions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#create-a-publisher).
The update-search action reads the installed extension ID, and integration tests
read it from the manifest. The old local build has not been replaced in the user's
profile. Follow [the local-build transition guide](advanced.md#switching-from-a-local-build)
before that change; VS Code does not automatically transfer private extension
state between these identities. No database migration or automatic removal is
included in the product.

README.md is the short user-facing listing. Detailed usage, developer commands
and removal instructions are in advanced.md; architecture and verification remain
separate. LICENSE.md is the standard MIT license for Companion's own code, allowing
reuse and modification; it does not grant rights over Codex. Third-party licenses
and notices remain in place. PRIVACY.md documents local data access.
An original 256-pixel PNG chat/branch icon is included, with a reproducible Windows
drawing script. Screenshots remain deferred to the user. The author, repository,
issue tracker, license and search keywords are included in the manifest.


Codex patch: unresolved release blocker
--------------------------------------

The installed openai.chatgpt 26.908.40401 LICENSE.md directs readers to
[OpenAI's Terms of Use](https://openai.com/policies/row-terms-of-use/).
As checked on 2026-09-12, the terms restrict modifying the Services and restrict
reverse engineering, with the stated legal exception. Companion changes installed
Codex bundles using checksum-matched internal code locations. This is a concrete
terms/permission concern, not just a possibility of a malware-scanner warning.

Microsoft's [Marketplace Publisher Agreement, section 4(b)](https://cdn.vsassets.io/v/M187_20210610.3/_content/Visual-Studio-Marketplace-Publisher-Agreement.pdf)
places responsibility for third-party rights and permissions on the publisher.
It also permits a publisher's own end-user license in section 4(c). No public
statement reviewed establishes permission for this specific patch. Marketplace
acceptance would not itself establish OpenAI permission. This is a release-risk
assessment, not a determination of legal enforceability.

Obtain written permission/clarification for distribution of the optional patch,
or decide on a supported alternative before public submission. Moving the same
patch to another download is not evidence that the terms concern is resolved.
No feature was removed or changed as part of this investigation.

Suggested inquiry (draft only; not sent):

> I develop Codex Repo Companion, a free VS Code extension. Its instruction-routing
> feature operates independently. An optional feature adds project labels and
> stars to Codex chat views by modifying three locally installed Codex JavaScript
> bundles after checking the exact version and file hashes. It backs up originals,
> supports restoration, and reapplies supported updates after user opt-in. We do
> not distribute Codex bundles or change chat contents, permissions or model access.
> Does OpenAI permit public distribution of this integration, and is there a
> supported extension API or permission process we should use instead?

For Marketplace support, attach the same description and ask whether this optional
modification is eligible under current Marketplace publishing requirements.


Build and compatibility
-----------------------

The lockfile had 11 dependency records with earlier broad version-replacement
errors. These were restored from installed metadata with matching integrity
hashes. A fresh isolated npm ci and all 91 tests passed. Version
changes must touch only the root package version and its explicit references.
The release-metadata test compares the lockfile with installed dependency manifests.

The current package command targets Windows x64 and uses normal license/repository
checks. It packages only Companion's code and bridge hooks, not installed Codex
bundles or node_modules. Version 1.1.2 requires VS Code 1.137.0 or later: both
integration phases passed on that version. An isolated 1.96.2 run timed out on
the custom chat-label check; it is not counted as supported. This does not locate
the earliest compatible version, so the release conservatively uses the verified
version as its minimum. Other platforms remain unverified.

The package command reads the authoritative package.json version, validates the
lockfile root and publishes the archive without overwriting an existing artifact.
It retains normal vsce license, repository and Windows-target checks. All 94 unit
tests pass; the prior npm dependency audit reported zero known vulnerabilities. The
patch apply/restore and failure checks passed using disposable Codex copies.

After the blocker and publisher identity are resolved: add the supplied images,
finalize a new version, run clean-install/unit/integration/patch checks, review the
exact VSIX contents, and submit that artifact through the
[publisher dashboard](https://marketplace.visualstudio.com/manage/publishers/).
Microsoft supports manual VSIX upload; an automated publishing pipeline is not
required for the first release. Nothing in this document authorizes submission.

Local preparation artifact: `dist/codex-repo-companion-1.1.1.vsix`, SHA-256
`085e1a70aac07dabc55e231947ba01382c2957c1409479294a39507dd701f04d`.
Packaging succeeded with normal checks. Inspection confirmed Windows x64 metadata,
license/privacy/changelog/help inclusion, rewritten README links, development-file
exclusions and byte-identical contents for all 24 packaged runtime files. Markdown
local links and Git whitespace checks passed. This version is reserved for that
payload; it was not installed or submitted in this preparation step. The isolated
clean-install scratch directory is retained under .codex-temp for diagnosis.
