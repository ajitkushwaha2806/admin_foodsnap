import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { Worker } from "bullmq";
import axios from "axios";
import sharp from "sharp";
import mongoose from "mongoose";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import Redis from "ioredis";
import { buildComfyWorkflowPrompt, DEFAULT_WORKFLOW_CONFIG } from "../src/lib/comfyui/workflow-builder.js";

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
        if (key !== "COMFYUI_SERVER_URL" && key !== "WORKER_INDEX") {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile(path.resolve(__dirname, "../.env.local"));
loadEnvFile(path.resolve(__dirname, "../.env"));

const QUEUE_NAME = "foodsnap-image-generation";
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const MONGODB_URI = process.env.MONGODB_URI;
const S3_BUCKET = process.env.AWS_S3_BUCKET || "foodsnap-studio";
const AWS_REGION = process.env.AWS_REGION || "ap-southeast-2";
const COMFYUI_SERVER_URL =
  process.env.COMFYUI_SERVER_URL ||
  process.env.NEXT_PUBLIC_COMFYUI_SERVER_URL ||
  "http://13.55.57.70:8188";

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

// Redis connection for BullMQ Worker
const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    return Math.min(times * 200, 3000);
  },
});

// Connect to MongoDB
async function connectDb() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGODB_URI);
}

// Schemas
const ImageSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    tags: [String],
    cuisine: { type: String },
    image_url: { type: String, required: true },
    optimised_image_url: { type: String },
    is_optimized: { type: Boolean, default: false },
    approved: { type: Boolean, default: false },
    premium: { type: Boolean, default: false },
    category: { type: String },
    sub_category: { type: String },
    food_type: { type: String },
    productId: { type: String },
    downloads: { type: Number, default: 0 },
    latest: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const BackgroundSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    image_url: { type: String, required: true },
    s3_key: { type: String },
  },
  { timestamps: true }
);

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    image_url: { type: String },
    category: { type: String },
    sub_category: { type: String },
    dietaryType: { type: String },
    processed: { type: Boolean, default: false },
    ai_image_url: { type: String },
  },
  { timestamps: true }
);

const ImageModel = mongoose.models.Image || mongoose.model("Image", ImageSchema);
const BackgroundModel = mongoose.models.Background || mongoose.model("Background", BackgroundSchema);
const ProductModel = mongoose.models.Product || mongoose.model("Product", ProductSchema);

/**
 * Upload a buffer to S3
 */
async function uploadBufferToS3(buffer, key, contentType) {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3Client.send(command);
  const url = `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
  return { key, url };
}

/**
 * Check if ComfyUI is online and reachable
 */
async function checkComfyHealth(serverUrl) {
  const cleanBase = serverUrl.replace(/\/$/, "");
  try {
    const res = await axios.get(`${cleanBase}/system_stats`, { timeout: 4000 });
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Upload image buffer to ComfyUI
 */
async function uploadImageToComfy(buffer, filename, serverUrl) {
  const cleanBase = serverUrl.replace(/\/$/, "");
  const FormData = (await import("form-data")).default;
  const form = new FormData();
  form.append("image", buffer, { filename });
  form.append("overwrite", "true");

  const res = await axios.post(`${cleanBase}/upload/image`, form, {
    headers: form.getHeaders(),
    timeout: 30000,
  });

  return res.data?.name || filename;
}

/**
 * Fetch image buffer from a URL
 */
async function fetchImageBuffer(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
  });
  return Buffer.from(res.data);
}

function getGpuLabel(url, workerIndex) {
  if (!url) return "⚡ GPU";
  if (url.includes("127.0.0.1") || url.includes("localhost")) {
    return "💻 Mac Laptop GPU (MPS)";
  }
  if (url.includes("13.55.57.70")) {
    return "🚀 EC2 GPU #1 (Tesla T4)";
  }
  if (url.includes("32.236.82.142") || url.includes("52.63.162.8")) {
    return "🚀 EC2 GPU #2 (Tesla T4)";
  }
  if (url.includes("52.63.78.171") || url.includes("3.107.207.180")) {
    return "🚀 EC2 GPU #3 (Tesla T4)";
  }
  try {
    const parsed = new URL(url);
    return `⚡ GPU ${workerIndex ? `#${workerIndex} ` : ""}(${parsed.hostname})`;
  } catch {
    return `⚡ GPU (${url})`;
  }
}

/**
 * BullMQ Worker job handler
 */
async function processJob(job) {
  const data = job.data;
  const dishName = data.name || data.title || "Dish Item";
  const serverUrl = process.env.COMFYUI_SERVER_URL || COMFYUI_SERVER_URL || data.config?.serverUrl;
  const cleanServerUrl = (serverUrl || "http://13.55.57.70:8188").replace(/\/$/, "");
  const workerTag = process.env.WORKER_INDEX
    ? `[GPU Worker #${process.env.WORKER_INDEX}]`
    : "[BullMQ Worker]";
  const gpuLabel = getGpuLabel(cleanServerUrl, process.env.WORKER_INDEX);

  console.log(`\n======================================================`);
  console.log(`${workerTag} 🚀 Starting Job #${job.id}: "${dishName}"`);
  console.log(`${workerTag} Target GPU: ${gpuLabel} (${cleanServerUrl})`);
  console.log(`======================================================`);

  if (data.productId || data._id) {
    const prodId = data.productId || data._id;
    await ProductModel.updateOne(
      { _id: prodId },
      { $set: { process_status: "processing", last_job_id: String(job.id) } }
    ).catch(() => {});
  }

  await job.updateProgress({ percent: 5, step: "Starting", gpu: gpuLabel, serverUrl: cleanServerUrl });

  // 1. Check ComfyUI server status
  let isComfyUp = await checkComfyHealth(cleanServerUrl);
  if (!isComfyUp) {
    console.warn(`[BullMQ Worker ⚠️] ComfyUI server at ${cleanServerUrl} is offline / unreachable.`);
    console.warn(`[BullMQ Worker ⏳] Waiting up to 60s for EC2 GPU instance to start...`);

    for (let waitSec = 0; waitSec < 12; waitSec++) {
      await new Promise((r) => setTimeout(r, 5000));
      isComfyUp = await checkComfyHealth(cleanServerUrl);
      if (isComfyUp) {
        console.log(`[BullMQ Worker ✅] ComfyUI server detected ONLINE! Proceeding...`);
        break;
      }
    }

    if (!isComfyUp) {
      throw new Error(
        `ComfyUI server at ${cleanServerUrl} is unreachable. Make sure your EC2 GPU instance is running.`
      );
    }
  }

  await job.updateProgress({ percent: 15, step: "Connecting to GPU", gpu: gpuLabel, serverUrl: cleanServerUrl });

  // 2. Fetch and prepare Dish Subject Image
  let rawSubjectUrl = data.image_url || data.originalUrl || data.fileUrl;
  if (!rawSubjectUrl) {
    throw new Error(`Job #${job.id} has no image_url for dish "${dishName}"`);
  }

  console.log(`[BullMQ Worker] Fetching subject dish image: ${rawSubjectUrl}`);
  const subjectRawBuffer = await fetchImageBuffer(rawSubjectUrl);
  
  // Extract original incoming image dimensions
  const subjectMeta = await sharp(subjectRawBuffer).metadata();
  const targetWidth = subjectMeta.width || 1200;
  const targetHeight = subjectMeta.height || 900;
  console.log(`[BullMQ Worker] Incoming dish dimensions: ${targetWidth}x${targetHeight}`);

  // Resize to max 1400px with high fidelity for ComfyUI diffusion
  const subjectOptimizedBuffer = await sharp(subjectRawBuffer)
    .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 6 })
    .toBuffer();

  const subjectComfyFilename = `subject_${job.id}_${Date.now()}.png`;
  await uploadImageToComfy(subjectOptimizedBuffer, subjectComfyFilename, cleanServerUrl);
  console.log(`[BullMQ Worker] ✓ Subject uploaded to ComfyUI as: ${subjectComfyFilename}`);

  await job.updateProgress({ percent: 30, step: "Subject Uploaded", gpu: gpuLabel, serverUrl: cleanServerUrl });

  // In-memory cache for uploaded background images across batch jobs
  // Key: bgUrl, Value: comfyFilename
  let bgComfyFilename = null;
  let bgUrl = data.backgroundUrl || data.config?.backgroundUrl;

  if (!bgUrl) {
    const presetBg = await BackgroundModel.findOne({ is_preset: true }).lean();
    if (presetBg?.image_url) {
      bgUrl = presetBg.image_url;
    } else {
      const anyBg = await BackgroundModel.findOne().lean();
      if (anyBg?.image_url) bgUrl = anyBg.image_url;
    }
  }

  // Check if background is already uploaded to ComfyUI
  if (bgUrl && global.__bgUploadCache && global.__bgUploadCache.has(bgUrl)) {
    bgComfyFilename = global.__bgUploadCache.get(bgUrl);
    console.log(`[BullMQ Worker ⚡] Reusing cached background in ComfyUI: ${bgComfyFilename}`);
  } else {
    let bgBuffer = null;
    if (bgUrl) {
      console.log(`[BullMQ Worker] Fetching background surface: ${bgUrl}`);
      const rawBgBuffer = await fetchImageBuffer(bgUrl);
      bgBuffer = await sharp(rawBgBuffer)
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    } else {
      console.log(`[BullMQ Worker] Generating default studio background surface...`);
      bgBuffer = await sharp({
        create: {
          width: 1200,
          height: 900,
          channels: 3,
          background: { r: 35, g: 30, b: 25 },
        },
      })
        .jpeg()
        .toBuffer();
    }

    bgComfyFilename = `bg_${crypto.randomBytes(4).toString("hex")}_${Date.now()}.jpg`;
    await uploadImageToComfy(bgBuffer, bgComfyFilename, cleanServerUrl);
    console.log(`[BullMQ Worker] ✓ Background uploaded to ComfyUI as: ${bgComfyFilename}`);

    if (!global.__bgUploadCache) global.__bgUploadCache = new Map();
    if (bgUrl) global.__bgUploadCache.set(bgUrl, bgComfyFilename);
  }

  await job.updateProgress({ percent: 45, step: "Background Ready", gpu: gpuLabel, serverUrl: cleanServerUrl });

  // 4. Build & submit Workflow Prompt to ComfyUI
  const promptTemplate =
    data.customPrompt ||
    data.config?.promptTemplate ||
    "Replace the background and surface of reference_image1 with the wooden table and warm restaurant surface from reference_image2. Keep the main dish, bowls, and garnishes sharp, delicious, and intact with studio food lighting.";

  const promptText = promptTemplate.replace("{subject}", dishName);

  const workflowPrompt = buildComfyWorkflowPrompt({
    subjectImageFilename: subjectComfyFilename,
    backgroundImageFilename: bgComfyFilename,
    promptText,
    config: {
      ...DEFAULT_WORKFLOW_CONFIG,
      ...(data.config || {}),
    },
  });

  const clientId = `bullmq-worker-${job.id}`;
  console.log(`[BullMQ Worker] Submitting prompt to ComfyUI /prompt...`);
  let queuePromptRes;
  try {
    queuePromptRes = await axios.post(`${cleanServerUrl}/prompt`, {
      prompt: workflowPrompt,
      client_id: clientId,
    });
  } catch (promptErr) {
    const errorDetails =
      promptErr.response?.data?.error?.message ||
      JSON.stringify(promptErr.response?.data?.node_errors || promptErr.response?.data || promptErr.message);
    console.error(`[BullMQ Worker ❌ ComfyUI /prompt rejected]:`, errorDetails);
    throw new Error(`ComfyUI rejected prompt: ${errorDetails}`);
  }

  const promptId = queuePromptRes.data?.prompt_id;
  if (!promptId) {
    throw new Error("Failed to receive prompt_id from ComfyUI API");
  }
  console.log(`[BullMQ Worker] Queued Prompt ID in ComfyUI: ${promptId}`);

  await job.updateProgress({ percent: 55, step: "ComfyUI Diffusion", gpu: gpuLabel, serverUrl: cleanServerUrl });

  // 5. Fast adaptive polling for completion (800ms)
  console.log(`[BullMQ Worker] Awaiting generation completion from ComfyUI...`);
  let outputImageInfo = null;
  const pollStart = Date.now();
  const MAX_POLL_TIME = 360000; // 6 minutes max (allows Mac MPS and large batches)

  while (Date.now() - pollStart < MAX_POLL_TIME) {
    await new Promise((r) => setTimeout(r, 800));
    try {
      const histRes = await axios.get(`${cleanServerUrl}/history/${promptId}`, { timeout: 10000 });
      const histData = histRes.data?.[promptId];

      if (histData) {
        if (histData.status?.status_str === "error") {
          throw new Error(`ComfyUI Execution Error: ${JSON.stringify(histData.status?.messages || "Failed")}`);
        }

        const outputs = histData.outputs || {};
        const imageList =
          outputs["94"]?.images ||
          Object.values(outputs).find((nodeOut) => nodeOut?.images?.length)?.images;

        if (imageList && imageList.length > 0) {
          outputImageInfo = imageList[0];
          break;
        }
      }
    } catch (pollErr) {
      if (pollErr.message.includes("ComfyUI Execution Error")) throw pollErr;
    }
  }

  if (!outputImageInfo) {
    await axios.post(`${cleanServerUrl}/interrupt`).catch(() => {});
    throw new Error(`ComfyUI generation timed out after ${MAX_POLL_TIME / 1000}s for prompt ${promptId}`);
  }

  await job.updateProgress({ percent: 80, step: "Downloading Render", gpu: gpuLabel, serverUrl: cleanServerUrl });

  // 6. Download rendered output image
  const comfyViewUrl = `${cleanServerUrl}/view?filename=${encodeURIComponent(
    outputImageInfo.filename
  )}&subfolder=${encodeURIComponent(outputImageInfo.subfolder || "")}&type=${encodeURIComponent(
    outputImageInfo.type || "output"
  )}`;

  console.log(`[BullMQ Worker] Downloading output image from ComfyUI: ${outputImageInfo.filename}`);
  const renderedBuffer = await fetchImageBuffer(comfyViewUrl);

  await job.updateProgress({ percent: 85, step: "Optimizing & S3", gpu: gpuLabel, serverUrl: cleanServerUrl });

  // 7 & 8. Parallelized S3 Master Upload + Fast AVIF Compression & Upload
  const hash = crypto.randomBytes(4).toString("hex");
  const processedKey = `processed/comfy-${Date.now()}-${hash}.png`;
  const optimisedKey = `optimised/comfy-${Date.now()}-${hash}.avif`;

  console.log(`[BullMQ Worker ⚡] Processing S3 Master PNG and AVIF at ${targetWidth}x${targetHeight}...`);
  const [masterUploadRes, avifUploadRes] = await Promise.all([
    uploadBufferToS3(renderedBuffer, processedKey, "image/png"),
    (async () => {
      try {
        const avifBuffer = await sharp(renderedBuffer)
          .resize(targetWidth, targetHeight, { fit: "cover", position: "center" })
          .avif({ quality: 83, effort: 2, chromaSubsampling: "4:4:4" })
          .toBuffer();
        return await uploadBufferToS3(avifBuffer, optimisedKey, "image/avif");
      } catch (optErr) {
        console.warn(`[BullMQ Worker ⚠️] AVIF optimization warning:`, optErr.message);
        return null;
      }
    })(),
  ]);

  const processedUrl = masterUploadRes.url;
  const optimisedUrl = avifUploadRes?.url || processedUrl;
  const isOptimized = !!avifUploadRes?.url;

  console.log(`[BullMQ Worker] ✓ Master Image uploaded: ${processedUrl}`);
  if (isOptimized) {
    console.log(`[BullMQ Worker] ✓ AVIF (${targetWidth}x${targetHeight}) uploaded: ${optimisedUrl}`);
  }

  await job.updateProgress({ percent: 92, step: "Saving Database", gpu: gpuLabel, serverUrl: cleanServerUrl });

  // 9. Create/Update Image Document in MongoDB
  const newImage = await ImageModel.create({
    title: dishName.trim(),
    description: data.description || promptText,
    tags: Array.isArray(data.tags) ? data.tags : [],
    cuisine: (data.cuisine || data.category || "").trim(),
    image_url: processedUrl,
    optimised_image_url: optimisedUrl,
    is_optimized: isOptimized,
    approved: false,
    premium: false,
    category: (data.category || "Main Course").trim(),
    sub_category: (data.sub_category || data.subcategory || "").trim(),
    food_type: (data.food_type || data.dietaryType || "Veg").trim(),
    productId: data.productId || data._id || null,
    downloads: 0,
    latest: false,
  });

  console.log(`[BullMQ Worker] ✓ Created MongoDB Image record: ${newImage._id}`);

  // 10. Update linked Product if productId provided
  if (data.productId || data._id) {
    const prodId = data.productId || data._id;
    try {
      await ProductModel.updateOne(
        { _id: prodId },
        {
          $set: {
            processed: true,
            process_status: "completed",
            ai_image_url: optimisedUrl || processedUrl,
            last_job_id: String(job.id),
          },
        }
      );
      console.log(`[BullMQ Worker] ✓ Updated Product ${prodId} with processed: true, process_status: completed`);
    } catch (prodErr) {
      console.warn(`[BullMQ Worker Product update warning]:`, prodErr.message);
    }
  }

  await job.updateProgress({ percent: 100, step: "Completed", gpu: gpuLabel, serverUrl: cleanServerUrl });

  const durationSec = Math.round((Date.now() - pollStart) / 1000);
  console.log(`[BullMQ Worker 🎉] Job #${job.id} COMPLETED successfully in ${durationSec}s!`);

  return {
    success: true,
    dishName,
    imageUrl: processedUrl,
    optimisedUrl,
    imageId: newImage._id.toString(),
    productId: data.productId || null,
    durationSec,
    width: targetWidth,
    height: targetHeight,
    gpu: gpuLabel,
    serverUrl: cleanServerUrl,
  };
}

async function startWorker() {
  console.log("=========================================================");
  console.log("  🍽️  Foodsnap BullMQ Background Image Generation Worker  ");
  console.log(`  Queue: ${QUEUE_NAME}`);
  console.log(`  Target Server: ${COMFYUI_SERVER_URL}`);
  console.log(`  Destination: S3 processed/ & optimised/`);
  console.log("=========================================================\n");

  await connectDb();
  console.log("✅ Connected to MongoDB");

  const worker = new Worker(QUEUE_NAME, processJob, {
    connection: redisConnection,
    concurrency: 1, // Sequential GPU processing
    lockDuration: 300000, // 5 min lock
  });

  worker.on("ready", () => {
    console.log("⚡ BullMQ Worker is READY and listening for jobs in queue...\n");
  });

  worker.on("completed", (job, result) => {
    console.log(`✅ [Job Completed] #${job.id} (${result.dishName}) -> ${result.optimisedUrl}`);
  });

  worker.on("failed", async (job, err) => {
    console.error(`❌ [Job Failed] #${job?.id}:`, err.message);
    const prodId = job?.data?.productId || job?.data?._id;
    if (prodId) {
      await ProductModel.updateOne(
        { _id: prodId },
        { $set: { process_status: "failed", failed_reason: err.message, last_job_id: String(job?.id) } }
      ).catch(() => {});
    }
  });

  worker.on("error", (err) => {
    console.error(`[BullMQ Worker Error]:`, err.message);
  });

  const gracefulShutdown = async (signal) => {
    console.log(`\n[BullMQ Worker] Received ${signal}. Shutting down gracefully...`);
    await worker.close();
    await redisConnection.quit();
    await mongoose.disconnect();
    console.log("[BullMQ Worker] Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

startWorker().catch((err) => {
  console.error("Worker fatal initialization error:", err);
  process.exit(1);
});
