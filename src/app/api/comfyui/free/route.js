import { NextResponse } from "next/server";
import axios from "axios";

export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const serverUrl =
      searchParams.get("serverUrl") ||
      process.env.COMFYUI_SERVER_URL ||
      process.env.NEXT_PUBLIC_COMFYUI_SERVER_URL ||
      "http://13.55.57.70:8188";
    const body = await request.json().catch(() => ({}));

    const cleanBase = serverUrl.replace(/\/$/, "");
    const response = await axios.post(`${cleanBase}/free`, {
      unload_models: body.unload_models ?? false,
      free_memory: body.free_memory ?? true,
    });

    return NextResponse.json(response.data);
  } catch (error) {
    return NextResponse.json(
      {
        error: error.response?.data?.error || error.message || "Failed to free ComfyUI memory",
      },
      { status: error.response?.status || 500 }
    );
  }
}
