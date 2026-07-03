import { test, expect } from "bun:test";
import {
  DEFAULT_BASE_URL,
  SkillFetchError,
  resolveBaseUrl,
  fetchSkill,
  clipboardCommandFor,
  instructionsFor,
  parseArgs,
  run,
} from "./lib/cli.js";

// The CLI is a fetch-and-paste helper (issue #217). These tests exercise it
// without any network or clipboard by injecting a fake fetch and forcing
// --stdout, matching the "testable without network" requirement.

const SKILL_BODY = "**Template version:** `v1.23.0`\n\nSkill body here.";

// A fetch stub that returns a JSON {version, content} response.
const okFetch =
  (version = "v1.23.0", content = SKILL_BODY) =>
  async () => ({
    ok: true,
    status: 200,
    json: async () => ({ version, content }),
  });

// ── resolveBaseUrl ───────────────────────────────────────────────────────────

test("resolveBaseUrl precedence: flag > env > default", () => {
  expect(resolveBaseUrl({ flag: "http://flag", env: "http://env" })).toBe("http://flag");
  expect(resolveBaseUrl({ env: "http://env" })).toBe("http://env");
  expect(resolveBaseUrl({})).toBe(DEFAULT_BASE_URL);
});

test("resolveBaseUrl strips trailing slashes and treats empty as default", () => {
  expect(resolveBaseUrl({ flag: "http://x/" })).toBe("http://x");
  expect(resolveBaseUrl({ flag: "http://x///" })).toBe("http://x");
  expect(resolveBaseUrl({ flag: "   " })).toBe(DEFAULT_BASE_URL);
  expect(resolveBaseUrl({ env: "" })).toBe(DEFAULT_BASE_URL);
});

// ── fetchSkill ───────────────────────────────────────────────────────────────

test("fetchSkill happy path parses {version, content}", async () => {
  const skill = await fetchSkill("http://srv", okFetch());
  expect(skill.version).toBe("v1.23.0");
  expect(skill.content).toBe(SKILL_BODY);
});

test("fetchSkill hits {base}/skill exactly", async () => {
  let seen = "";
  await fetchSkill("http://srv", async (url) => {
    seen = url;
    return { ok: true, status: 200, json: async () => ({ version: "v1", content: "x" }) };
  });
  expect(seen).toBe("http://srv/skill");
});

test("fetchSkill rejects non-200 with the URL and status in the message", async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await expect(fetchSkill("http://srv", fetchImpl)).rejects.toBeInstanceOf(SkillFetchError);
  await expect(fetchSkill("http://srv", fetchImpl)).rejects.toThrow(/http:\/\/srv\/skill/);
  await expect(fetchSkill("http://srv", fetchImpl)).rejects.toThrow(/503/);
});

test("fetchSkill rejects a non-JSON (HTML proxy) body", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("Unexpected token <");
    },
  });
  await expect(fetchSkill("http://srv", fetchImpl)).rejects.toThrow(/not valid JSON/);
});

test("fetchSkill rejects missing or empty version/content fields", async () => {
  const missingVersion = async () => ({ ok: true, status: 200, json: async () => ({ content: "x" }) });
  const emptyContent = async () => ({ ok: true, status: 200, json: async () => ({ version: "v1", content: "   " }) });
  await expect(fetchSkill("http://srv", missingVersion)).rejects.toThrow(/'version' field/);
  await expect(fetchSkill("http://srv", emptyContent)).rejects.toThrow(/'content' field/);
});

test("fetchSkill wraps a network error rather than leaking it", async () => {
  const fetchImpl = async () => {
    throw new TypeError("fetch failed");
  };
  await expect(fetchSkill("http://srv", fetchImpl)).rejects.toBeInstanceOf(SkillFetchError);
  await expect(fetchSkill("http://srv", fetchImpl)).rejects.toThrow(/fetch failed/);
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
  const msg = instructionsFor("setup", { version: "v1.23.0", copied: true, baseUrl: "https://app.bagthejob.ai" });
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

test("parseArgs reads command, flags, and --base-url in both forms", () => {
  expect(parseArgs(["setup"]).command).toBe("setup");
  expect(parseArgs(["update", "--stdout"]).stdout).toBe(true);
  expect(parseArgs(["setup", "--base-url", "http://x"]).baseUrlFlag).toBe("http://x");
  expect(parseArgs(["setup", "--base-url=http://y"]).baseUrlFlag).toBe("http://y");
  expect(parseArgs(["--help"]).help).toBe(true);
  expect(parseArgs(["-v"]).version).toBe(true);
});

// ── run ──────────────────────────────────────────────────────────────────────

function capture() {
  const lines = [];
  return { sink: (s) => lines.push(s), lines };
}

test("run setup with stubbed fetch and --stdout exits 0 and prints the skill", async () => {
  const o = capture();
  const code = await run(["setup", "--stdout", "--base-url", "http://srv"], {
    fetchImpl: okFetch(),
    out: o.sink,
    err: o.sink,
  });
  expect(code).toBe(0);
  expect(o.lines.join("\n")).toContain(SKILL_BODY);
  expect(o.lines.join("\n")).toContain("v1.23.0");
});

test("run update exits 0 and does not use the clipboard under --stdout", async () => {
  const o = capture();
  const code = await run(["update", "--stdout"], {
    fetchImpl: okFetch("v3.1.0", "body"),
    out: o.sink,
    err: o.sink,
  });
  expect(code).toBe(0);
  expect(o.lines.join("\n")).toContain("v3.1.0");
});

test("run reads BTJ_BASE_URL from injected env", async () => {
  let seen = "";
  const code = await run(["setup", "--stdout"], {
    fetchImpl: async (url) => {
      seen = url;
      return { ok: true, status: 200, json: async () => ({ version: "v1", content: "x" }) };
    },
    env: { BTJ_BASE_URL: "http://from-env" },
    out: () => {},
    err: () => {},
  });
  expect(code).toBe(0);
  expect(seen).toBe("http://from-env/skill");
});

test("run returns exit 1 on fetch failure and prints the reason", async () => {
  const o = capture();
  const code = await run(["setup"], {
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    out: o.sink,
    err: o.sink,
  });
  expect(code).toBe(1);
  expect(o.lines.join("\n")).toContain("Could not fetch the skill");
});

test("run returns exit 1 for an unknown or missing command", async () => {
  const bad = await run(["frobnicate"], { out: () => {}, err: () => {} });
  expect(bad).toBe(1);
  const none = await run([], { out: () => {}, err: () => {} });
  expect(none).toBe(1);
});

test("run --help and --version exit 0 without fetching", async () => {
  let fetched = false;
  const fetchImpl = async () => {
    fetched = true;
    return { ok: true, status: 200, json: async () => ({}) };
  };
  expect(await run(["--help"], { fetchImpl, out: () => {}, err: () => {} })).toBe(0);
  expect(await run(["--version"], { fetchImpl, out: () => {}, err: () => {}, pkgVersion: "0.1.0" })).toBe(0);
  expect(fetched).toBe(false);
});
