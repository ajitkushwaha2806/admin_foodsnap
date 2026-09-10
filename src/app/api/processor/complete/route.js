import axios from "axios";
import crypto from "crypto";
import dbConnect from "@/lib/dbConnect";
import ImageModel from "@/models/Image";
import { NextResponse } from "next/server";
import { uploadToS3 } from "@/lib/aws/uploadToS3";
import { invalidateSearchCache } from "@/lib/redis";
import { optimizeBufferToAvif } from "@/lib/image-optimizer/optimizer";

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    const {
      dishData = {},
      outputFilename,
      serverUrl = process.env.COMFYUI_SERVER_URL ||
        process.env.NEXT_PUBLIC_COMFYUI_SERVER_URL ||
        "http://13.55.57.70:8188",
      subfolder = "",
      type = "output",
      executionTimeSec = 0,
      customPrompt = "",
    } = body;

    if (!outputFilename) {
      return NextResponse.json(
        { error: "outputFilename is required" },
        { status: 400 }
      );
    }

    const cleanBase = serverUrl.replace(/\/$/, "");
    const comfyViewUrl = `${cleanBase}/view?filename=${encodeURIComponent(
      outputFilename
    )}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(type)}`;

    const imgResponse = await axios.get(comfyViewUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
    });
    const buffer = Buffer.from(imgResponse.data);

    const title = dishData.title || dishData.name || outputFilename.replace(/\.[^/.]+$/, "");
    const tags = Array.isArray(dishData.tags) ? dishData.tags : [];
    const cuisine = dishData.cuisine || "";
    const category = dishData.category || "";
    const sub_category = dishData.sub_category || dishData.subcategory || "";
    const food_type = dishData.food_type || dishData.foodType || "Veg";

    const originalContentType = imgResponse.headers["content-type"] || "image/png";
    const originalExt = originalContentType.includes("jpeg") || originalContentType.includes("jpg") ? "jpg" : "png";

    // 1. Upload AI-processed master image directly to processed/ (no raw/ folder)
    const processedS3Key = `processed/comfy-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${originalExt}`;
    const processedResult = await uploadToS3(buffer, processedS3Key, originalContentType);

    // 2. Convert to AVIF and store in optimised/
    let optimisedUrl = null;
    let isOptimized = false;

    try {
      const { buffer: avifBuffer } = await optimizeBufferToAvif(buffer);
      const optimisedS3Key = `optimised/comfy-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.avif`;
      const optResult = await uploadToS3(avifBuffer, optimisedS3Key, "image/avif");
      optimisedUrl = optResult.url;
      isOptimized = true;
    } catch (optErr) {
      console.warn("AVIF conversion warning in processor complete:", optErr.message);
    }

    const newImage = await ImageModel.create({
      title: title.trim(),
      description: dishData.description || customPrompt || `AI generated food photography for ${title}`,
      tags,
      cuisine: cuisine.trim(),
      image_url: processedResult.url,
      optimised_image_url: optimisedUrl || processedResult.url,
      is_optimized: isOptimized,
      approved: false,
      premium: false,
      category: category.trim(),
      sub_category: sub_category.trim(),
      food_type: food_type.trim(),
      downloads: 0,
      latest: false,
    });

    await invalidateSearchCache();
    return NextResponse.json({
      success: true,
      image: newImage,
      imageUrl: s3Result.url,
      executionTimeSec,
    });
  } catch (error) {
    console.error("Failed to process and save AI image to MongoDB & S3:", error?.message);
    return NextResponse.json(
      { error: error?.message || "Failed to process and upload image" },
      { status: 500 }
    );
  }
}
