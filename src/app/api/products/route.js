import dbConnect from "@/lib/dbConnect";
import Product from "@/models/Product";
import { NextResponse } from "next/server";

export async function GET(request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const dietaryType = searchParams.get("dietaryType") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const skip = (page - 1) * limit;

    const query = {};

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }
    if (category && category !== "all") {
      query.category = category;
    }
    if (dietaryType && dietaryType !== "all") {
      query.dietaryType = dietaryType;
    }

    const [products, totalCount, categories] = await Promise.all([
      Product.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Product.countDocuments(query),
      Product.distinct("category"),
    ]);

    return NextResponse.json({
      success: true,
      data: products,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
      categories: categories.filter(Boolean),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Product ID is required" },
        { status: 400 }
      );
    }

    await Product.findByIdAndDelete(id);

    return NextResponse.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
