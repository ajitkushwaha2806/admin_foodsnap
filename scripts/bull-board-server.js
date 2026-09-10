import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { Queue } from "bullmq";
import Redis from "ioredis";

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
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

loadEnvFile(path.resolve(__dirname, "../.env.local"));
loadEnvFile(path.resolve(__dirname, "../.env"));

const PORT = parseInt(process.env.BULL_BOARD_PORT || "3001", 10);
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const QUEUE_NAME = "foodsnap-image-generation";

const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    return Math.min(times * 200, 3000);
  },
});

const imageQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
});

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(imageQueue)],
  serverAdapter,
});

const app = express();

app.get("/", (req, res) => {
  res.redirect("/admin/queues");
});

app.use("/admin/queues", serverAdapter.getRouter());

app.listen(PORT, () => {
  console.log("=========================================================");
  console.log("  🎯 BullMQ Official Dashboard Server Running");
  console.log(`  🌐 Dashboard URL: http://localhost:${PORT}/admin/queues`);
  console.log(`  📊 Monitored Queue: ${QUEUE_NAME}`);
  console.log("=========================================================");
});
