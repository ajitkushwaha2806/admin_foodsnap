import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Product from "@/models/Product";
import {
  cleanQueue,
  pauseQueue,
  resumeQueue,
  emptyQueue,
  retryAllFailedJobs,
  resetStalledJobs,
  addBulkGenerationJobs,
  deleteJobs,
  deleteDuplicateWaitingJobs,
} from "@/lib/queue/bullmq";

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, limit = 100, jobIds = [] } = body;

    switch (action) {
      case "delete_selected":
        if (!Array.isArray(jobIds) || jobIds.length === 0) {
          return NextResponse.json(
            { error: "No job IDs provided to delete" },
            { status: 400 }
          );
        }

        const deleteRes = await deleteJobs(jobIds);

        // Delete from MongoDB Product collection as well
        if (deleteRes.productIds && deleteRes.productIds.length > 0) {
          try {
            await dbConnect();
            await Product.deleteMany({ _id: { $in: deleteRes.productIds } });
          } catch (dbErr) {
            console.warn("[Bulk Delete DB Warning]: Failed to delete products:", dbErr?.message);
          }
        }

        return NextResponse.json({
          success: true,
          count: deleteRes.count,
          message: `Successfully deleted ${deleteRes.count} queued jobs and database dishes!`,
        });

      case "delete_duplicates":
        const duplicateRes = await deleteDuplicateWaitingJobs();

        // Delete duplicate products from MongoDB
        if (duplicateRes.productIds && duplicateRes.productIds.length > 0) {
          try {
            await dbConnect();
            await Product.deleteMany({ _id: { $in: duplicateRes.productIds } });
          } catch (dbErr) {
            console.warn("[Purge Duplicates DB Warning]: Failed to delete duplicate products:", dbErr?.message);
          }
        }

        return NextResponse.json({
          success: true,
          count: duplicateRes.count,
          message: duplicateRes.count > 0
            ? `Purged ${duplicateRes.count} duplicate waiting jobs and dishes!`
            : "No duplicate waiting jobs found!",
        });

      case "requeue_unprocessed":
        await dbConnect();
        const findLimit = limit === 0 || limit > 20000 ? 20000 : limit;
        const unprocessed = await Product.find({
          processed: { $ne: true },
          image_url: { $exists: true, $ne: "" },
        })
          .limit(findLimit)
          .lean();

        if (unprocessed.length === 0) {
          return NextResponse.json({
            success: true,
            count: 0,
            message: "No unprocessed dishes found. All dishes are already processed!",
          });
        }

        const itemsToQueue = unprocessed.map((p) => ({
          productId: p._id.toString(),
          name: p.name,
          title: p.name,
          description: p.description,
          category: p.category,
          sub_category: p.sub_category,
          dietaryType: p.dietaryType,
          food_type: p.dietaryType,
          image_url: p.image_url,
          originalUrl: p.image_url,
        }));

        // Chunk in batches of 500 to avoid large Redis payload spikes
        const CHUNK_SIZE = 500;
        let totalAdded = 0;
        for (let i = 0; i < itemsToQueue.length; i += CHUNK_SIZE) {
          const chunk = itemsToQueue.slice(i, i + CHUNK_SIZE);
          const addedJobs = await addBulkGenerationJobs(chunk);
          totalAdded += addedJobs.length;
        }

        await Product.updateMany(
          { _id: { $in: unprocessed.map((p) => p._id) } },
          { $set: { process_status: "queued" } }
        );

        return NextResponse.json({
          success: true,
          count: totalAdded,
          message: `Queued ${totalAdded} unprocessed dishes for background AI generation!`,
        });

      case "clean_completed":
        await cleanQueue("completed", 0);
        return NextResponse.json({ success: true, message: "Cleared all completed jobs" });

      case "clean_failed":
        await cleanQueue("failed", 0);
        return NextResponse.json({ success: true, message: "Cleared all failed jobs" });

      case "retry_all_failed":
        const retryRes = await retryAllFailedJobs();
        return NextResponse.json({
          success: true,
          message: `Re-queued ${retryRes.count} failed jobs!`,
        });

      case "reset_stalled":
        const resetRes = await resetStalledJobs();
        return NextResponse.json({
          success: true,
          message: `Reset ${resetRes.count} stalled jobs!`,
        });

      case "pause":
        await pauseQueue();
        return NextResponse.json({ success: true, message: "Queue paused" });

      case "resume":
        await resumeQueue();
        return NextResponse.json({ success: true, message: "Queue resumed" });

      case "empty_waiting":
        const emptyRes = await emptyQueue();
        if (body.deleteFromDb && emptyRes.productIds && emptyRes.productIds.length > 0) {
          try {
            await dbConnect();
            await Product.deleteMany({ _id: { $in: emptyRes.productIds } });
          } catch (dbErr) {
            console.warn("[Empty Waiting DB Warning]: Failed to delete products:", dbErr?.message);
          }
        }
        return NextResponse.json({ success: true, message: "Emptied all waiting jobs" });

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error("Failed to perform queue action:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to execute queue action" },
      { status: 500 }
    );
  }
}
