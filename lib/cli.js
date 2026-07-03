// @bagthejobai/apply-agent — a fetch-and-paste helper for the BagTheJob
// application-agent skill.
//
// What it does: fetches the current skill (`GET {base}/skill`) and puts it on
// your clipboard, then prints instructions for you to review and paste it into
// the Claude desktop app yourself.
//
// What it deliberately does NOT do (issue #159): it never writes the skill to a
// file, never creates `config.json`, and never registers a scheduled task. The
// human reviewing and pasting the skill is the security gate; this tool only
// moves text to your clipboard. It vendors no skill content — the server copy
// (go:embed-ed into btj-api, served at /skill) stays the single source of truth,
// so the npm package can never drift from the deployed skill.

import { spawn } from "node:child_process";

export const DEFAULT_BASE_URL = "https://app.bagthejob.ai";

// resolveBaseUrl picks the server to fetch from. Precedence: explicit --base-url
// flag > BTJ_BASE_URL env > the production default. Trailing slashes are stripped
// so `${base}/skill` never doubles up.
export function resolveBaseUrl({ flag, env } = {}) {
  const raw = (flag ?? env ?? DEFAULT_BASE_URL).trim();
  const chosen = raw === "" ? DEFAULT_BASE_URL : raw;
  return chosen.replace(/\/+$/, "");
}

// SkillFetchError carries a human-facing message; the CLI prints .message and
// exits 1 without a stack trace.
export class SkillFetchError extends Error {
  constructor(message) {
    super(message);
    this.name = "SkillFetchError";
  }
}

// fetchSkill GETs {base}/skill and validates the {version, content} shape. It
// throws SkillFetchError (never a raw network/JSON error) with a message that
// names the URL and the reason, so a caller only has to print .message.
export async function fetchSkill(baseUrl, fetchImpl = fetch) {
  const url = `${baseUrl}/skill`;
  const fail = (reason) =>
    new SkillFetchError(
      `Could not fetch the skill from ${url}: ${reason}. ` +
        `Check your connection, or pass --base-url for a local server.`,
    );

  let res;
  try {
    res = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
    });
  } catch (err) {
    throw fail(err?.message || "network error");
  }

  if (!res.ok) {
    throw fail(`server returned HTTP ${res.status}`);
  }

  let body;
  try {
    body = await res.json();
  } catch {
    // A reverse proxy or captive portal can answer 200 with an HTML error page.
    throw fail("response was not valid JSON (unexpected server or proxy page)");
  }

  const version = body?.version;
  const content = body?.content;
  if (typeof version !== "string" || version.trim() === "") {
    throw fail("response is missing a 'version' field");
  }
  if (typeof content !== "string" || content.trim() === "") {
    throw fail("response is missing a 'content' field");
  }
  return { version: version.trim(), content };
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

const DASHBOARD_URL = "/dashboard";
const BEGIN_MARK = "─── BEGIN SKILL ───";
const END_MARK = "─── END SKILL ───";

// instructionsFor builds the human-facing message (pure — no I/O). On clipboard
// success the skill content is NOT echoed (it's already on the clipboard); on
// fallback the full content is fenced between BEGIN/END markers so the user can
// select it manually. The instructions always lead with "review the skill" —
// the #159 gate — and never reference any local file the tool would write.
export function instructionsFor(command, { version, copied, content, baseUrl, stdout }) {
  const origin = baseUrl ?? DEFAULT_BASE_URL;
  const lines = [];
  const isUpdate = command === "update";

  lines.push(
    isUpdate
      ? `Latest skill Template version ${version} fetched from ${origin}`
      : `Fetched skill Template version ${version} from ${origin}`,
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
  } else {
    lines.push("This tool installs nothing. You are the install step:");
    lines.push("  1. Review the skill you just copied — you should always know what your agent runs.");
    lines.push("  2. Open the Claude desktop app (with its Chrome connector enabled).");
    lines.push("  3. Paste the skill into a new `daily-job-application` scheduled-task description.");
    lines.push(`  4. On first run, Claude walks you through setup and asks for your API key`);
    lines.push(`     (create one on your dashboard: ${origin}${DASHBOARD_URL}).`);
  }
  return lines.join("\n");
}

const USAGE = `apply-agent — fetch the BagTheJob application-agent skill to your clipboard.

Usage:
  npx @bagthejobai/apply-agent setup      Fetch the skill and copy it for first-time install
  npx @bagthejobai/apply-agent update     Fetch the latest skill and copy it to re-paste

Options:
  --base-url <url>   Override the server (default: ${DEFAULT_BASE_URL}; or set BTJ_BASE_URL)
  --stdout           Print the skill instead of using the clipboard (headless/CI)
  -h, --help         Show this help
  -v, --version      Show the CLI version

This tool never writes files, never stores credentials, and never registers a
task. It only puts the skill on your clipboard for you to review and paste.`;

// parseArgs is a tiny flag parser (pure) — no dependency on a parsing library.
export function parseArgs(argv) {
  const opts = { command: undefined, baseUrlFlag: undefined, stdout: false, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--version" || a === "-v") opts.version = true;
    else if (a === "--stdout") opts.stdout = true;
    else if (a === "--base-url") opts.baseUrlFlag = argv[++i];
    else if (a.startsWith("--base-url=")) opts.baseUrlFlag = a.slice("--base-url=".length);
    else if (!a.startsWith("-") && opts.command === undefined) opts.command = a;
    else opts.command = opts.command ?? a;
  }
  return opts;
}

// run is the injectable entry point. Returns a process exit code (0 ok, 1 error)
// rather than calling process.exit, so tests can assert on it directly.
export async function run(
  argv,
  {
    fetchImpl = fetch,
    platform = process.platform,
    env = process.env,
    out = (s) => process.stdout.write(s + "\n"),
    err = (s) => process.stderr.write(s + "\n"),
    pkgVersion = "0.1.0",
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

  const baseUrl = resolveBaseUrl({ flag: opts.baseUrlFlag, env: env.BTJ_BASE_URL });

  let skill;
  try {
    skill = await fetchSkill(baseUrl, fetchImpl);
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
      baseUrl,
      stdout: opts.stdout,
    }),
  );
  return 0;
}
