# @bagthejobai/apply-agent

A tiny command-line helper that copies the [BagTheJob.ai](https://app.bagthejob.ai) application-agent skill to your clipboard so you can paste it into the Claude desktop app.

```bash
npx @bagthejobai/apply-agent setup     # first-time install
npx @bagthejobai/apply-agent update    # copy the latest to re-paste
```

## What it does

- Copies the **bundled** skill (`APPLICATION_AGENT.md`, shipped inside this package) to your clipboard — nothing is downloaded.
- Clipboard support: macOS `pbcopy`, Windows `clip`, Linux `wl-copy`/`xclip`/`xsel`.
- Prints short instructions for reviewing and pasting it.

`npx @bagthejobai/apply-agent@latest` always pulls the newest published skill.

## What it deliberately does NOT do

This is a **paste helper, not an installer.** By design (see the project's issue #159 security model):

- It never writes the skill to a file on your machine.
- It never creates or edits `config.json`, `answers.json`, or your resume.
- It never registers a scheduled task or runs anything on your behalf.

**You** are the install step: review the skill you copied, then paste it into the Claude desktop app yourself. That human review is the security gate — nothing is downloaded and silently executed.

## Options

| Flag | Meaning |
|------|---------|
| `--stdout` | Print the skill to the terminal instead of using the clipboard (headless/CI). |
| `-h`, `--help` | Show help. |
| `-v`, `--version` | Show the CLI version. |

If no clipboard tool is available, the CLI automatically prints the full skill between `BEGIN SKILL` / `END SKILL` markers so you can copy it manually.

## Versioning

The skill is **bundled** in the package, so it works offline and never depends on a server being up. The package's **major.minor** tracks the skill's `Template version` (e.g. `1.23.x` for skill `v1.23.0`), so the number you install signals which skill release it ships; the patch digit is free for CLI-only fixes. To get the newest skill, install `@latest`.

`APPLICATION_AGENT.md` here is a copy of the skill; the runtime source of truth (and the `426` staleness gate) lives in the BagTheJob server. The two are kept in sync at release time — the publish workflow asserts the bundled skill's version matches the release.

## Releasing

Publishing is automated by `.github/workflows/publish.yml`. To cut a release:

1. Update the bundled `APPLICATION_AGENT.md` to the current skill and set `package.json` `version` to match its `Template version` (without the `v`); merge to `main`.
2. Publish a **GitHub Release** tagged `v<version>` (e.g. `v1.23.1`).

The workflow refuses to publish unless the release tag matches `package.json` and the package's major.minor matches the **bundled** skill's `Template version`, then runs `npm publish` with the `NPM_TOKEN` repo secret (an npm **Automation** token, so it bypasses account 2FA). Patch releases (e.g. `1.23.0` → `1.23.1`) are available for CLI-only fixes within the same skill line.
