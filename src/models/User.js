import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
    {
        name: {
            type: String,
        },
        phone: { type: String, required: true, unique: true },
        password: {
            type: String,
            required: true,
        },

        credits: {
            type: Number,
            default: 10,
        },

        subscription: {
            isActive: { type: Boolean, default: false },
            expiresAt: { type: Date },
            plan: { type: String, default: "free" },
            razorpayOrderId: { type: String },
            razorpayPaymentId: { type: String },
        },
        totalImagesDownloaded: { type: Number, default: 0 },
        avatar: { type: String },
    },
    { timestamps: true }
);

export default mongoose.models.User || mongoose.model("User", UserSchema);