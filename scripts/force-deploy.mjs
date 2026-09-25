import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "frontend", "dist");
const repo = "https://github.com/M93hasan/serula-pro2.git";
const temp = mkdtempSync(join(tmpdir(), "serula-force-"));

function git(...args) {
  return execFileSync("git", args, { cwd: temp, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

try {
  git("clone", "--branch", "gh-pages", "--single-branch", repo, ".");
  for (const name of readdirSync(temp)) {
    if (name !== ".git" && name !== "CNAME") {
      rmSync(join(temp, name), { recursive: true, force: true });
    }
  }
  for (const name of readdirSync(dist)) {
    cpSync(join(dist, name), join(temp, name), { recursive: true });
  }
  writeFileSync(join(temp, ".nojekyll"), "");
  writeFileSync(join(temp, "CNAME"), "serula.site\n");

  git("add", "-A");
  git("commit", "-m", "Force publish latest web build");
  git("push", "origin", "HEAD:gh-pages", "--force");
  console.log("FORCE PUBLISH SUCCESSFUL");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
