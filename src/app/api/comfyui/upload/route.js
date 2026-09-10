import { NextResponse } from "next/server";
import axios from "axios";

export async function POST(request) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const serverUrl =
      searchParams.get("serverUrl") ||
      process.env.COMFYUI_SERVER_URL ||
      process.env.NEXT_PUBLIC_COMFYUI_SERVER_URL ||
      "http://13.55.57.70:8188";

    const incomingFormData = await request.formData();
    const file = incomingFormData.get("image");
    const overwrite = incomingFormData.get("overwrite");
    const type = incomingFormData.get("type") || "input";

    if (!file) {
      return NextResponse.json({ error: "No image file provided" }, { status: 400 });
    }

    const nodeFormData = new FormData();
    nodeFormData.append("image", file, file.name);
    if (overwrite) nodeFormData.append("overwrite", overwrite);
    if (type) nodeFormData.append("type", type);

    const uploadUrl = `${serverUrl.replace(/\/$/, "")}/upload/image`;

    const res = await axios.post(uploadUrl, nodeFormData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 60000,
    });

    return NextResponse.json(res.data);
  } catch (error) {
    return NextResponse.json(
      {
        error: error.response?.data?.error || error.message || "Failed to upload image to ComfyUI",
      },
      { status: error.response?.status || 500 }
    );
  }
}
