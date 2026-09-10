import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Product from "@/models/Product";
import { getImageGenerationQueue, deleteJob } from "@/lib/queue/bullmq";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const queue = getImageGenerationQueue();
    const job = await queue.getJob(id);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const state = await job.getState();
    const logs = await queue.getJobLogs(id);

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        name: job.name,
        data: job.data,
        progress: job.progress,
        returnvalue: job.returnvalue,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        state,
        logs: logs.logs || [],
      },
    });
  } catch (error) {
    console.error("Failed to get job details:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch job" },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const result = await deleteJob(id);

    if (!result.success) {
      return NextResponse.json({ error: "Job not found or already removed" }, { status: 404 });
    }

    // Also delete product from MongoDB if productId is linked
    if (result.productId) {
      try {
        await dbConnect();
        await Product.deleteOne({ _id: result.productId });
      } catch (dbErr) {
        console.warn(`[Job Delete DB Warning]: Failed to delete product ${result.productId}:`, dbErr?.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Job #${id} and associated dish deleted successfully`,
    });
  } catch (error) {
    console.error("Failed to delete job:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to delete job" },
      { status: 500 }
    );
  }
}
