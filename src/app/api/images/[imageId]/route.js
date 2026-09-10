import mongoose from "mongoose";
import dbConnect from "@/lib/dbConnect";
import ImageModel from "@/models/Image";
import { NextResponse } from "next/server";
import { invalidateSearchCache } from "@/lib/redis";

export async function GET(request, { params }) {
  try {
    const { imageId } = await params;

    if (!imageId || !mongoose.Types.ObjectId.isValid(imageId)) {
      return NextResponse.json(
        { success: false, error: "Invalid Image ID format" },
        { status: 400 }
      );
    }

    await dbConnect();
    const image = await ImageModel.findById(imageId).lean();
    if (!image) {
      return NextResponse.json(
        { success: false, error: "Image not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: image });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    await dbConnect();
    const { imageId } = await params;
    const body = await request.json();

    const updated = await ImageModel.findByIdAndUpdate(imageId, body, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Image not found" },
        { status: 404 }
      );
    }

    // Invalidate Redis search cache so searches reflect changes immediately
    await invalidateSearchCache();

    return NextResponse.json({
      success: true,
      message: "Image updated successfully",
      data: updated,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    await dbConnect();
    const { imageId } = await params;

    const deleted = await ImageModel.findByIdAndDelete(imageId);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Image not found" },
        { status: 404 }
      );
    }

    // Invalidate Redis search cache so deleted images don't appear in search
    await invalidateSearchCache();

    return NextResponse.json({
      success: true,
      message: "Image deleted successfully",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}