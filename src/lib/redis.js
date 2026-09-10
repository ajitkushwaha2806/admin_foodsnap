import Redis from "ioredis";
import crypto from "crypto";

const REDIS_PREFIX = "foodsnap";
export const SEARCH_CACHE_TTL_SEC = 300;
export const IMAGE_CACHE_TTL_SEC = 3600;

let redisClient = null;
export function getRedisClient() {
  const redisUrl = process.env.REDIS_URL;
  const redisHost = process.env.REDIS_HOST;

  if (!redisUrl && !redisHost) {
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  try {
    const config = redisUrl
      ? redisUrl
      : {
          host: process.env.REDIS_HOST || "127.0.0.1",
          port: Number(process.env.REDIS_PORT) || 6379,
          password: process.env.REDIS_PASSWORD || undefined,
          username: process.env.REDIS_USERNAME || "default",
          tls: process.env.REDIS_TLS === "true" ? {} : undefined,
        };

    const client = new Redis(config, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 3) {
          return null; 
        }
        return Math.min(times * 100, 2000);
      },
    });

    client.on("error", (err) => {
      console.warn("[Redis Error]:", err?.message || err);
    });

    redisClient = client;
    return redisClient;
  } catch (error) {
    console.warn("[Redis Init Error]:", error?.message);
    return null;
  }
}

export function generateSearchCacheKey(params = {}) {
  const relevantKeys = [
    "search",
    "approved",
    "latest",
    "premium",
    "category",
    "sub_category",
    "food_type",
    "cuisine",
    "tags",
    "page",
    "limit",
  ];

  const sortedObj = {};
  relevantKeys.sort().forEach((key) => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== "") {
      sortedObj[key] = String(params[key]).trim().toLowerCase();
    }
  });

  const rawString = JSON.stringify(sortedObj);
  const hash = crypto.createHash("md5").update(rawString).digest("hex");
  return `${REDIS_PREFIX}:search:v1:${hash}`;
}

export function generateImageCacheKey(imageId) {
  return `${REDIS_PREFIX}:image:${imageId}`;
}

export async function getCache(key) {
  try {
    const client = getRedisClient();
    if (!client) return null;

    if (client.status === "wait") {
      await client.connect();
    }

    const data = await client.get(key);
    if (!data) return null;

    return JSON.parse(data);
  } catch (error) {
    console.warn(`[Redis GetCache Error on ${key}]:`, error?.message);
    return null;
  }
}

export async function setCache(key, value, ttlSeconds = SEARCH_CACHE_TTL_SEC) {
  try {
    const client = getRedisClient();
    if (!client) return false;

    if (client.status === "wait") {
      await client.connect();
    }

    const serialized = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await client.set(key, serialized, "EX", ttlSeconds);
    } else {
      await client.set(key, serialized);
    }
    return true;
  } catch (error) {
    console.warn(`[Redis SetCache Error on ${key}]:`, error?.message);
    return false;
  }
}

export async function deleteCache(key) {
  try {
    const client = getRedisClient();
    if (!client) return false;

    if (client.status === "wait") {
      await client.connect();
    }

    await client.del(key);
    return true;
  } catch (error) {
    console.warn(`[Redis DeleteCache Error on ${key}]:`, error?.message);
    return false;
  }
}

export async function invalidatePattern(pattern) {
  try {
    const client = getRedisClient();
    if (!client) return false;

    if (client.status === "wait") {
      await client.connect();
    }

    const stream = client.scanStream({
      match: pattern,
      count: 100,
    });

    const pipeline = client.pipeline();
    let keysFound = 0;

    return new Promise((resolve) => {
      stream.on("data", (keys) => {
        if (keys.length) {
          keysFound += keys.length;
          keys.forEach((key) => pipeline.del(key));
        }
      });

      stream.on("end", async () => {
        if (keysFound > 0) {
          await pipeline.exec();
        }
        resolve(true);
      });

      stream.on("error", (err) => {
        console.warn(`[Redis InvalidatePattern Error on ${pattern}]:`, err?.message);
        resolve(false);
      });
    });
  } catch (error) {
    console.warn(`[Redis InvalidatePattern Error on ${pattern}]:`, error?.message);
    return false;
  }
}

export async function invalidateSearchCache() {
  return invalidatePattern(`${REDIS_PREFIX}:search:*`);
}

export async function invalidateImageCache(imageId) {
  const promises = [invalidateSearchCache()];
  if (imageId) {
    promises.push(deleteCache(generateImageCacheKey(imageId)));
  }
  await Promise.all(promises);
}
