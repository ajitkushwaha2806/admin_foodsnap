import { Queue, QueueEvents } from "bullmq";
import Redis from "ioredis";

export const QUEUE_NAME = "foodsnap-image-generation";

let redisConnection = null;

export function getQueueRedisConnection() {
  if (redisConnection) return redisConnection;

  const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

  redisConnection = new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      return Math.min(times * 200, 3000);
    },
  });

  redisConnection.on("error", (err) => {
    console.warn("[BullMQ Redis Warning]:", err?.message || err);
  });

  return redisConnection;
}

let imageQueue = null;

export function getImageGenerationQueue() {
  if (!imageQueue) {
    imageQueue = new Queue(QUEUE_NAME, {
      connection: getQueueRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: {
          age: 3600 * 24 * 7, // Keep completed jobs for 7 days
          count: 500,
        },
        removeOnFail: {
          age: 3600 * 24 * 14, // Keep failed jobs for 14 days
          count: 500,
        },
      },
    });
  }
  return imageQueue;
}

/**
 * Add a single image generation job
 */
export async function addGenerationJob(data, options = {}) {
  const queue = getImageGenerationQueue();
  const jobName = `dish-${data.name || data.title || "image"}-${Date.now()}`;
  return await queue.add(jobName, data, {
    attempts: 2,
    backoff: { type: "fixed", delay: 4000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
    priority: options.priority || 1,
    ...options,
  });
}

/**
 * Add multiple image generation jobs in bulk
 */
export async function addBulkGenerationJobs(items = [], commonConfig = {}) {
  const queue = getImageGenerationQueue();
  const jobs = items.map((item, index) => ({
    name: `dish-${item.name || item.title || "item"}-${Date.now()}-${index}`,
    data: {
      ...item,
      config: {
        ...commonConfig,
        ...(item.config || {}),
      },
      queuedAt: new Date().toISOString(),
    },
    opts: {
      attempts: 2,
      backoff: { type: "fixed", delay: 4000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
      priority: item.priority || 1,
    },
  }));

  return await queue.addBulk(jobs);
}

/**
 * Get aggregate queue stats (active, waiting, completed, failed, delayed, paused, prioritized)
 */
export async function getQueueStats() {
  const queue = getImageGenerationQueue();
  const counts = await queue.getJobCounts(
    "waiting",
    "prioritized",
    "active",
    "completed",
    "failed",
    "delayed",
    "paused"
  );

  const isPaused = await queue.isPaused();
  const waitingCombined = (counts.waiting || 0) + (counts.delayed || 0) + (counts.prioritized || 0);

  return {
    waiting: waitingCombined,
    prioritized: counts.prioritized || 0,
    active: counts.active || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0,
    delayed: counts.delayed || 0,
    paused: counts.paused || 0,
    total:
      waitingCombined +
      (counts.active || 0) +
      (counts.completed || 0) +
      (counts.failed || 0),
    isPaused,
  };
}

/**
 * Get jobs by status with pagination
 */
export async function getJobsByStatus(status = "all", start = 0, end = 50) {
  const queue = getImageGenerationQueue();
  let statuses = ["waiting", "prioritized", "active", "completed", "failed", "delayed", "paused"];

  if (status === "waiting" || status === "prioritized" || status === "queued") {
    statuses = ["waiting", "prioritized", "delayed"];
  } else if (status && status !== "all") {
    statuses = [status];
  }

  const isWaitingOrPrioritized = status === "waiting" || status === "prioritized" || status === "queued";

  // Fetch jobs: asc = true for prioritized/waiting queue order, asc = false for completed/failed
  const rawJobs = await queue.getJobs(statuses, 0, 1000, isWaitingOrPrioritized);

  const mapped = await Promise.all(
    rawJobs.map(async (job) => {
      let state = "waiting";
      try {
        state = await job.getState();
      } catch {
        state = job.finishedOn ? (job.failedReason ? "failed" : "completed") : "active";
      }

      const executionTimeSec =
        job.returnvalue?.durationSec ||
        (job.finishedOn && job.processedOn
          ? Math.max(1, Math.round((job.finishedOn - job.processedOn) / 1000))
          : null);

      return {
        id: job.id,
        name: job.name,
        data: job.data,
        progress: job.progress,
        returnvalue: job.returnvalue,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        executionTimeSec,
        state: state === "delayed" ? "waiting" : state,
      };
    })
  );

  // Sort based on status:
  mapped.sort((a, b) => {
    // 1. Always pin active jobs to top
    if (a.state === "active" && b.state !== "active") return -1;
    if (b.state === "active" && a.state !== "active") return 1;

    // 2. If prioritized or waiting, sort by exact processing order:
    // lowest priority number first, then lowest job ID first (FIFO: next to be processed is at top)
    if (isWaitingOrPrioritized || (a.state === "waiting" && b.state === "waiting")) {
      const prioA = a.data?.priority || 1;
      const prioB = b.data?.priority || 1;
      if (prioA !== prioB) return prioA - prioB;
      return Number(a.id || 0) - Number(b.id || 0);
    }

    // 3. For completed / failed / history, sort by latest finished/processed descending
    const timeA = a.finishedOn || a.processedOn || a.timestamp || 0;
    const timeB = b.finishedOn || b.processedOn || b.timestamp || 0;
    if (timeA !== timeB) return timeB - timeA;

    return Number(b.id || 0) - Number(a.id || 0);
  });

  return {
    jobs: mapped.slice(start, end + 1),
    totalCount: mapped.length,
    allMappedJobs: mapped,
  };
}

/**
 * Retry a failed job by ID
 */
export async function retryJob(jobId) {
  const queue = getImageGenerationQueue();
  const job = await queue.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  await job.retry();
  return { success: true, id: job.id };
}

/**
 * Delete a job by ID and return its productId if any
 */
export async function deleteJob(jobId) {
  const queue = getImageGenerationQueue();
  const job = await queue.getJob(jobId);
  if (!job) return { success: false, reason: "not_found" };
  const productId = job.data?.productId || job.data?._id || null;
  await job.remove();
  return { success: true, productId };
}

/**
 * Bulk delete jobs by IDs and return their productIds
 */
export async function deleteJobs(jobIds = []) {
  const queue = getImageGenerationQueue();
  let deletedCount = 0;
  const productIds = [];

  for (const id of jobIds) {
    try {
      const job = await queue.getJob(id);
      if (job) {
        const prodId = job.data?.productId || job.data?._id;
        if (prodId) productIds.push(prodId);
        await job.remove();
        deletedCount++;
      }
    } catch (e) {
      console.warn(`Failed to delete job ${id}:`, e?.message);
    }
  }

  return { success: true, count: deletedCount, productIds };
}

/**
 * Find and purge duplicate waiting / prioritized jobs, keeping only the first one
 */
export async function deleteDuplicateWaitingJobs() {
  const queue = getImageGenerationQueue();
  const waitingJobs = await queue.getJobs(["waiting", "prioritized", "delayed"], 0, 5000, true);

  const seenUrls = new Set();
  const seenNames = new Set();
  const duplicateJobIds = [];
  const duplicateProductIds = [];

  for (const job of waitingJobs) {
    const rawUrl = (job.data?.image_url || job.data?.originalUrl || job.data?.fileUrl || "").trim();
    const rawName = (job.data?.name || job.data?.title || "").trim().toLowerCase();

    const isDuplicate =
      (rawUrl && seenUrls.has(rawUrl)) ||
      (rawName && seenNames.has(rawName));

    if (isDuplicate) {
      duplicateJobIds.push(job.id);
      const prodId = job.data?.productId || job.data?._id;
      if (prodId) duplicateProductIds.push(prodId);
    } else {
      if (rawUrl) seenUrls.add(rawUrl);
      if (rawName) seenNames.add(rawName);
    }
  }

  // Remove duplicate jobs from queue
  for (const id of duplicateJobIds) {
    try {
      const job = await queue.getJob(id);
      if (job) await job.remove();
    } catch (err) {
      console.warn(`Error removing duplicate job ${id}:`, err?.message);
    }
  }

  return {
    success: true,
    count: duplicateJobIds.length,
    jobIds: duplicateJobIds,
    productIds: duplicateProductIds,
  };
}

/**
 * Clean old jobs from queue
 */
export async function cleanQueue(status = "completed", graceMs = 0) {
  const queue = getImageGenerationQueue();
  return await queue.clean(graceMs, 1000, status);
}

/**
 * Retry all failed jobs
 */
export async function retryAllFailedJobs() {
  const queue = getImageGenerationQueue();
  const failedJobs = await queue.getJobs(["failed"], 0, 500);
  let count = 0;
  for (const job of failedJobs) {
    await job.retry().catch(() => {});
    count++;
  }
  return { success: true, count };
}

/**
 * Reset stuck active jobs back to waiting
 */
export async function resetStalledJobs() {
  const queue = getImageGenerationQueue();
  const activeJobs = await queue.getJobs(["active"], 0, 500);
  let count = 0;
  for (const job of activeJobs) {
    try {
      await job.moveToWaiting(queue.token || "0").catch(async () => {
        await job.retry().catch(() => {});
      });
      count++;
    } catch {
      // ignore
    }
  }
  return { success: true, count };
}

/**
 * Pause / Resume queue
 */
export async function pauseQueue() {
  const queue = getImageGenerationQueue();
  return await queue.pause();
}

export async function resumeQueue() {
  const queue = getImageGenerationQueue();
  return await queue.resume();
}

/**
 * Empty waiting queue
 */
export async function emptyQueue() {
  const queue = getImageGenerationQueue();
  const waitingJobs = await queue.getJobs(["waiting", "prioritized", "delayed"], 0, 20000);
  const productIds = waitingJobs.map((j) => j.data?.productId || j.data?._id).filter(Boolean);
  await queue.drain(true);
  return { success: true, productIds };
}
