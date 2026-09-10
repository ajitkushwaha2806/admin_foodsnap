import fs from "fs";
import path from "path";
import { fork } from "child_process";
import { fileURLToPath } from "url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        process.env[key] = val;
      }
    }
  }
}

loadEnvFile(path.resolve(__dirname, "../.env.local"));
loadEnvFile(path.resolve(__dirname, "../.env"));

// Parse GPU servers list
// Format in .env: COMFYUI_SERVERS="http://13.55.57.70:8188,http://54.252.12.33:8188"
const envServers = process.env.COMFYUI_SERVERS
  ? process.env.COMFYUI_SERVERS.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

const defaultServer =
  process.env.COMFYUI_SERVER_URL ||
  process.env.NEXT_PUBLIC_COMFYUI_SERVER_URL ||
  "http://13.55.57.70:8188";

const candidateServers = envServers.length > 0 ? envServers : [defaultServer];

async function checkComfyHealth(serverUrl) {
  const cleanBase = serverUrl.replace(/\/$/, "");
  try {
    const res = await axios.get(`${cleanBase}/system_stats`, { timeout: 4000 });
    return res.status === 200;
  } catch {
    return false;
  }
}

const activeWorkers = new Map();

function spawnWorker(serverUrl, index) {
  const workerScript = path.resolve(__dirname, "bullmq-image-worker.js");
  const env = {
    ...process.env,
    COMFYUI_SERVER_URL: serverUrl,
    WORKER_INDEX: String(index + 1),
  };

  console.log(`[GPU Pool Manager 🚀] Spawning Worker #${index + 1} for GPU: ${serverUrl}`);

  const child = fork(workerScript, [], {
    env,
    stdio: "inherit",
  });

  activeWorkers.set(serverUrl, { child, index });

  child.on("exit", (code, signal) => {
    console.warn(`[GPU Pool Manager ⚠️] Worker #${index + 1} (${serverUrl}) exited (code: ${code}, signal: ${signal}).`);
    activeWorkers.delete(serverUrl);

    // Auto-restart after 5 seconds if not explicitly killed
    setTimeout(async () => {
      console.log(`[GPU Pool Manager 🔄] Re-checking health of GPU ${serverUrl}...`);
      const isUp = await checkComfyHealth(serverUrl);
      if (isUp) {
        spawnWorker(serverUrl, index);
      } else {
        console.warn(`[GPU Pool Manager ⏳] GPU ${serverUrl} still offline. Will retry in 15s...`);
        scheduleReconnect(serverUrl, index);
      }
    }, 5000);
  });
}

function scheduleReconnect(serverUrl, index) {
  setTimeout(async () => {
    if (activeWorkers.has(serverUrl)) return;
    const isUp = await checkComfyHealth(serverUrl);
    if (isUp) {
      spawnWorker(serverUrl, index);
    } else {
      scheduleReconnect(serverUrl, index);
    }
  }, 15000);
}

async function main() {
  console.log("=========================================================");
  console.log("⚡ FoodSnap Multi-GPU Worker Pool Fleet Manager");
  console.log("=========================================================");
  console.log(`Candidate GPU Servers (${candidateServers.length}):`);
  candidateServers.forEach((url, i) => console.log(`  [GPU #${i + 1}] ${url}`));
  console.log("---------------------------------------------------------");

  for (let i = 0; i < candidateServers.length; i++) {
    const serverUrl = candidateServers[i];
    console.log(`Checking connection to GPU #${i + 1}: ${serverUrl}...`);
    const isUp = await checkComfyHealth(serverUrl);

    if (isUp) {
      console.log(`✓ GPU #${i + 1} (${serverUrl}) is ONLINE!`);
      spawnWorker(serverUrl, i);
    } else {
      console.warn(`⚠️ GPU #${i + 1} (${serverUrl}) is currently offline / starting.`);
      console.log(`  Worker will automatically attach as soon as the instance starts.`);
      scheduleReconnect(serverUrl, i);
    }
  }

  // Handle graceful shutdown
  const shutdown = () => {
    console.log("\n[GPU Pool Manager] Shutting down all GPU worker processes...");
    for (const [url, { child }] of activeWorkers.entries()) {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("❌ GPU Pool Manager fatal error:", err);
  process.exit(1);
});
