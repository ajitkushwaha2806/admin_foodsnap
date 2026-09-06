import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Background from "@/models/Background";

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await dbConnect();

    const deleted = await Background.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json({ error: "Background not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Background deleted successfully" });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to delete background" },
      { status: 500 }
    );
  }
}
