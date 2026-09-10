import { NextResponse } from "next/server";
import { sendOptimizationJob } from "@/lib/aws/sqs";
import { processAndStoreOptimizedImage } from "@/lib/image-optimizer/optimizer";

export const maxDuration = 60;
export async function POST(request) {
  try {
    const body = await request.json();
    const { imageId, s3Key, imageUrl, fileName, asyncMode = false } = body;

    if (!imageId && !s3Key && !imageUrl) {
      return NextResponse.json(
        { success: false, error: "Must provide at least one of: imageId, s3Key, imageUrl" },
        { status: 400 }
      );
    }

    if (asyncMode) {
      const sqsResult = await sendOptimizationJob({
        imageId,
        s3Key,
        imageUrl,
        fileName,
      });

      return NextResponse.json({
        success: true,
        queued: true,
        message: "Image optimization job queued to SQS",
        sqsResult,
      });
    }

    const result = await processAndStoreOptimizedImage({
      source: s3Key || imageUrl,
      imageId,
      s3Key,
      originalUrl: imageUrl,
      fileName,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: "Image successfully optimized to 4:3 AVIF format",
    });
  } catch (error) {
    console.error("[Optimize Image API Error]:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Optimization failed" },
      { status: 500 }
    );
  }
}
