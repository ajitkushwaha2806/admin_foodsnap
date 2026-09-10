import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

const { processAndStoreOptimizedImage } = await import("../src/lib/image-optimizer/optimizer.js");
const { receiveOptimizationJobs, deleteOptimizationJob, parseSqsMessage } = await import("../src/lib/aws/sqs.js");
const { default: dbConnect } = await import("../src/lib/dbConnect.js");
const { default: ImageModel } = await import("../src/models/Image.js");

let isRunning = true;

async function processJobItem(item) {
  const { s3Key, imageUrl, imageId, fileName } = item;

  if (s3Key && (s3Key.startsWith("optimised/") || s3Key.endsWith(".avif"))) {
    console.log(`[Worker] Skipping already optimized S3 Key: ${s3Key}`);
    return { skipped: true };
  }

  if (imageUrl && (imageUrl.includes("/optimised/") || imageUrl.endsWith(".avif"))) {
    console.log(`[Worker] Skipping already optimized URL: ${imageUrl}`);
    return { skipped: true };
  }

  let resolvedImageId = imageId;
  if (!resolvedImageId && (s3Key || imageUrl)) {
    try {
      await dbConnect();
      const matchDoc = await ImageModel.findOne({
        $or: [
          ...(imageUrl ? [{ image_url: imageUrl }] : []),
          ...(s3Key ? [{ image_url: { $regex: s3Key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") } }] : []),
        ],
      }).lean();

      if (matchDoc) {
        resolvedImageId = matchDoc._id.toString();
      }
    } catch (dbErr) {
      console.warn("[Worker DB lookup warning]:", dbErr.message);
    }
  }

  const source = s3Key || imageUrl;
  if (!source) {
    throw new Error("No valid S3 key or URL in SQS message item");
  }

  console.log(`[Worker] Processing image: ${source} (ID: ${resolvedImageId || "standalone"})`);
  const startTime = Date.now();

  const result = await processAndStoreOptimizedImage({
    source,
    imageId: resolvedImageId,
    s3Key,
    originalUrl: imageUrl,
    fileName,
  });

  const durationMs = Date.now() - startTime;
  console.log(
    `[Worker ✅ Success] Output: ${result.s3Key} (${result.dimensions}) | Size: ${(
      result.originalSizeBytes / 1024
    ).toFixed(1)}KB -> ${(result.optimizedSizeBytes / 1024).toFixed(1)}KB (${result.savedPercentage} saved) in ${durationMs}ms`
  );

  return result;
}

async function startWorker() {
  console.log("=================================================");
  console.log("  Foodsnap SQS Image Optimization Worker Active  ");
  console.log("  Target: 4:3 Aspect Ratio (1200x900) -> AVIF   ");
  console.log("  Destination: optimised/<filename>.avif         ");
  console.log("=================================================");

  const queueUrl = process.env.AWS_SQS_QUEUE_URL;
  if (!queueUrl) {
    console.warn("⚠️  WARNING: AWS_SQS_QUEUE_URL is not defined in .env!");
    console.warn("   Worker is in standby mode. Set AWS_SQS_QUEUE_URL to start processing queue.");
  }

  while (isRunning) {
    try {
      const messages = await receiveOptimizationJobs({
        maxMessages: 5,
        waitTimeSeconds: 10,
        visibilityTimeout: 60,
      });

      if (messages && messages.length > 0) {
        console.log(`[Worker] Received ${messages.length} message(s) from SQS.`);

        for (const message of messages) {
          let shouldDelete = false;
          try {
            const jobItems = parseSqsMessage(message.Body);

            if (!jobItems || jobItems.length === 0) {
              console.warn(`[Worker ⚠️ Discarding unparseable SQS message ${message.MessageId}]`);
              shouldDelete = true;
            } else {
              for (const item of jobItems) {
                await processJobItem(item);
              }
              shouldDelete = true;
            }
          } catch (itemErr) {
            console.error(`[Worker ❌ Error processing message ${message.MessageId}]:`, itemErr.message);
            // If the message has corrupt/missing payload, delete it so it does not loop infinitely
            if (
              itemErr.message.includes("No valid S3 key or URL") ||
              itemErr.message.includes("JSON") ||
              itemErr.message.includes("undefined") ||
              itemErr.message.includes("null")
            ) {
              console.warn(`[Worker 🗑️ Discarding malformed message ${message.MessageId} from SQS]`);
              shouldDelete = true;
            }
          } finally {
            if (shouldDelete) {
              try {
                await deleteOptimizationJob(message.ReceiptHandle);
              } catch (delErr) {
                console.warn(`[Worker Delete warning]:`, delErr.message);
              }
            }
          }
        }
      }
    } catch (loopErr) {
      console.error("[Worker Loop Error]:", loopErr.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  console.log("[Worker] Graceful shutdown completed.");
  process.exit(0);
}

process.on("SIGINT", () => {
  console.log("\n[Worker] Received SIGINT. Stopping worker loop...");
  isRunning = false;
});

process.on("SIGTERM", () => {
  console.log("\n[Worker] Received SIGTERM. Stopping worker loop...");
  isRunning = false;
});

startWorker();
