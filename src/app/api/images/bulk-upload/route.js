import crypto from "crypto";
import dbConnect from "@/lib/dbConnect";
import ImageModel from "@/models/Image";
import { NextResponse } from "next/server";
import { uploadToS3 } from "@/lib/aws/uploadToS3";
import { invalidateSearchCache } from "@/lib/redis";
import { analyzeFoodImageWithNova } from "@/lib/bedrock/image-analyzer";

export const maxDuration = 60;
export async function POST(request) {
  try {
    await dbConnect();

    const formData = await request.formData();
    const file = formData.get("file") || formData.get("image");

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No image file provided in request" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = file.type || "image/png";

    let aiMetadata;
    try {
      aiMetadata = await analyzeFoodImageWithNova(buffer, contentType);
    } catch (aiErr) {
      console.warn("Bedrock Nova analysis failed, using fallback parsing:", aiErr.message);
      const rawName = (file.name || "AI Food Dish").replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      aiMetadata = {
        title: rawName,
        description: `Delicious ${rawName} prepared with premium ingredients.`,
        category: "Main Course",
        sub_category: "Main Course",
        cuisine: "Continental",
        food_type: "veg",
        tags: rawName.toLowerCase().split(/\s+/).filter((t) => t.length > 1),
      };
    }

    const fileExt = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png";
    const processedS3Key = `processed/upload-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${fileExt}`;
    const s3Result = await uploadToS3(buffer, processedS3Key, contentType);

    // Convert to AVIF and save to optimised/
    let optimisedUrl = null;
    let isOptimized = false;
    try {
      const { optimizeBufferToAvif } = await import("@/lib/image-optimizer/optimizer");
      const { buffer: avifBuffer } = await optimizeBufferToAvif(buffer);
      const optS3Key = `optimised/upload-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.avif`;
      const optResult = await uploadToS3(avifBuffer, optS3Key, "image/avif");
      optimisedUrl = optResult.url;
      isOptimized = true;
    } catch (optErr) {
      console.warn("AVIF conversion warning in bulk upload:", optErr.message);
    }

    const newImage = await ImageModel.create({
      title: aiMetadata.title,
      description: aiMetadata.description,
      tags: aiMetadata.tags,
      cuisine: aiMetadata.cuisine,
      image_url: s3Result.url, 
      optimised_image_url: optimisedUrl || s3Result.url,
      is_optimized: isOptimized,
      approved: false,
      premium: false,
      category: aiMetadata.category,
      sub_category: aiMetadata.sub_category,
      food_type: aiMetadata.food_type,
      downloads: 0,
      latest: false,
    });

    await invalidateSearchCache();
    return NextResponse.json({
      success: true,
      data: newImage,
      analysis: aiMetadata,
      imageUrl: s3Result.url,
    });
  } catch (error) {
    console.error("Bulk image upload & Bedrock analysis error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to process image upload" },
      { status: 500 }
    );
  }
}
