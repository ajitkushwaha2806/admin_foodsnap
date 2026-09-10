import { NextResponse } from "next/server";
import {
  getEC2InstanceStatus,
  getEC2FleetStatus,
  startEC2Instance,
  startMultipleEC2Instances,
  stopEC2Instance,
  stopMultipleEC2Instances,
  rebootEC2Instance,
} from "@/lib/aws/ec2";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get("instanceId") || undefined;
    const mode = searchParams.get("mode");

    if (mode === "fleet" || (!instanceId && searchParams.get("fleet") === "true")) {
      const fleet = await getEC2FleetStatus();
      return NextResponse.json({ success: true, ...fleet });
    }

    const data = await getEC2InstanceStatus(instanceId);
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, instanceId, instanceIds } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, error: "Action (start, stop, reboot, start_all, stop_all) is required" },
        { status: 400 }
      );
    }

    let result;
    if (action === "start") {
      result = await startEC2Instance(instanceId);
    } else if (action === "start_all") {
      result = await startMultipleEC2Instances(instanceIds);
    } else if (action === "stop") {
      result = await stopEC2Instance(instanceId);
    } else if (action === "stop_all") {
      result = await stopMultipleEC2Instances(instanceIds);
    } else if (action === "reboot") {
      result = await rebootEC2Instance(instanceId);
    } else {
      return NextResponse.json(
        { success: false, error: "Invalid action. Use start, stop, reboot, start_all, or stop_all" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
