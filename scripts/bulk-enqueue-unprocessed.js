import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { addBulkGenerationJobs, getImageGenerationQueue } from "../src/lib/queue/bullmq.js";

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

const MONGODB_URI = process.env.MONGODB_URI;

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    image_url: { type: String },
    category: { type: String },
    sub_category: { type: String },
    dietaryType: { type: String },
    processed: { type: Boolean, default: false },
    process_status: { type: String, default: "idle" },
    ai_image_url: { type: String },
    last_job_id: { type: String },
  },
  { timestamps: true }
);

const Product = mongoose.models.Product || mongoose.model("Product", ProductSchema);

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const categoryArg = args.find((a) => a.startsWith("--category="));
const batchSizeArg = args.find((a) => a.startsWith("--batch="));

const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : 0; // 0 = unlimited / all
const BATCH_SIZE = batchSizeArg ? parseInt(batchSizeArg.split("=")[1], 10) : 500;
const CATEGORY_FILTER = categoryArg ? categoryArg.split("=")[1] : null;

async function run() {
  console.log("=========================================================");
  console.log("🚀 FoodSnap Bulk Ingestion Pipeline -> BullMQ Queue");
  console.log("=========================================================");
  console.log(`Mode: ${isDryRun ? "🔍 DRY RUN (Preview only)" : "⚡ LIVE QUEUEING"}`);
  console.log(`Batch Size: ${BATCH_SIZE} items per chunk`);
  if (LIMIT) console.log(`Limit: Up to ${LIMIT} products`);
  if (CATEGORY_FILTER) console.log(`Category Filter: "${CATEGORY_FILTER}"`);

  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI not found in environment variables.");
    process.exit(1);
  }

  console.log("\nConnecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("✓ Connected to MongoDB.");

  // Build query: unprocessed or not completed, having a valid image_url
  const query = {
    $or: [{ processed: { $ne: true } }, { processed: { $exists: false } }],
    image_url: { $exists: true, $ne: "" },
  };

  if (CATEGORY_FILTER) {
    query.category = new RegExp(CATEGORY_FILTER, "i");
  }

  const totalUnprocessedCount = await Product.countDocuments(query);
  console.log(`\nFound ${totalUnprocessedCount} total unprocessed products in MongoDB.`);

  if (totalUnprocessedCount === 0) {
    console.log("✨ All products are already processed or no products matched the criteria!");
    await mongoose.disconnect();
    process.exit(0);
  }

  let findQuery = Product.find(query)
    .select("_id name description image_url category sub_category dietaryType process_status")
    .lean();

  if (LIMIT > 0) {
    findQuery = findQuery.limit(LIMIT);
  }

  const products = await findQuery.exec();
  console.log(`Selected ${products.length} products for queueing.\n`);

  // Category breakdown summary
  const categories = {};
  for (const p of products) {
    const cat = p.category || "Uncategorized";
    categories[cat] = (categories[cat] || 0) + 1;
  }

  console.log("📊 Breakdown by Category:");
  for (const [cat, count] of Object.entries(categories)) {
    console.log(`  - ${cat}: ${count} items`);
  }

  if (isDryRun) {
    console.log("\n[DRY RUN] No jobs were enqueued. Run without '--dry-run' to enqueue.");
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`\n⏳ Enqueueing ${products.length} products in chunks of ${BATCH_SIZE}...`);
  const queue = getImageGenerationQueue();
  let enqueuedCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const chunk = products.slice(i, i + BATCH_SIZE);

    const formattedItems = chunk.map((p) => ({
      productId: p._id.toString(),
      _id: p._id.toString(),
      name: p.name,
      title: p.name,
      description: p.description,
      image_url: p.image_url,
      originalUrl: p.image_url,
      category: p.category,
      sub_category: p.sub_category,
      dietaryType: p.dietaryType,
      food_type: p.dietaryType,
    }));

    const addedJobs = await addBulkGenerationJobs(formattedItems);
    const productIds = chunk.map((p) => p._id);

    await Product.updateMany(
      { _id: { $in: productIds } },
      { $set: { process_status: "queued" } }
    );

    enqueuedCount += addedJobs.length;
    const percent = Math.round((enqueuedCount / products.length) * 100);
    console.log(`✓ Enqueued batch ${Math.floor(i / BATCH_SIZE) + 1}: ${enqueuedCount} / ${products.length} (${percent}%)`);
  }

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=========================================================`);
  console.log(`🎉 SUCCESS: ${enqueuedCount} dishes successfully enqueued in ${elapsedSec}s!`);
  console.log(`Worker(s) will automatically process all queued dishes in the background.`);
  console.log(`Dashboard: http://localhost:3000/jobs`);
  console.log(`Bull Board: http://localhost:3001/admin/queues`);
  console.log(`=========================================================`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Bulk enqueue error:", err);
  process.exit(1);
});
