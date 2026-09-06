import mongoose from "mongoose";

const BackgroundSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    image_url: { type: String, required: true, trim: true },
    s3_key: { type: String, trim: true },
    is_preset: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Background = mongoose.models.Background || mongoose.model("Background", BackgroundSchema);

export default Background;
