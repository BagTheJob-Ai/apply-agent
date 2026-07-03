import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import {
  parseSkillVersion,
  loadBundledSkill,
  clipboardCommandFor,
  instructionsFor,
  parseArgs,
  run,
} from "./lib/cli.js";

// The CLI bundles the skill (issue #217) and copies it to the clipboard. These
// tests inject a fake skill loader and force --stdout, so they never touch the
// real clipboard.

const SKILL_BODY = "**Template version:** `v1.23.0` — the skill.\n\nBody here.";
const fakeLoader =
  (content = SKILL_BODY) =>
  () => ({ version: parseSkillVersion(content), content });

// ── the actual bundled skill ─────────────────────────────────────────────────

test("the packaged APPLICATION_AGENT.md is present and parses a Template version", () => {
  const real = loadBundledSkill();
  expect(real.version).toMatch(/^v[0-9]+\.[0-9]+\.[0-9]+$/);
  expect(real.content).toContain("Template version");
});

test("bundled skill version matches package.json major.minor", () => {
  const { version } = loadBundledSkill();
  const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  const mm = (v: string) => v.replace(/^v/, "").split(".").slice(0, 2).join(".");
  expect(mm(version)).toBe(mm(pkg.version));
});

// ── parseSkillVersion ────────────────────────────────────────────────────────

test("parseSkillVersion extracts the version, null when absent", () => {
  expect(parseSkillVersion("**Template version:** `v2.5.1`\nrest")).toBe("v2.5.1");
  expect(parseSkillVersion("no version line here")).toBeNull();
});

// ── loadBundledSkill (injected read) ─────────────────────────────────────────

test("loadBundledSkill returns version + content on a valid skill", () => {
  const s = loadBundledSkill(() => SKILL_BODY);
  expect(s.version).toBe("v1.23.0");
  expect(s.content).toBe(SKILL_BODY);
});

test("loadBundledSkill throws on a read failure", () => {
  expect(() =>
    loadBundledSkill(() => {
      throw new Error("ENOENT");
    }),
  ).toThrow(/Could not read the bundled skill/);
});

test("loadBundledSkill throws when the Template version line is missing", () => {
  expect(() => loadBundledSkill(() => "a skill with no version header")).toThrow(/malformed/);
});

// ── clipboardCommandFor ──────────────────────────────────────────────────────

test("clipboardCommandFor picks the right command per platform", () => {
  expect(clipboardCommandFor("darwin")).toEqual([["pbcopy"]]);
  expect(clipboardCommandFor("win32")).toEqual([["clip"]]);
  const linux = clipboardCommandFor("linux");
  expect(linux[0]).toEqual(["wl-copy"]);
  expect(linux[1]).toEqual(["xclip", "-selection", "clipboard"]);
  expect(linux[2]).toEqual(["xsel", "--clipboard", "--input"]);
});

// ── instructionsFor ──────────────────────────────────────────────────────────

test("setup instructions lead with review and include version + paste steps", () => {
  const msg = instructionsFor("setup", { version: "v1.23.0", copied: true });
  expect(msg).toContain("v1.23.0");
  expect(msg).toContain("Review the skill");
  expect(msg).toContain("daily-job-application");
  expect(msg).toContain("Claude desktop app");
  expect(msg).toContain("https://app.bagthejob.ai/dashboard");
});

test("update instructions frame a clean re-paste over the existing task", () => {
  const msg = instructionsFor("update", { version: "v2.0.0", copied: true });
  expect(msg).toContain("v2.0.0");
  expect(msg).toContain("over the existing task description");
  expect(msg).toContain("references/ is untouched");
});

test("instructions never reference writing a local skill file (issue #159 gate)", () => {
  for (const command of ["setup", "update"]) {
    const msg = instructionsFor(command, { version: "v1", copied: true });
    expect(msg).not.toMatch(/APPLICATION_AGENT\.md/);
    expect(msg).not.toMatch(/config\.json/);
    expect(msg.toLowerCase()).not.toMatch(/wrote|writing .*file|saved to/);
  }
});

test("clipboard-fallback prints the full skill between BEGIN/END markers", () => {
  const msg = instructionsFor("setup", { version: "v1", copied: false, content: SKILL_BODY });
  expect(msg).toContain("BEGIN SKILL");
  expect(msg).toContain("END SKILL");
  expect(msg).toContain(SKILL_BODY);
});

test("--stdout wording distinguishes a chosen stdout from a broken clipboard", () => {
  const chosen = instructionsFor("setup", { version: "v1", copied: false, content: "x", stdout: true });
  expect(chosen).toContain("--stdout");
  expect(chosen).not.toContain("Clipboard unavailable");
  const broken = instructionsFor("setup", { version: "v1", copied: false, content: "x", stdout: false });
  expect(broken).toContain("Clipboard unavailable");
});

// ── parseArgs ────────────────────────────────────────────────────────────────

test("parseArgs reads command and flags (no --base-url anymore)", () => {
  expect(parseArgs(["setup"]).command).toBe("setup");
  expect(parseArgs(["update", "--stdout"]).stdout).toBe(true);
  expect(parseArgs(["--help"]).help).toBe(true);
  expect(parseArgs(["-v"]).version).toBe(true);
});

// ── run ──────────────────────────────────────────────────────────────────────

function capture() {
  const lines: string[] = [];
  return { sink: (s: string) => lines.push(s), lines };
}

test("run setup with injected skill and --stdout exits 0 and prints the skill", async () => {
  const o = capture();
  const code = await run(["setup", "--stdout"], {
    skillLoader: fakeLoader(),
    out: o.sink,
    err: o.sink,
  });
  expect(code).toBe(0);
  expect(o.lines.join("\n")).toContain(SKILL_BODY);
  expect(o.lines.join("\n")).toContain("v1.23.0");
});

test("run update exits 0 under --stdout", async () => {
  const o = capture();
  const code = await run(["update", "--stdout"], {
    skillLoader: fakeLoader("**Template version:** `v3.1.0`\nbody"),
    out: o.sink,
    err: o.sink,
  });
  expect(code).toBe(0);
  expect(o.lines.join("\n")).toContain("v3.1.0");
});

test("run returns exit 1 when the bundled skill can't load", async () => {
  const o = capture();
  const code = await run(["setup"], {
    skillLoader: () => {
      throw new Error("Bundled skill is missing or malformed (no Template version line).");
    },
    out: o.sink,
    err: o.sink,
  });
  expect(code).toBe(1);
  expect(o.lines.join("\n")).toContain("malformed");
});

test("run returns exit 1 for an unknown or missing command", async () => {
  expect(await run(["frobnicate"], { out: () => {}, err: () => {} })).toBe(1);
  expect(await run([], { out: () => {}, err: () => {} })).toBe(1);
});

test("run --help and --version exit 0 without loading the skill", async () => {
  let loaded = false;
  const skillLoader = () => {
    loaded = true;
    return { version: "v1", content: "x" };
  };
  expect(await run(["--help"], { skillLoader, out: () => {}, err: () => {} })).toBe(0);
  expect(await run(["--version"], { skillLoader, out: () => {}, err: () => {}, pkgVersion: "1.23.1" })).toBe(0);
  expect(loaded).toBe(false);
});
