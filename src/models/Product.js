import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    image_url: { type: String, trim: true },
    category: { type: String, trim: true },
    sub_category: { type: String, trim: true },
    dietaryType: { type: String, trim: true },
    processed: { type: Boolean, default: false },
    process_status: {
      type: String,
      enum: ["idle", "queued", "processing", "completed", "failed"],
      default: "idle",
    },
    ai_image_url: { type: String, trim: true },
    last_job_id: { type: String, trim: true },
    failed_reason: { type: String, trim: true },
  },
  { timestamps: true }
);

const Product = mongoose.models.Product || mongoose.model("Product", ProductSchema);

export default Product;
