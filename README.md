# Helm desktop

Public desktop shell and signed release workflows. The main application source stays private. Helm opens https://erptablebrowser.lovable.app; this is not an offline website bundle.

## Signing
Save repository Actions secrets: MAC_CERT_P12_BASE64, MAC_CERT_PASSWORD, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID, WIN_CERT_PFX_BASE64, WIN_CERT_PASSWORD. Never commit certificates or passwords.

Use Desktop – signed automatic-update release for signed public releases. Create a v{package.json version} tag before running it. A manual run requires that tag as input. Both platforms must pass signature verification; Mac additionally requires notarization. The standalone Mac workflow can produce unsigned artifacts and must not be used as evidence of a signed release.

Release assets and update manifests are public. Packaged installs download updates automatically and install on quit. Existing ZIP installations need one initial signed-installer installation. Do not delete Helm user data when replacing an app.

## Development
Run bun install, then bun run desktop. For localhost, use bun run desktop:dev. Native macOS/Windows installation must be checked on those platforms.
