import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Product from "@/models/Product";
import {
  getQueueStats,
  getJobsByStatus,
  addGenerationJob,
  addBulkGenerationJobs,
} from "@/lib/queue/bullmq";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);

    const start = (page - 1) * limit;
    const end = start + limit - 1;

    const [stats, jobsResult] = await Promise.all([
      getQueueStats(),
      getJobsByStatus(status, start, end),
    ]);

    const totalCount = jobsResult.totalCount || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    return NextResponse.json({
      success: true,
      stats,
      jobs: jobsResult.jobs || [],
      totalCount,
      totalPages,
      page,
      limit,
    });
  } catch (error) {
    console.error("Failed to get jobs/stats from BullMQ:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch queue data" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { items, item, config, options } = body;

    await dbConnect();

    if (Array.isArray(items) && items.length > 0) {
      const addedJobs = await addBulkGenerationJobs(items, config);

      const productIds = items.map((it) => it.productId || it._id).filter(Boolean);
      if (productIds.length > 0) {
        await Product.updateMany(
          { _id: { $in: productIds } },
          { $set: { process_status: "queued" } }
        ).catch(() => {});
      }

      return NextResponse.json({
        success: true,
        count: addedJobs.length,
        jobIds: addedJobs.map((j) => j.id),
        message: `Successfully queued ${addedJobs.length} dishes for background AI processing!`,
      });
    }

    if (item || body.name || body.title) {
      const jobData = item || body;
      const job = await addGenerationJob(
        {
          ...jobData,
          config: { ...(config || {}), ...(jobData.config || {}) },
        },
        options
      );

      const prodId = jobData.productId || jobData._id;
      if (prodId) {
        await Product.updateOne(
          { _id: prodId },
          { $set: { process_status: "queued", last_job_id: job.id } }
        ).catch(() => {});
      }

      return NextResponse.json({
        success: true,
        jobId: job.id,
        message: `Successfully queued "${jobData.name || jobData.title}" for background AI processing!`,
      });
    }

    return NextResponse.json(
      { error: "No items or item provided in request body" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to add job(s) to BullMQ:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to enqueue jobs" },
      { status: 500 }
    );
  }
}
