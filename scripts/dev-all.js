import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("==========================================================");
console.log("🚀 FoodSnap All-in-One Development Orchestrator");
console.log("==========================================================");

// Check if local ComfyUI exists on this Mac laptop
const homeDir = os.homedir();
const defaultComfyDir = path.join(homeDir, "ComfyUI-Installs/Comfy ui/ComfyUI");
const altComfyDir = path.join(homeDir, "ComfyUI");
const hasLocalComfy =
  fs.existsSync(defaultComfyDir) ||
  fs.existsSync(altComfyDir) ||
  fs.existsSync(path.join(homeDir, "Library/Application Support/Comfy Desktop"));

// Local ComfyUI is only started if explicitly enabled with ENABLE_LOCAL_COMFY=true
const enableLocalComfy = process.env.ENABLE_LOCAL_COMFY === "true";
const services = [];

if (enableLocalComfy && hasLocalComfy) {
  console.log("  [1] Local ComfyUI (Mac GPU) -> http://127.0.0.1:8188");
  services.push({
    name: "COMFY-LOCAL",
    color: "\x1b[33m", // Yellow
    command: "bash",
    args: ["scripts/start-comfy.sh"],
    env: { ...process.env },
  });
}

console.log(`  [${services.length + 1}] Next.js Web App         -> http://localhost:3000`);
services.push({
  name: "NEXT",
  color: "\x1b[36m", // Cyan
  command: "npx",
  args: ["next", "dev"],
  env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=1024" },
});

console.log(`  [${services.length + 1}] Bull Board Dashboard    -> http://localhost:3001/admin/queues`);
services.push({
  name: "BOARD",
  color: "\x1b[35m", // Magenta
  command: "node",
  args: ["scripts/bull-board-server.js"],
  env: { ...process.env, PORT: "3001" },
});

console.log(`  [${services.length + 1}] Multi-GPU Worker Pool   -> Dual GPU (Mac + EC2)`);
services.push({
  name: "WORKER",
  color: "\x1b[32m", // Green
  command: "node",
  args: ["scripts/start-gpu-pool.js"],
  env: { ...process.env },
});

console.log("----------------------------------------------------------\n");

const children = [];
const resetColor = "\x1b[0m";

services.forEach((service) => {
  const child = spawn(service.command, service.args, {
    cwd: rootDir,
    env: service.env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  children.push(child);

  const prefix = `${service.color}[${service.name}]${resetColor} `;

  child.stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    lines.forEach((line) => {
      if (line.trim()) process.stdout.write(`${prefix}${line}\n`);
    });
  });

  child.stderr.on("data", (data) => {
    const lines = data.toString().split("\n");
    lines.forEach((line) => {
      if (line.trim()) process.stderr.write(`${prefix}${line}\n`);
    });
  });

  child.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      console.warn(`${prefix}Exited with code ${code}`);
    }
  });
});

// Graceful cleanup on Ctrl + C
function cleanup() {
  console.log("\n\x1b[33m🛑 Stopping all FoodSnap services...\x1b[0m");
  children.forEach((child) => {
    try {
      child.kill("SIGTERM");
    } catch {}
  });
  setTimeout(() => {
    children.forEach((child) => {
      try {
        child.kill("SIGKILL");
      } catch {}
    });
    process.exit(0);
  }, 1000);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
