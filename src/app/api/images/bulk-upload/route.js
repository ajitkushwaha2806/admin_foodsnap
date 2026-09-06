import { NextResponse } from "next/server";
import crypto from "crypto";
import dbConnect from "@/lib/dbConnect";
import ImageModel from "@/models/Image";
import { uploadToS3 } from "@/lib/aws/uploadToS3";
import { analyzeFoodImageWithNova } from "@/lib/bedrock/image-analyzer";

export const maxDuration = 60; // Allow up to 60s for AI inference & S3 upload

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

    // Step 1: AI Vision analysis with Amazon Bedrock Nova
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

    // Step 2: Upload original image buffer to S3 (foodsnap-studio bucket)
    const fileExt = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png";
    const s3FileName = `foodsnap/processed/ai-processed-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${fileExt}`;
    const s3Result = await uploadToS3(buffer, s3FileName, contentType);

    // Step 3: Save to MongoDB Image model matching exact schema
    const newImage = await ImageModel.create({
      title: aiMetadata.title,
      description: aiMetadata.description,
      tags: aiMetadata.tags,
      cuisine: aiMetadata.cuisine,
      image_url: s3Result.url,
      approved: false,
      premium: false,
      category: aiMetadata.category,
      sub_category: aiMetadata.sub_category,
      food_type: aiMetadata.food_type,
      downloads: 0,
      latest: false,
    });

    return NextResponse.json({
      success: true,
      data: newImage,
      analysis: aiMetadata,
      s3Url: s3Result.url,
    });
  } catch (error) {
    console.error("Bulk image upload & Bedrock analysis error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to process image upload" },
      { status: 500 }
    );
  }
}
