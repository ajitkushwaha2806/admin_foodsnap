import { NextResponse } from "next/server";
import { retryJob } from "@/lib/queue/bullmq";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    await retryJob(id);

    return NextResponse.json({
      success: true,
      message: `Job #${id} successfully re-queued for processing!`,
    });
  } catch (error) {
    console.error("Failed to retry job:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to retry job" },
      { status: 500 }
    );
  }
}
