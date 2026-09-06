import mongoose from "mongoose";

const ImageSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        tags: [{ type: String, trim: true }],
        cuisine: { type: String, trim: true },
        image_url: { type: String, required: true, trim: true },
        approved: { type: Boolean, default: false },
        premium: { type: Boolean, default: false },
        category: { type: String, trim: true },
        sub_category: { type: String, trim: true },
        food_type: { type: String, trim: true },
        downloads: { type: Number, default: 0, min: 0 },
        latest: { type: Boolean, default: false },
    },
    { timestamps: true }
);

ImageSchema.index(
    {
        title: "text",
        tags: "text",
        cuisine: "text",
        description: "text",
    },
    {
        weights: {
            title: 10,
            tags: 6,
            cuisine: 3,
            description: 1,
        },
        name: "TextSearchIndex",
    }
);

ImageSchema.index(
    { category: 1 },
    { collation: { locale: "en", strength: 2 } }
);
ImageSchema.index(
    { sub_category: 1 },
    { collation: { locale: "en", strength: 2 } }
);

ImageSchema.index({ approved: 1, premium: 1 });

const Image = mongoose.models.Image || mongoose.model("Image", ImageSchema);

export default Image;