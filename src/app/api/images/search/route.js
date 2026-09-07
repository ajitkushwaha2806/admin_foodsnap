import dbConnect from "@/lib/dbConnect";
import ImageModel from "@/models/Image";
import { NextResponse } from "next/server";

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
        await dbConnect();

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

        return NextResponse.json({
            success: true,

            data: images,

            pagination: {
                total: totalCount,
                page,
                limit,
                totalPages: Math.ceil(
                    totalCount / limit
                ),
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