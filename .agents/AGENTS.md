# Project Rules - WhatsappAPI (wacrm)

## Target Scope & Workspace
- Workspace: repository root (`/workspace` in Cloud Agents, or the local clone).
- Repository: `arhamtechnology3-beep/WhatsappAPI`
- Live: `main` → Hostinger (`whatsapp.arhamtechnology.com`)

## Change logging (required — current and future)

Whenever you modify files, fix a bug, add a feature, run a migration, or ship to `main`:

1. Update **`changes.md` in the project root** in the **same commit/PR** as the code.
2. Put a **new entry at the top** of the dated list (newest first).
3. Use the template in `changes.md` (timestamp, type, area, root cause, fixes, files, live SHA/PR, migrations).
4. Do **not** skip this because the change is “small”. Operators use this file to know what is on live and what SQL to apply.

Do not treat `CHANGELOG.md` as the fork log; that file is upstream wacrm versioning.
