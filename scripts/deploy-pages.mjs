import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "frontend", "dist");
const repo = "https://github.com/M93hasan/serula-pro2.git";
const temp = mkdtempSync(join(tmpdir(), "serula-pages-"));

function git(...args) {
  return execFileSync("git", args, { cwd: temp, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

try {
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", "npm run build:frontend"], { cwd: root, stdio: "inherit" });
  } else {
    execFileSync("npm", ["run", "build:frontend"], { cwd: root, stdio: "inherit" });
  }
  git("clone", "--branch", "gh-pages", "--single-branch", repo, ".");

  // Google Cloud Shell gibi geçici ortamlarda Git kimlik hatasını önlemek için yerel bilgileri tanımla
  git("config", "user.name", "Serula Deploy Bot");
  git("config", "user.email", "deploy-bot@serula.site");

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
  try {
    git("diff", "--cached", "--quiet");
    console.log("Web sürümü zaten güncel.");
  } catch {
    git("commit", "-m", "Publish latest web build");
    git("push", "origin", "HEAD:gh-pages");
    console.log("Web sürümü GitHub Pages'e gönderildi.");
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
