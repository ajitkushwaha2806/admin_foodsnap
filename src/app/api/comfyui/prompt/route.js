import { NextResponse } from "next/server";
import axios from "axios";

export async function POST(request) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const serverUrl = searchParams.get("serverUrl") || "http://127.0.0.1:8188";

    const body = await request.json();
    const promptUrl = `${serverUrl.replace(/\/$/, "")}/prompt`;

    const res = await axios.post(promptUrl, body, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    return NextResponse.json(res.data);
  } catch (error) {
    const responseData = error.response?.data;
    let errorMessage = "Failed to queue prompt in ComfyUI";

    if (responseData) {
      if (responseData.node_errors && Object.keys(responseData.node_errors).length > 0) {
        errorMessage = `Node errors: ${JSON.stringify(responseData.node_errors)}`;
      } else if (responseData.error) {
        errorMessage =
          typeof responseData.error === "string"
            ? responseData.error
            : JSON.stringify(responseData.error);
      } else if (typeof responseData === "string") {
        errorMessage = responseData;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }

    console.error("ComfyUI Prompt Queue Error:", errorMessage);

    return NextResponse.json(
      {
        error: errorMessage,
        details: responseData || error.message,
      },
      { status: error.response?.status || 500 }
    );
  }
}
