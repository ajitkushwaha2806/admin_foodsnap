import dbConnect from "@/lib/dbConnect";
import ImageModel from "@/models/Image";
import { NextResponse } from "next/server";

export async function GET(request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") || "";
    const approved = searchParams.get("approved");
    const foodType = searchParams.get("foodType");
    const category = searchParams.get("category");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "60", 10);
    const skip = (page - 1) * limit;

    const query = {};

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search, "i")] } },
      ];
    }

    if (approved !== null && approved !== undefined && approved !== "" && approved !== "all") {
      query.approved = approved === "true";
    }

    if (foodType && foodType !== "all") {
      query.food_type = foodType;
    }

    if (category && category !== "all") {
      query.category = category;
    }

    const [images, totalCount, categories] = await Promise.all([
      ImageModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ImageModel.countDocuments(query),
      ImageModel.distinct("category"),
    ]);

    return NextResponse.json({
      success: true,
      data: images,
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

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();

    if (!body.title || !body.image_url) {
      return NextResponse.json(
        { success: false, error: "Title and image_url are required" },
        { status: 400 }
      );
    }

    const newImage = await ImageModel.create(body);

    return NextResponse.json({
      success: true,
      message: "Image created successfully",
      data: newImage,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
