import { NextResponse } from "next/server";
import axios from "axios";

export async function GET(request) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filename = searchParams.get("filename");
    const subfolder = searchParams.get("subfolder") || "";
    const type = searchParams.get("type") || "output";
    const serverUrl = searchParams.get("serverUrl") || "http://127.0.0.1:8188";

    if (!filename) {
      return NextResponse.json({ error: "Filename parameter is required" }, { status: 400 });
    }

    const viewUrl = `${serverUrl.replace(/\/$/, "")}/view?filename=${encodeURIComponent(
      filename
    )}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(type)}`;

    const res = await axios.get(viewUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
    });

    const contentType = res.headers["content-type"] || "image/png";

    return new NextResponse(res.data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error.response?.data?.error || error.message || "Failed to fetch image from ComfyUI",
      },
      { status: error.response?.status || 500 }
    );
  }
}
