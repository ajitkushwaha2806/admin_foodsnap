import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SQSClient, PurgeQueueCommand, ReceiveMessageCommand, DeleteMessageBatchCommand } from "@aws-sdk/client-sqs";

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

const queueUrl = process.env.AWS_SQS_QUEUE_URL;
const region = process.env.AWS_SQS_REGION || process.env.AWS_REGION || "ap-southeast-2";

if (!queueUrl) {
  console.error("❌ AWS_SQS_QUEUE_URL is not set");
  process.exit(1);
}

const sqsClient = new SQSClient({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

async function clearQueue() {
  console.log("=================================================");
  console.log("  🧹 Clearing / Purging SQS Queue                ");
  console.log(`  Queue URL: ${queueUrl}`);
  console.log("=================================================\n");

  try {
    console.log("Attempting PurgeQueueCommand...");
    await sqsClient.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
    console.log("✅ Successfully purged all messages from SQS Queue!");
    process.exit(0);
  } catch (err) {
    console.warn(`⚠️ PurgeQueueCommand failed (${err.message}). Falling back to manual receive & batch delete...`);

    let totalDeleted = 0;
    while (true) {
      const res = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 2,
          VisibilityTimeout: 10,
        })
      );

      const messages = res.Messages || [];
      if (messages.length === 0) {
        console.log(`✅ Queue is now completely empty! (Deleted ${totalDeleted} messages)`);
        break;
      }

      await sqsClient.send(
        new DeleteMessageBatchCommand({
          QueueUrl: queueUrl,
          Entries: messages.map((m, idx) => ({
            Id: `msg_${idx}_${Date.now()}`,
            ReceiptHandle: m.ReceiptHandle,
          })),
        })
      );

      totalDeleted += messages.length;
      console.log(`   Deleted ${messages.length} messages (Total deleted so far: ${totalDeleted})`);
    }

    console.log("\n=================================================");
    console.log(`🎉 SQS Queue Cleared! Total messages removed: ${totalDeleted}`);
    console.log("=================================================");
    process.exit(0);
  }
}

clearQueue().catch((err) => {
  console.error("❌ Fatal error clearing SQS:", err);
  process.exit(1);
});
