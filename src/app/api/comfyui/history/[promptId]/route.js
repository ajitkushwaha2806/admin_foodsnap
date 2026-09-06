import { NextResponse } from "next/server";
import axios from "axios";

export async function GET(request, { params }) {
  try {
    const { promptId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const serverUrl = searchParams.get("serverUrl") || "http://127.0.0.1:8188";

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
