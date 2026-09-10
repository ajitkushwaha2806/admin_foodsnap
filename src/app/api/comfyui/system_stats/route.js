import { NextResponse } from "next/server";
import axios from "axios";

export async function GET(request) {
  const searchParams = request.nextUrl.searchParams;
  const serverUrl =
    searchParams.get("serverUrl") ||
    process.env.COMFYUI_SERVER_URL ||
    process.env.NEXT_PUBLIC_COMFYUI_SERVER_URL ||
    "http://13.55.57.70:8188";

  try {
    const res = await axios.get(`${serverUrl.replace(/\/$/, "")}/system_stats`, {
      timeout: 5000,
    });
    return NextResponse.json(res.data);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to connect to ComfyUI server",
        details: error.message,
      },
      { status: 502 }
    );
  }
}
