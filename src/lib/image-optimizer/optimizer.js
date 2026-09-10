import sharp from "sharp";
import axios from "axios";
import crypto from "crypto";
import dbConnect from "../dbConnect.js";
import ImageModel from "../../models/Image.js";
import { invalidateSearchCache } from "../redis.js";
import { uploadToS3, getObjectFromS3 } from "../aws/uploadToS3.js";

export const OPTIMIZATION_CONFIG = {
  width: 1200,
  height: 900,
  quality: 75,
  effort: 4,
  chromaSubsampling: "4:2:0",
  folderPrefix: "optimised",
};

export async function optimizeBufferToAvif(inputBuffer, options = {}) {
  const width = options.width || OPTIMIZATION_CONFIG.width;
  const height = options.height || OPTIMIZATION_CONFIG.height;
  const quality = options.quality || OPTIMIZATION_CONFIG.quality;
  const effort = options.effort || OPTIMIZATION_CONFIG.effort;

  const sharpInstance = sharp(inputBuffer, { failOnError: false })
    .rotate()
    .resize({
      width,
      height,
      fit: "cover",
      position: sharp.strategy.attention || "center",
      withoutEnlargement: false,
    })
    .avif({
      quality,
      effort,
      chromaSubsampling: OPTIMIZATION_CONFIG.chromaSubsampling,
    });

  const { data, info } = await sharpInstance.toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    info,
    contentType: "image/avif",
  };
}

export async function resolveImageBuffer(source) {
  if (Buffer.isBuffer(source)) {
    return source;
  }

  if (typeof source === "string") {
    if (source.startsWith("http://") || source.startsWith("https://")) {
      const response = await axios.get(source, {
        responseType: "arraybuffer",
        timeout: 30000,
      });
      return Buffer.from(response.data);
    }

    return getObjectFromS3(source);
  }

  throw new Error("Invalid image source provided for optimization");
}

export function buildOptimizedS3Key(originalNameOrKey, idFallback) {
  let baseName = "image";

  if (originalNameOrKey) {
    const cleanPath = originalNameOrKey.split("?")[0];
    const rawFile = cleanPath.substring(cleanPath.lastIndexOf("/") + 1);
    baseName = rawFile.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, "_");
  } else if (idFallback) {
    baseName = String(idFallback);
  }

  baseName = baseName.replace(/^optimised_|^optimised-/, "");
  const uniqueSuffix = crypto.randomBytes(4).toString("hex");

  return `${OPTIMIZATION_CONFIG.folderPrefix}/${baseName}-${uniqueSuffix}.avif`;
}

export async function processAndStoreOptimizedImage({
  source,
  imageId,
  s3Key,
  originalUrl,
  fileName,
}) {
  const inputSource = source || s3Key || originalUrl;
  if (!inputSource) {
    throw new Error("No image source provided to optimizer");
  }

  const originalBuffer = await resolveImageBuffer(inputSource);
  const originalSizeBytes = originalBuffer.length;

  const { buffer: avifBuffer, info } = await optimizeBufferToAvif(originalBuffer);
  const optimizedSizeBytes = avifBuffer.length;
  const targetKey = buildOptimizedS3Key(fileName || s3Key || originalUrl, imageId);

  const s3Result = await uploadToS3(avifBuffer, targetKey, "image/avif");

  let updatedDoc = null;
  if (imageId) {
    await dbConnect();
    const existingDoc = await ImageModel.findById(imageId);
    if (existingDoc) {
      const rawOriginalUrl = existingDoc.image_url || inputSource;

      updatedDoc = await ImageModel.findByIdAndUpdate(
        imageId,
        {
          image_url: rawOriginalUrl, 
          optimised_image_url: s3Result.url, 
          is_optimized: true,
        },
        { new: true }
      );
    }
  }

  await invalidateSearchCache();
  const compressionRatio = ((1 - optimizedSizeBytes / originalSizeBytes) * 100).toFixed(1);

  return {
    success: true,
    optimizedUrl: s3Result.url,
    s3Key: targetKey,
    dimensions: `${info.width}x${info.height}`,
    originalSizeBytes,
    optimizedSizeBytes,
    savedPercentage: `${compressionRatio}%`,
    image: updatedDoc,
  };
}

const imageOptimizerService = {
  optimizeBufferToAvif,
  resolveImageBuffer,
  buildOptimizedS3Key,
  processAndStoreOptimizedImage,
};

export default imageOptimizerService;
