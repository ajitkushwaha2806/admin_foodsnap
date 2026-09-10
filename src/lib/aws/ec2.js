import {
  EC2Client,
  DescribeInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  RebootInstancesCommand,
} from "@aws-sdk/client-ec2";

export const DEFAULT_INSTANCE_IDS = [
  "i-072a8587c036011dd", // foodsnap-server (GPU #1)
  "i-07130a5dd38cdf261", // foodsnap-gpu2 (GPU #2)
  "i-00cf7159d934d1a48", // foodsnap-gpu3 (GPU #3)
];

export function getEC2Client() {
  const region = process.env.AWS_REGION || "ap-southeast-2";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) not configured in .env");
  }

  return new EC2Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export async function getEC2InstanceStatus(customInstanceId) {
  const targetId = customInstanceId || process.env.AWS_EC2_INSTANCE_ID || "i-072a8587c036011dd";
  const client = getEC2Client();
  const command = new DescribeInstancesCommand({
    InstanceIds: [targetId],
  });

  const response = await client.send(command);
  const reservation = response.Reservations?.[0];
  const instance = reservation?.Instances?.[0];

  if (!instance) {
    throw new Error(`Instance ${customInstanceId} not found`);
  }

  const state = instance.State?.Name || "unknown";
  const publicIp = instance.PublicIpAddress || null;
  const privateIp = instance.PrivateIpAddress || null;
  const instanceType = instance.InstanceType || null;
  const launchTime = instance.LaunchTime || null;

  return {
    instanceId: customInstanceId || targetId,
    state,
    publicIp,
    privateIp,
    instanceType,
    launchTime,
    comfyUrl: publicIp ? `http://${publicIp}:8188` : null,
  };
}

export async function getEC2FleetStatus(instanceIds) {
  const targetIds = instanceIds || (
    process.env.AWS_EC2_INSTANCE_IDS
      ? process.env.AWS_EC2_INSTANCE_IDS.split(",").map((s) => s.trim()).filter(Boolean)
      : DEFAULT_INSTANCE_IDS
  );

  const client = getEC2Client();
  const command = new DescribeInstancesCommand({
    InstanceIds: targetIds,
  });

  const response = await client.send(command);
  const instances = [];

  response.Reservations?.forEach((res) => {
    res.Instances?.forEach((inst) => {
      const nameTag = inst.Tags?.find((t) => t.Key === "Name")?.Value || inst.InstanceId;
      const publicIp = inst.PublicIpAddress || null;
      instances.push({
        instanceId: inst.InstanceId,
        name: nameTag,
        state: inst.State?.Name || "unknown",
        publicIp,
        privateIp: inst.PrivateIpAddress || null,
        instanceType: inst.InstanceType || "g4dn.xlarge",
        comfyUrl: publicIp ? `http://${publicIp}:8188` : null,
      });
    });
  });

  // Sort by index in targetIds
  instances.sort((a, b) => targetIds.indexOf(a.instanceId) - targetIds.indexOf(b.instanceId));

  const runningCount = instances.filter((i) => i.state === "running").length;

  return {
    instances,
    runningCount,
    totalCount: instances.length,
    allRunning: runningCount === instances.length,
    anyRunning: runningCount > 0,
  };
}

export async function startEC2Instance(customInstanceId) {
  const targetId = customInstanceId || process.env.AWS_EC2_INSTANCE_ID || "i-072a8587c036011dd";
  const client = getEC2Client();
  const command = new StartInstancesCommand({
    InstanceIds: [targetId],
  });

  const response = await client.send(command);
  const change = response.StartingInstances?.[0];

  return {
    instanceId: targetId,
    previousState: change?.PreviousState?.Name,
    currentState: change?.CurrentState?.Name || "pending",
  };
}

export async function startMultipleEC2Instances(instanceIds) {
  const targetIds = instanceIds || (
    process.env.AWS_EC2_INSTANCE_IDS
      ? process.env.AWS_EC2_INSTANCE_IDS.split(",").map((s) => s.trim()).filter(Boolean)
      : DEFAULT_INSTANCE_IDS
  );

  const client = getEC2Client();
  const command = new StartInstancesCommand({
    InstanceIds: targetIds,
  });

  const response = await client.send(command);
  return {
    startedInstances: response.StartingInstances?.map((i) => ({
      instanceId: i.InstanceId,
      previousState: i.PreviousState?.Name,
      currentState: i.CurrentState?.Name,
    })),
  };
}

export async function stopEC2Instance(customInstanceId) {
  const targetId = customInstanceId || process.env.AWS_EC2_INSTANCE_ID || "i-072a8587c036011dd";
  const client = getEC2Client();
  const command = new StopInstancesCommand({
    InstanceIds: [targetId],
  });

  const response = await client.send(command);
  const change = response.StoppingInstances?.[0];

  return {
    instanceId: targetId,
    previousState: change?.PreviousState?.Name,
    currentState: change?.CurrentState?.Name || "stopping",
  };
}

export async function stopMultipleEC2Instances(instanceIds) {
  const targetIds = instanceIds || (
    process.env.AWS_EC2_INSTANCE_IDS
      ? process.env.AWS_EC2_INSTANCE_IDS.split(",").map((s) => s.trim()).filter(Boolean)
      : DEFAULT_INSTANCE_IDS
  );

  const client = getEC2Client();
  const command = new StopInstancesCommand({
    InstanceIds: targetIds,
  });

  const response = await client.send(command);
  return {
    stoppingInstances: response.StoppingInstances?.map((i) => ({
      instanceId: i.InstanceId,
      previousState: i.PreviousState?.Name,
      currentState: i.CurrentState?.Name,
    })),
  };
}

export async function rebootEC2Instance(customInstanceId) {
  const targetId = customInstanceId || process.env.AWS_EC2_INSTANCE_ID || "i-072a8587c036011dd";
  const client = getEC2Client();
  const command = new RebootInstancesCommand({
    InstanceIds: [targetId],
  });

  await client.send(command);

  return {
    instanceId: targetId,
    message: "Reboot command sent successfully",
  };
}
