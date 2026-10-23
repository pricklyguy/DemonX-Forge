# DemonX Forge native release signing

This channel publishes **native Windows x64 only**. Native tags use `native-v<version>` and the channel value is `native-preview`; React releases continue to use their existing `v<version>` tags and workflow. The native release workflow is started only with `workflow_dispatch`. It builds and tests the pinned source, packages it, runs GUI/MCP acceptance, signs release metadata, then creates a GitHub prerelease after the protected environment gate.

The first signed artifact must be treated as a test release. Do not enable automatic update checks until a real GitHub release has been discovered and installed end to end, including the failure and rollback checks below. The shipped build currently compiles automatic checks out unless `DEMONX_FORGE_AUTO_UPDATES=1` is explicitly set for a later build. “Check now” remains available for the signed-release test.

## Trust and release contents

The signing scheme is minisign (Ed25519). The GitHub Actions private signing key is used only in the protected `native-preview` publish job. The job writes it to a temporary file under the runner's temporary directory, derives its public key and checks it against the key set compiled into the build, signs the release checksums, verifies the signature, and deletes the temporary key file in a `finally` block. The secret is not an artifact or source file. Do not print it, upload it, or place it in a workflow log.

The GitHub variable `DEMONX_FORGE_UPDATE_PUBLIC_KEY` contains one minisign public-key base64 line. During a planned rotation, it may contain old and new public keys separated by semicolons. This public material is embedded at compile time; it is not sensitive. The workflow refuses to build if it is missing or malformed, and refuses to publish if the signing secret does not match one of the embedded keys.

Each release contains:

- `solidcraft-windows-x64-portable.zip`
- `DemonX-Forge-release.json`
- `SHA256SUMS.txt`
- `SHA256SUMS.txt.minisig`

The signature authenticates the checksum list and its trusted comment names the exact native tag. The checksum list covers both the ZIP and JSON manifest. The app checks the signature, manifest digest, product, channel, tag/version agreement, unique `windows-x64` platform entry, asset name, and matching artifact digest before downloading/applying the archive. It rejects missing signatures/manifests, malformed or mismatched metadata, a React channel tag, a different platform, or a package digest mismatch. Version comparison only offers a strictly newer release; an equal or downgraded version is not installable. The install helper stages an immutable version and restores the current pointer if health checks fail.

## GitHub setup

Before dispatching the workflow:

1. Create a dedicated GitHub Actions environment named `native-preview`; configure required reviewers and prevent deployments from untrusted branches. The workflow is manual-only, and the environment gate is on the publish job.
2. Add repository secret `SOLIDCRAFT_READ_TOKEN` with read-only Contents access to `pricklyguy/DemonX-Solidcraft`.
3. Generate a signing key on a controlled offline machine with the official minisign tool: `minisign -G -W -s demonx-forge-native.key -p demonx-forge-native.pub`. `-W` makes the CI key unencrypted so the noninteractive signer can use it; access to the raw key is consequently limited to GitHub's protected Actions secret and the offline backup. Use a dedicated key only for this native channel.
4. Put the complete private-key file contents in the protected environment secret `DEMONX_FORGE_MINISIGN_SECRET_KEY`. Do not commit it, upload it as an artifact, put it in a repository variable, or paste it into an issue or pull request.
5. Add the final base64 line from `demonx-forge-native.pub` to the repository Actions variable `DEMONX_FORGE_UPDATE_PUBLIC_KEY`. Preserve line breaks only between keys; use semicolons to separate keys during rotation.
6. Confirm the workflow dispatch ref is `codex/fusion-parity`, review the version and run summary, then manually approve the `native-preview` environment deployment. Version input must be a new numeric version such as `0.20.0-preview.1`.

The release job grants `contents: write` only to the protected publishing job. It creates a `native-v...` prerelease at the exact workflow commit. The React `package.yml` pipeline is unchanged.

## Backup, rotation, and compromise

Keep two offline backups of the private key in separate controlled locations. Encrypt each backup with a strong passphrase using an approved encrypted archive or secret-management system, restrict access to release maintainers, and periodically verify the backup by deriving its public key on an isolated machine. The online GitHub secret is not a backup. Document who can access each copy and record the public-key fingerprint alongside the backup; never record the private key in that inventory.

For routine rotation, generate a new dedicated key and back it up first. Set the compiled trust variable to `old-public;new-public`. Publish a transition build signed by the old key; it embeds both public keys and accepts releases signed by either. After installing and validating that transition build, sign subsequent releases with the new key. Once all supported clients have the transition build, publish a newer build with only the new public key, signed by the new key, and retire the old key and its backups. Keep the transition and retirement versions strictly increasing.

If a private key is lost, stop publishing with it, preserve the old public key for diagnosis, and generate a replacement. If a private key may be compromised, treat every client that trusts it as unable to distinguish attacker signatures. Immediately disable the native updater and publishing environment, revoke the Actions secret, preserve evidence, and distribute a recovery build through an independently trusted route (for example, the known-good installer from the official project page) that embeds the replacement key. Do not rely on an old-key-signed update to recover from compromise. Restore normal signed updates only after users have installed that recovery build and the new-key release path has been checked.

## Required end-to-end acceptance before automatic checks

Keep the current working installation untouched as the rollback version. Use a separate test install root and isolated user-data profile for the signed-release exercise. Test a real GitHub `native-v...` release from the installed GUI:

1. Open multiple documents, make one dirty, request installation, and confirm the app refuses before staging or quitting. Save/discard the dirty document and verify the manual update check discovers the signed release.
2. Install the actual release, restart, open an existing project, and confirm settings, file associations, scripts, user data, and the stable MCP launcher remain intact. Confirm the MCP bridge reconnects and answers a read-only call.
3. Use a second higher-version signed test release for success/rollback testing. Confirm a successful update changes only the active version pointer. Exercise a deliberately unhealthy staged package and confirm the old current version is restored. Verify the app and MCP bridge start after rollback.
4. Confirm unsigned, invalid-signature, wrong-key, tampered manifest/archive, wrong-channel, and downgraded candidates are rejected without changing the current pointer. Retain logs and screenshots without tokens or private key material.
5. Only after the above passes should a later reviewed build opt into automatic checks with `DEMONX_FORGE_AUTO_UPDATES=1`. Automatic installation remains user initiated.

The workflow can publish and validate its signed artifacts, but it cannot exercise the user's installed Windows GUI or MCP client. That final acceptance must be performed on the Windows machine with the real published test releases. The existing known-good installation is the rollback target and must not be replaced before this acceptance passes.
