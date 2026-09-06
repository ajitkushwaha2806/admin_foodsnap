import dbConnect from "@/lib/dbConnect";
import ImageModel from "@/models/Image";
import Product from "@/models/Product";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await dbConnect();

    const [totalImages, approvedImages, pendingImages, totalProducts, recentImages, recentProducts] = await Promise.all([
      ImageModel.countDocuments(),
      ImageModel.countDocuments({ approved: true }),
      ImageModel.countDocuments({ approved: false }),
      Product.countDocuments(),
      ImageModel.find().sort({ createdAt: -1 }).limit(6).lean(),
      Product.find().sort({ createdAt: -1 }).limit(6).lean(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        totalImages,
        approvedImages,
        pendingImages,
        totalProducts,
        recentImages,
        recentProducts,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
