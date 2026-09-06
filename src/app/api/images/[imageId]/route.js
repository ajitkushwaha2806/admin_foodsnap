import dbConnect from "@/lib/dbConnect";
import ImageModel from "@/models/Image";
import { NextResponse } from "next/server";

export async function GET(request, { params }) {
  try {
    await dbConnect();
    const { imageId } = await params;

    const image = await ImageModel.findById(imageId);
    if (!image) {
      return NextResponse.json(
        { success: false, error: "Image not found" },
        { status: 400 }
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