# @bagthejobai/apply-agent

A tiny command-line helper that fetches the current [BagTheJob.ai](https://app.bagthejob.ai) application-agent skill to your clipboard so you can paste it into the Claude desktop app.

```bash
npx @bagthejobai/apply-agent setup     # first-time install
npx @bagthejobai/apply-agent update    # fetch the latest to re-paste
```

## What it does

- Fetches the skill live from `GET https://app.bagthejob.ai/skill`.
- Copies it to your clipboard (macOS `pbcopy`, Windows `clip`, Linux `wl-copy`/`xclip`/`xsel`).
- Prints short instructions for reviewing and pasting it.

## What it deliberately does NOT do

This is a **fetch-and-paste helper, not an installer.** By design (see the project's issue #159 security model):

- It never writes the skill to a file on your machine.
- It never creates or edits `config.json`, `answers.json`, or your resume.
- It never registers a scheduled task or runs anything on your behalf.

**You** are the install step: review the skill you copied, then paste it into the Claude desktop app yourself. That human review is the security gate — nothing is fetched and silently executed.

## Options

| Flag | Meaning |
|------|---------|
| `--base-url <url>` | Fetch from another server (default `https://app.bagthejob.ai`). Also settable via `BTJ_BASE_URL`. |
| `--stdout` | Print the skill to the terminal instead of using the clipboard (headless/CI). |
| `-h`, `--help` | Show help. |
| `-v`, `--version` | Show the CLI version. |

If no clipboard tool is available, the CLI automatically prints the full skill between `BEGIN SKILL` / `END SKILL` markers so you can copy it manually.

## Versioning

The CLI ships **no** skill content — it always fetches the live copy, so it can never go stale relative to the server. The package's **major.minor** tracks the skill's `Template version` (e.g. `1.23.x` for skill `v1.23.0`), so the number you install signals which skill release line it shipped alongside; the patch digit is free for CLI-only fixes. What you actually receive is always whatever the server currently serves.

## Releasing

Publishing is automated by `.github/workflows/publish.yml`. To cut a release:

1. Set `package.json` `version` to match the current skill `Template version` (without the `v`) and merge it to `main`.
2. Publish a **GitHub Release** tagged `v<version>` (e.g. `v1.23.1`).

The workflow refuses to publish unless the release tag matches `package.json` and the package's major.minor matches the live skill's `Template version` (fetched from the public `GET https://app.bagthejob.ai/skill` endpoint), then runs `npm publish` with the `NPM_TOKEN` repo secret (an npm **Automation** token, so it bypasses account 2FA). Patch releases (e.g. `1.23.0` → `1.23.1`) are available for CLI-only fixes within the same skill line.
