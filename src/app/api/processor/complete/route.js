import { NextResponse } from "next/server";
import axios from "axios";
import crypto from "crypto";
import dbConnect from "@/lib/dbConnect";
import ImageModel from "@/models/Image";
import { uploadToS3 } from "@/lib/aws/uploadToS3";

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    const {
      dishData = {},
      outputFilename,
      serverUrl = "http://127.0.0.1:8188",
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

    // Step 1: Fetch generated output image buffer from ComfyUI
    const cleanBase = serverUrl.replace(/\/$/, "");
    const comfyViewUrl = `${cleanBase}/view?filename=${encodeURIComponent(
      outputFilename
    )}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(type)}`;

    const imgResponse = await axios.get(comfyViewUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
    });
    const buffer = Buffer.from(imgResponse.data);
    const contentType = imgResponse.headers["content-type"] || "image/png";

    // Step 2: Upload to AWS S3
    const s3FileName = `foodsnap/processed/ai-processed-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.png`;
    const s3Result = await uploadToS3(buffer, s3FileName, contentType);

    // Step 3: Prepare Tags and Categorization
    const title = dishData.title || dishData.name || "AI Processed Dish";
    const category = dishData.category || "Main Course";
    const sub_category = dishData.sub_category || category;
    const food_type = dishData.food_type || dishData.dietaryType || "unknown";
    const cuisine = dishData.cuisine || category;

    const rawTags = Array.isArray(dishData.tags) && dishData.tags.length > 0
      ? dishData.tags
      : [title, category, sub_category, food_type, cuisine]
          .filter(Boolean)
          .flatMap((t) => t.toLowerCase().split(/[\s,]+/));

    const tags = Array.from(new Set(rawTags.filter((t) => t.length > 1)));

    // Step 4: Save to MongoDB Image Model with approved: false, premium: false
    const newImage = await ImageModel.create({
      title: title.trim(),
      description: dishData.description || customPrompt || `AI generated food photography for ${title}`,
      tags,
      cuisine: cuisine.trim(),
      image_url: s3Result.url,
      approved: false,
      premium: false,
      category: category.trim(),
      sub_category: sub_category.trim(),
      food_type: food_type.trim(),
      downloads: 0,
      latest: false,
    });

    return NextResponse.json({
      success: true,
      image: newImage,
      s3Url: s3Result.url,
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
