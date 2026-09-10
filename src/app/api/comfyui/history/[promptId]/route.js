import { NextResponse } from "next/server";
import axios from "axios";

export async function GET(request, { params }) {
  try {
    const { promptId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const serverUrl =
      searchParams.get("serverUrl") ||
      process.env.COMFYUI_SERVER_URL ||
      process.env.NEXT_PUBLIC_COMFYUI_SERVER_URL ||
      "http://13.55.57.70:8188";

    const historyUrl = `${serverUrl.replace(/\/$/, "")}/history/${promptId}`;

    const res = await axios.get(historyUrl, {
      timeout: 15000,
    });

    return NextResponse.json(res.data);
  } catch (error) {
    return NextResponse.json(
      {
        error: error.response?.data?.error || error.message || "Failed to fetch ComfyUI history",
      },
      { status: error.response?.status || 500 }
    );
  }
}
