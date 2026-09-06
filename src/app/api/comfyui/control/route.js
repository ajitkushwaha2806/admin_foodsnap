import { NextResponse } from "next/server";
import { spawn, exec } from "child_process";
import path from "path";

let comfyProcess = null;

export async function GET() {
  return new Promise((resolve) => {
    exec("pgrep -f 'main.py' || true", (err, stdout) => {
      const isRunning = Boolean(stdout && stdout.trim().length > 0);
      resolve(
        NextResponse.json({
          isRunning,
          pid: isRunning ? stdout.trim().split("\n")[0] : null,
        })
      );
    });
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "stop") {
      return new Promise((resolve) => {
        exec("pkill -f 'ComfyUI/main.py' || pkill -f 'main.py' || true", () => {
          comfyProcess = null;
          resolve(
            NextResponse.json({
              success: true,
              message: "ComfyUI process stopped.",
            })
          );
        });
      });
    }

    if (action === "start") {
      const scriptPath = path.join(process.cwd(), "scripts", "start-comfy.sh");

      comfyProcess = spawn("bash", [scriptPath], {
        detached: true,
        stdio: "ignore",
      });

      comfyProcess.unref();

      return NextResponse.json({
        success: true,
        message: "ComfyUI starting with Low-RAM flags in background...",
      });
    }

    return NextResponse.json({ success: true, message: "Action completed." });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
