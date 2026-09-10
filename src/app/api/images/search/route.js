import dbConnect from "@/lib/dbConnect";
import ImageModel from "@/models/Image";
import { NextResponse } from "next/server";
import { getCache, setCache, generateSearchCacheKey, SEARCH_CACHE_TTL_SEC } from "@/lib/redis";

const getFilterValue = (searchParams, key, type = "string") => {
    const value = searchParams.get(key);
    if (value === null || value === "" || value === "all") {
        return undefined;
    }

    if (type === "boolean") {
        if (value === "true" || value === "1" || value === "yes" || value === true) return true;
        if (value === "false" || value === "0" || value === "no" || value === false) return false;
        return undefined;
    }

    if (type === "tags") {
        return value
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean);
    }

    if (type === "number") {
        const number = Number(value);
        return Number.isFinite(number) ? number : undefined;
    }

    return value.trim();
};

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search")?.trim() || "";
        const page = Math.max(
            parseInt(searchParams.get("page") || "1", 10),
            1
        );

        const limit = Math.min(
            Math.max(
                parseInt(searchParams.get("limit") || "60", 10),
                1
            ),
            100
        );

        const skip = (page - 1) * limit;
        const approved = getFilterValue(searchParams, "approved", "boolean");
        const category = getFilterValue(searchParams, "category", "string");
        const foodType = getFilterValue(searchParams, "food_type", "string") || getFilterValue(searchParams, "foodType", "string");
        const latest = getFilterValue(searchParams, "latest", "boolean");
        const premium = getFilterValue(searchParams, "premium", "boolean");
        const subCategory = getFilterValue(searchParams, "sub_category", "string");
        const cuisine = getFilterValue(searchParams, "cuisine", "string");
        const tags = getFilterValue(searchParams, "tags", "tags");

        const cacheKey = generateSearchCacheKey({
            search,
            page,
            limit,
            approved,
            category,
            food_type: foodType,
            latest,
            premium,
            sub_category: subCategory,
            cuisine,
            tags: tags ? tags.join(",") : undefined,
        });

        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return NextResponse.json(
                {
                    ...cachedData,
                    message: cachedData.message
                        ? `${cachedData.message} (cached)`
                        : "Images fetched successfully (cached)",
                },
                {
                    headers: {
                        "X-Cache": "HIT",
                    },
                }
            );
        }

        await dbConnect();

        const atlasFilters = [];
        if (approved !== undefined) {
            atlasFilters.push({
                equals: {
                    path: "approved",
                    value: approved,
                },
            });
        }

        if (category !== undefined) {
            atlasFilters.push({
                equals: {
                    path: "category",
                    value: category,
                },
            });
        }

        if (foodType !== undefined) {
            atlasFilters.push({
                equals: {
                    path: "food_type",
                    value: foodType,
                },
            });
        }

        const mongoFilter = {};
        const mongoFilterFields = {
            title: "string",
            description: "string",
            cuisine: "string",
            sub_category: "string",
            premium: "boolean",
            latest: "boolean",
            tags: "tags",
        };
        for (const [key, type] of Object.entries(mongoFilterFields)) {
            const value = getFilterValue(
                searchParams,
                key,
                type
            );

            if (value !== undefined) {
                mongoFilter[key] =
                    type === "tags"
                        ? { $in: value }
                        : value;
            }
        }

        const pipeline = [];
        if (search || atlasFilters.length > 0) {
            const compound = {};
            if (atlasFilters.length > 0) {
                compound.filter = atlasFilters;
            }

            if (search) {
                compound.should = [
                    {
                        text: {
                            query: search,
                            path: "title",
                            matchCriteria: "all",
                            score: {
                                boost: {
                                    value: 15,
                                },
                            },
                        },
                    },
                    {
                        text: {
                            query: search,
                            path: "title",
                            fuzzy: {
                                maxEdits: 2,
                                prefixLength: 1,
                                maxExpansions: 100,
                            },
                            score: {
                                boost: {
                                    value: 10,
                                },
                            },
                        },
                    },
                    {
                        autocomplete: {
                            query: search,
                            path: "title",
                            tokenOrder: "sequential",
                            fuzzy: {
                                maxEdits: 2,
                                prefixLength: 1,
                                maxExpansions: 100,
                            },
                            score: {
                                boost: {
                                    value: 8,
                                },
                            },
                        },
                    },
                    {
                        text: {
                            query: search,
                            path: "tags",
                            fuzzy: {
                                maxEdits: 2,
                                prefixLength: 1,
                                maxExpansions: 50,
                            },
                            score: {
                                boost: {
                                    value: 5,
                                },
                            },
                        },
                    },
                ];

                compound.minimumShouldMatch = 1;
            }

            pipeline.push({
                $search: {
                    index: "food_image_search",
                    compound,
                },
            });

            if (search) {
                pipeline.push({
                    $set: {
                        searchScore: {
                            $meta: "searchScore",
                        },
                    },
                });
            }
        }

        if (Object.keys(mongoFilter).length > 0) {
            pipeline.push({
                $match: mongoFilter,
            });
        }

        if (search) {
            pipeline.push({
                $sort: {
                    searchScore: -1,
                    createdAt: -1,
                },
            });
        } else {
            pipeline.push({
                $sort: {
                    createdAt: -1,
                },
            });
        }

        pipeline.push({
            $facet: {
                data: [
                    {
                        $skip: skip,
                    },
                    {
                        $limit: limit,
                    },
                    {
                        $project: {
                            _id: 1,
                            name: { $ifNull: ["$title", "$name"] },
                            image_url: 1,
                            optimised_image_url: 1,
                        },
                    },
                ],

                metadata: [
                    {
                        $count: "total",
                    },
                ],
            },
        });

        const [result] = await ImageModel.aggregate(pipeline);

        const images = result?.data || [];

        const totalCount =
            result?.metadata?.[0]?.total || 0;

        const responsePayload = {
            success: true,
            message: "Images fetched successfully",
            data: images,
            pagination: {
                total: totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit),
            },
        };

        await setCache(cacheKey, responsePayload, SEARCH_CACHE_TTL_SEC);
        return NextResponse.json(responsePayload, {
            headers: {
                "X-Cache": "MISS",
            },
        });
    } catch (error) {
        console.error("Food search error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error.message,
            },
            {
                status: 500,
            }
        );
    }
}