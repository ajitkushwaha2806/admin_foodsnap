import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand, ChangeMessageVisibilityCommand } from "@aws-sdk/client-sqs";

const getQueueUrl = () => process.env.AWS_SQS_QUEUE_URL;
const getSqsRegion = () => process.env.AWS_SQS_REGION || process.env.AWS_REGION || "ap-southeast-2";

export function getSqsClient() {
  return new SQSClient({
    region: getSqsRegion(),
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  });
}

export const sqsClient = getSqsClient();

export async function sendOptimizationJob(payload = {}) {
  const queueUrl = getQueueUrl();
  if (!queueUrl) {
    console.warn("[SQS Warning]: AWS_SQS_QUEUE_URL is not set. Skipping queue dispatch.");
    return { success: false, skipped: true, reason: "AWS_SQS_QUEUE_URL missing" };
  }

  const messageBody = JSON.stringify({
    ...payload,
    timestamp: new Date().toISOString(),
    action: payload.action || "OPTIMIZE_IMAGE_AVIF_4_3",
  });

  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: messageBody,
  });

  const result = await getSqsClient().send(command);
  return {
    success: true,
    messageId: result.MessageId,
  };
}

export async function receiveOptimizationJobs(options = {}) {
  const queueUrl = getQueueUrl();
  if (!queueUrl) {
    return [];
  }

  const maxMessages = Math.min(Math.max(Number(options.maxMessages) || 5, 1), 10);
  const waitTimeSeconds = Math.min(Math.max(Number(options.waitTimeSeconds) || 10, 0), 20);
  const visibilityTimeout = Number(options.visibilityTimeout) || 60;

  const command = new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: maxMessages,
    WaitTimeSeconds: waitTimeSeconds,
    VisibilityTimeout: visibilityTimeout,
    AttributeNames: ["All"],
    MessageAttributeNames: ["All"],
  });

  const result = await getSqsClient().send(command);
  return result.Messages || [];
}

export async function deleteOptimizationJob(receiptHandle) {
  const queueUrl = getQueueUrl();
  if (!queueUrl || !receiptHandle) return false;

  const command = new DeleteMessageCommand({
    QueueUrl: queueUrl,
    ReceiptHandle: receiptHandle,
  });

  await getSqsClient().send(command);
  return true;
}

export async function extendJobVisibility(receiptHandle, visibilityTimeoutSec = 30) {
  const queueUrl = getQueueUrl();
  if (!queueUrl || !receiptHandle) return false;

  const command = new ChangeMessageVisibilityCommand({
    QueueUrl: queueUrl,
    ReceiptHandle: receiptHandle,
    VisibilityTimeout: visibilityTimeoutSec,
  });

  await getSqsClient().send(command);
  return true;
}

export function parseSqsMessage(bodyString) {
  try {
    const data = typeof bodyString === "string" ? JSON.parse(bodyString) : bodyString;
    if (Array.isArray(data?.Records) && data.Records.length > 0) {
      return data.Records.map((record) => {
        const s3Data = record.s3 || {};
        const rawKey = decodeURIComponent((s3Data.object?.key || "").replace(/\+/g, " "));
        return {
          type: "S3_EVENT",
          s3Bucket: s3Data.bucket?.name,
          s3Key: rawKey,
          eventName: record.eventName,
          size: s3Data.object?.size,
        };
      });
    }

    return [
      {
        type: "DIRECT_JOB",
        imageId: data.imageId || data.id,
        s3Key: data.s3Key || data.key,
        s3Bucket: data.s3Bucket || data.bucket,
        imageUrl: data.imageUrl || data.url,
        fileName: data.fileName || data.title,
        action: data.action,
      },
    ];
  } catch (err) {
    console.error("[SQS Parse Error]:", err?.message);
    return [];
  }
}

const sqsService = {
  sqsClient,
  sendOptimizationJob,
  receiveOptimizationJobs,
  deleteOptimizationJob,
  extendJobVisibility,
  parseSqsMessage,
};

export default sqsService;
