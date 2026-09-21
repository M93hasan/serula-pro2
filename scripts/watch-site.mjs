import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const frontend = join(root, "frontend");
const deployScript = join(root, "scripts", "deploy-pages.mjs");
const ignored = new Set(["dist", "node_modules", ".git"]);
let timer;
let running = false;
let pending = false;

function deploy() {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  pending = false;
  console.log(`[${new Date().toISOString()}] Değişiklik algılandı; site yayımlanıyor.`);
  const child = spawn(process.execPath, [deployScript], { cwd: root, stdio: "inherit" });
  child.on("error", (error) => {
    console.error("Yayın işlemi başlatılamadı:", error);
    running = false;
  });
  child.on("exit", (code) => {
    console.log(`[${new Date().toISOString()}] Yayın işlemi ${code === 0 ? "tamamlandı" : `hata verdi (${code})`}.`);
    running = false;
    if (pending) schedule();
  });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(deploy, 2500);
}

watch(frontend, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  const parts = String(filename).split(/[\\/]/);
  if (parts.some((part) => ignored.has(part))) return;
  if (!/\.(?:tsx?|jsx?|css|html|svg|png|jpe?g|webp|json)$/.test(String(filename))) return;
  schedule();
});

watch(root, (_event, filename) => {
  if (["package.json", "package-lock.json"].includes(String(filename))) schedule();
});

console.log(`Serula site izleyicisi başladı: ${frontend}${sep}`);
