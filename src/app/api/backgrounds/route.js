import crypto from "crypto";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";
import Background from "@/models/Background";
import { uploadToS3 } from "@/lib/aws/uploadToS3";

export async function GET() {
  try {
    await dbConnect();
    const backgrounds = await Background.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: backgrounds });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch backgrounds" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("image");
      const customName = formData.get("name") || (file ? file.name.replace(/\.[^/.]+$/, "") : "Custom Background");

      if (!file) {
        return NextResponse.json({ error: "No image file provided" }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const ext = file.name.split(".").pop() || "jpg";
      const s3FileName = `foodsnap/backgrounds/bg-${Date.now()}-${crypto.randomBytes(3).toString("hex")}.${ext}`;

      const s3Result = await uploadToS3(buffer, s3FileName, file.type || "image/jpeg");

      const created = await Background.create({
        name: customName.trim(),
        image_url: s3Result.url,
        s3_key: s3Result.key,
        is_preset: false,
      });

      return NextResponse.json({ success: true, data: created });
    }

    const body = await request.json();
    const { name, image_url, is_preset } = body;

    if (!image_url) {
      return NextResponse.json({ error: "image_url is required" }, { status: 400 });
    }

    const created = await Background.create({
      name: name || "Background Surface",
      image_url,
      is_preset: Boolean(is_preset),
    });

    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    console.error("Failed to save background:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save background" },
      { status: 500 }
    );
  }
}