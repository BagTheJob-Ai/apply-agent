// @bagthejobai/apply-agent — a paste helper for the BagTheJob application-agent
// skill.
//
// What it does: copies the bundled skill (APPLICATION_AGENT.md, shipped inside
// this package) to your clipboard, then prints instructions for you to review
// and paste it into the Claude desktop app yourself.
//
// What it deliberately does NOT do (issue #159): it never writes the skill to a
// file, never creates `config.json`, and never registers a scheduled task. The
// human reviewing and pasting the skill is the security gate; this tool only
// moves text to your clipboard.
//
// The skill is bundled (not fetched): the package version tracks the skill's
// Template version, so `@bagthejobai/apply-agent@1.23.x` always ships skill
// v1.23.0. `npx @bagthejobai/apply-agent@latest` gets the newest.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

// The bundled skill sits at the package root, one level up from lib/.
const SKILL_PATH = fileURLToPath(new URL("../APPLICATION_AGENT.md", import.meta.url));

const DASHBOARD_URL = "https://app.bagthejob.ai/dashboard";
const BEGIN_MARK = "─── BEGIN SKILL ───";
const END_MARK = "─── END SKILL ───";

// parseSkillVersion pulls the `**Template version:** `vX.Y.Z`` header out of the
// skill markdown. Returns null when the line is missing/malformed.
export function parseSkillVersion(content) {
  const m = content.match(/^\*\*Template version:\*\*\s*`(v[0-9]+\.[0-9]+\.[0-9]+)`/m);
  return m ? m[1] : null;
}

// loadBundledSkill reads the packaged skill and its Template version. `read` is
// injectable for tests; it defaults to reading the bundled file. Throws a
// human-facing Error if the skill is missing or has no Template version line.
export function loadBundledSkill(read = () => readFileSync(SKILL_PATH, "utf8")) {
  let content;
  try {
    content = read();
  } catch (err) {
    throw new Error(
      `Could not read the bundled skill (${err?.message || "read error"}). ` +
        `Reinstall with: npx @bagthejobai/apply-agent@latest`,
    );
  }
  const version = parseSkillVersion(content);
  if (typeof content !== "string" || content.trim() === "" || !version) {
    throw new Error("Bundled skill is missing or malformed (no Template version line).");
  }
  return { version, content };
}

// clipboardCommandFor returns an ordered list of candidate clipboard commands
// (argv arrays) for a platform. Each is tried in order until one succeeds, so a
// Linux box with wl-copy OR xclip OR xsel all work.
export function clipboardCommandFor(platform) {
  if (platform === "darwin") return [["pbcopy"]];
  if (platform === "win32") return [["clip"]];
  return [
    ["wl-copy"],
    ["xclip", "-selection", "clipboard"],
    ["xsel", "--clipboard", "--input"],
  ];
}

// copyToClipboard writes text to the first working platform clipboard command.
// Returns true on success, false if no command exists / all fail — it never
// throws, so a headless box just falls through to stdout.
export function copyToClipboard(text, platform = process.platform) {
  const candidates = clipboardCommandFor(platform);
  return candidates.reduce(
    (chain, argv) => chain.then((done) => (done ? true : trySpawnCopy(argv, text))),
    Promise.resolve(false),
  );
}

function trySpawnCopy([cmd, ...args], text) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
    } catch {
      resolve(false);
      return;
    }
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
    try {
      child.stdin.on("error", () => resolve(false));
      child.stdin.end(text);
    } catch {
      resolve(false);
    }
  });
}

// instructionsFor builds the human-facing message (pure — no I/O). On clipboard
// success the skill content is NOT echoed (it's already on the clipboard); on
// fallback the full content is fenced between BEGIN/END markers so the user can
// select it manually. The instructions always lead with "review the skill" —
// the #159 gate — and never reference any local file the tool would write.
export function instructionsFor(command, { version, copied, content, stdout }) {
  const lines = [];
  const isUpdate = command === "update";

  lines.push(
    isUpdate
      ? `Latest bundled skill is Template version ${version}`
      : `Bundled skill Template version ${version}`,
  );
  lines.push(
    copied
      ? "✓ Copied to your clipboard."
      : stdout
        ? "Printing the skill below (--stdout)."
        : "Clipboard unavailable — full skill printed below.",
  );
  lines.push("");

  if (!copied) {
    lines.push(BEGIN_MARK);
    lines.push(content ?? "");
    lines.push(END_MARK);
    lines.push("");
  }

  if (isUpdate) {
    lines.push("This tool installs nothing. You review and paste the update yourself:");
    lines.push("  1. Review the skill above — you should always know what your agent runs.");
    lines.push("  2. Open the Claude desktop app and find your `daily-job-application` task.");
    lines.push("  3. Paste this skill over the existing task description — a clean replace.");
    lines.push("     Your local config in references/ is untouched.");
    lines.push("  4. Re-register the task, then re-run it.");
    lines.push("");
    lines.push("Tip: run `npx @bagthejobai/apply-agent@latest update` to ensure the newest skill.");
  } else {
    lines.push("This tool installs nothing. You are the install step:");
    lines.push("  1. Review the skill you just copied — you should always know what your agent runs.");
    lines.push("  2. Open the Claude desktop app (with its Chrome connector enabled).");
    lines.push("  3. Paste the skill into a new `daily-job-application` scheduled-task description.");
    lines.push(`  4. On first run, Claude walks you through setup and asks for your API key`);
    lines.push(`     (create one on your dashboard: ${DASHBOARD_URL}).`);
  }
  return lines.join("\n");
}

const USAGE = `apply-agent — copy the BagTheJob application-agent skill to your clipboard.

Usage:
  npx @bagthejobai/apply-agent setup      Copy the bundled skill for first-time install
  npx @bagthejobai/apply-agent update     Copy the bundled skill to re-paste an update

Options:
  --stdout           Print the skill instead of using the clipboard (headless/CI)
  -h, --help         Show this help
  -v, --version      Show the CLI version

The skill is bundled in this package — nothing is downloaded. This tool never
writes files, never stores credentials, and never registers a task. It only
puts the skill on your clipboard for you to review and paste.`;

// parseArgs is a tiny flag parser (pure) — no dependency on a parsing library.
export function parseArgs(argv) {
  const opts = { command: undefined, stdout: false, help: false, version: false };
  for (const a of argv) {
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--version" || a === "-v") opts.version = true;
    else if (a === "--stdout") opts.stdout = true;
    else if (!a.startsWith("-") && opts.command === undefined) opts.command = a;
  }
  return opts;
}

// run is the injectable entry point. Returns a process exit code (0 ok, 1 error)
// rather than calling process.exit, so tests can assert on it directly.
export async function run(
  argv,
  {
    skillLoader = loadBundledSkill,
    platform = process.platform,
    out = (s) => process.stdout.write(s + "\n"),
    err = (s) => process.stderr.write(s + "\n"),
    pkgVersion = "0.0.0",
  } = {},
) {
  const opts = parseArgs(argv);

  if (opts.help) {
    out(USAGE);
    return 0;
  }
  if (opts.version) {
    out(pkgVersion);
    return 0;
  }
  if (opts.command !== "setup" && opts.command !== "update") {
    err(opts.command ? `Unknown command: ${opts.command}\n` : "No command given.\n");
    err(USAGE);
    return 1;
  }

  let skill;
  try {
    skill = skillLoader();
  } catch (e) {
    err(e.message);
    return 1;
  }

  let copied = false;
  if (!opts.stdout) {
    copied = await copyToClipboard(skill.content, platform);
  }

  out(
    instructionsFor(opts.command, {
      version: skill.version,
      copied,
      content: skill.content,
      stdout: opts.stdout,
    }),
  );
  return 0;
}
