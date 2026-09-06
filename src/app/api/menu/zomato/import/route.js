import axios from "axios";
import dbConnect from "@/lib/dbConnect";
import Product from "@/models/Product";
import { NextResponse } from "next/server";

const getNormalisedUrl = (rawUrl) => {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  const parsed = new URL(url);
  const domain = `${parsed.protocol}//${parsed.host}`;
  const parts = parsed.pathname.split("/").filter(Boolean);

  if (parts.length < 2) {
    throw new Error("Invalid Zomato URL: city and restaurant outlet name are required");
  }

  const city = parts[0];
  const outletName = parts[1];
  return {
    pageUrl: `${domain}/${city}/${outletName}/order`,
    restaurantSlug: outletName,
  };
};

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "Zomato restaurant URL is required" }, { status: 400 });
    }

    const { pageUrl, restaurantSlug } = getNormalisedUrl(url);

    const response = await axios.get("https://www.zomato.com/webroutes/getPage", {
      params: {
        page_url: pageUrl,
        location: "",
        isMobile: 0,
      },
      headers: {
        accept: "*/*",
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        cookie: process.env.ZOMATO_COOKIES || "",
      },
      timeout: 15000,
    });

    const pageData = response?.data?.page_data || {};
    const restaurantName =
      pageData?.sections?.SECTION_BASIC_INFO?.name ||
      restaurantSlug.replace(/-/g, " ").toUpperCase();
    const menus = pageData?.order?.menuList?.menus || [];

    const extractedProducts = [];
    const seenKeys = new Set();

    for (const menuWrapper of menus) {
      const menu = menuWrapper?.menu || {};
      const menuCategoryName = menu.name || "";
      const categories = menu.categories || [];

      for (const subWrapper of categories) {
        const subCategoryData = subWrapper?.category || {};
        const rawSubCategoryName = subCategoryData.name?.trim() || "";
        const rawCategoryName = menuCategoryName?.trim() || "";

        const finalCategory = rawCategoryName || rawSubCategoryName || "General";
        const finalSubCategory = rawSubCategoryName || finalCategory;
        const items = subCategoryData.items || [];

        for (const itemWrapper of items) {
          const itemData = itemWrapper?.item || {};
          if (!itemData.name) continue;

          let zomatoImageUrl = itemData.item_image_url || itemData.media?.url || itemData.thumb || null;

          // Only import if image is present
          if (!zomatoImageUrl || typeof zomatoImageUrl !== "string" || !zomatoImageUrl.startsWith("http")) {
            continue;
          }

          const name = itemData.name.trim();
          const dedupeKey = `${name}___${finalCategory}___${finalSubCategory}`.toLowerCase();
          if (seenKeys.has(dedupeKey)) continue;
          seenKeys.add(dedupeKey);

          let dietaryType = "unknown";
          if (itemData.dietary_slugs?.includes("veg") || itemData.dietary_slugs?.includes("vegan")) {
            dietaryType = "veg";
          } else if (itemData.dietary_slugs?.includes("non-veg")) {
            dietaryType = "non-veg";
          }

          extractedProducts.push({
            name,
            description: itemData.desc?.trim() || "",
            image_url: zomatoImageUrl,
            category: finalCategory,
            sub_category: finalSubCategory,
            dietaryType,
          });
        }
      }
    }

    if (extractedProducts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No menu items found for this restaurant.",
        count: 0,
        products: [],
      });
    }
    
    let importedCount = 0;
    const savedDocs = [];

    for (const prodData of extractedProducts) {
      const existing = await Product.findOne({
        name: prodData.name,
        category: prodData.category,
        sub_category: prodData.sub_category,
      });

      if (existing) {
        savedDocs.push(existing);
      } else {
        const created = await Product.create(prodData);
        savedDocs.push(created);
        importedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully imported ${importedCount} new products (${savedDocs.length} total available).`,
      count: savedDocs.length,
      importedCount,
      restaurantName,
      products: savedDocs,
    });
  } catch (error) {
    console.error("Zomato Product Import Error:", error?.response?.data || error.message);
    return NextResponse.json(
      {
        error: error?.response?.data?.message || error?.message || "Failed to import products from Zomato",
      },
      { status: error?.response?.status || 500 }
    );
  }
}

export async function GET(request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const dietaryType = searchParams.get("dietaryType");
    const search = searchParams.get("search");

    const query = {};
    if (category) {
      query.category = { $regex: category, $options: "i" };
    }
    if (dietaryType) {
      query.dietaryType = dietaryType;
    }
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const products = await Product.find(query).sort({ createdAt: -1 }).limit(100);
    return NextResponse.json({ success: true, count: products.length, products });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}