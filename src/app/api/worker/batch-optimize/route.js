import dbConnect from "@/lib/dbConnect";
import ImageModel from "@/models/Image";
import { NextResponse } from "next/server";
import { sendOptimizationJob } from "@/lib/aws/sqs";
import { processAndStoreOptimizedImage } from "@/lib/image-optimizer/optimizer";

export const maxDuration = 300;

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);
    const useQueue = !!body.useQueue;
    const forceAll = !!body.forceAll;

    const query = forceAll
      ? {}
      : {
        $or: [
          { is_optimized: { $ne: true } },
          { image_url: { $not: /\.avif(\?.*)?$/i } },
          { image_url: { $not: /\/optimised\//i } },
        ],
      };

    const imagesToProcess = await ImageModel.find(query).limit(limit).lean();

    if (imagesToProcess.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No un-optimized images found matching criteria.",
        processedCount: 0,
      });
    }

    if (useQueue) {
      const queueResults = await Promise.all(
        imagesToProcess.map((img) =>
          sendOptimizationJob({
            imageId: img._id.toString(),
            imageUrl: img.image_url,
            fileName: img.title || "food-dish",
          })
        )
      );

      return NextResponse.json({
        success: true,
        message: `Queued ${imagesToProcess.length} images to SQS queue`,
        queuedCount: imagesToProcess.length,
        results: queueResults,
      });
    }

    const results = [];
    const errors = [];

    for (const img of imagesToProcess) {
      try {
        const sourceUrl = img.image_url;
        const res = await processAndStoreOptimizedImage({
          source: sourceUrl,
          imageId: img._id.toString(),
          fileName: img.title || "food-dish",
        });

        results.push({
          imageId: img._id,
          title: img.title,
          oldUrl: sourceUrl,
          newUrl: res.optimizedUrl,
          saved: res.savedPercentage,
        });
      } catch (err) {
        console.error(`[Batch Error on ${img._id}]:`, err.message);
        errors.push({
          imageId: img._id,
          title: img.title,
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Batch optimization finished. Succeeded: ${results.length}, Failed: ${errors.length}`,
      totalProcessed: imagesToProcess.length,
      successCount: results.length,
      failedCount: errors.length,
      results,
      errors,
    });
  } catch (error) {
    console.error("[Batch Optimize Route Error]:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Batch optimization failed" },
      { status: 500 }
    );
  }
}
