import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseSkillVersion } from "./lib/cli.js";

// Release gate. This repo is the single source of truth for the skill
// (APPLICATION_AGENT.md); skill.lock pins its Template version to a content hash,
// so the skill can never change without a deliberate version bump. This is the
// guard that used to live in the private repo's Go test (skill_test.go) — it moves
// here, next to the content it protects, when the skill is consolidated into this
// repo. Regenerate after a real edit: bump **Template version** in
// APPLICATION_AGENT.md, then set skill.lock.sha256 to `shasum -a 256 APPLICATION_AGENT.md`.

const skillPath = new URL("./APPLICATION_AGENT.md", import.meta.url);
const lockPath = new URL("./skill.lock", import.meta.url);

test("skill.lock version and sha256 match APPLICATION_AGENT.md", () => {
  const content = readFileSync(skillPath, "utf8");
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const version = parseSkillVersion(content);
  const sha256 = createHash("sha256").update(content, "utf8").digest("hex");

  expect(version).toMatch(/^v[0-9]+\.[0-9]+\.[0-9]+$/);
  expect(lock.version).toBe(version);
  expect(lock.sha256).toBe(sha256);
});
