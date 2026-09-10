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
    const ids = searchParams.get("ids") || "";
    const sortBy = searchParams.get("sortBy") || "name_asc";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const skip = (page - 1) * limit;

    const query = {};

    if (ids) {
      const idArray = ids.split(",").map((id) => id.trim()).filter(Boolean);
      if (idArray.length > 0) {
        query._id = { $in: idArray };
      }
    }
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }
    if (category && category !== "all") {
      query.category = category;
    }
    if (dietaryType && dietaryType !== "all") {
      query.$or = [{ dietaryType }, { food_type: dietaryType }];
    }

    let sortOptions = { name: 1 };
    let collation = { locale: "en", strength: 2 };

    if (sortBy === "name_desc") {
      sortOptions = { name: -1 };
    } else if (sortBy === "newest") {
      sortOptions = { createdAt: -1 };
      collation = null;
    } else if (sortBy === "oldest") {
      sortOptions = { createdAt: 1 };
      collation = null;
    }

    let productFindQuery = Product.find(query).sort(sortOptions);
    if (collation) {
      productFindQuery = productFindQuery.collation(collation);
    }

    const [products, totalCount, categories] = await Promise.all([
      productFindQuery.skip(skip).limit(limit).lean(),
      Product.countDocuments(query),
      Product.distinct("category"),
    ]);

    const formattedProducts = products.map((prod) => ({
      ...prod,
      image_url: prod.image_url || prod.img,
      dietaryType: prod.dietaryType || prod.food_type,
      food_type: prod.food_type || prod.dietaryType,
    }));

    return NextResponse.json({
      success: true,
      data: formattedProducts,
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
    const idsParam = searchParams.get("ids");

    let ids = [];
    if (idsParam) {
      ids = idsParam.split(",").map((i) => i.trim()).filter(Boolean);
    } else if (id) {
      ids = [id.trim()];
    } else {
      // Check request body
      try {
        const body = await request.json();
        if (Array.isArray(body?.ids)) {
          ids = body.ids;
        } else if (body?.id) {
          ids = [body.id];
        }
      } catch (e) {
        // Body might be empty
      }
    }

    if (ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "Product ID or IDs are required" },
        { status: 400 }
      );
    }

    const result = await Product.deleteMany({ _id: { $in: ids } });

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount || ids.length} product(s)`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
