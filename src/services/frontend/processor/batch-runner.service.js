import axios from "axios";
import { ComfyUIService } from "../comfyui";
import { ComfyWebSocketClient } from "@/lib/comfyui/websocket-client";
import { buildComfyWorkflowPrompt } from "@/lib/comfyui/workflow-builder";
import { generateUUID, optimizeImageForGeneration } from "@/lib/utils";

/**
 * Handles the sequential batch execution queue for AI transformations,
 * real-time progress callbacks, AWS S3 upload, MongoDB Image saving, and low-RAM cleanup.
 */
export class BatchRunnerService {
  constructor(config, callbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;
    this.clientId = generateUUID();
    this.wsClient = null;
    this.isCancelled = false;
    this.activePromptId = null;
    this.activeItemId = null;
    this.promptResolveMap = new Map();
  }

  /**
   * Initialize ComfyUI WebSocket connection
   */
  initWebSocket() {
    this.wsClient = new ComfyWebSocketClient(this.config.serverUrl, this.clientId, {
      onProgress: (data) => {
        if (this.activeItemId && data.max > 0) {
          const stepPercent = Math.round((data.value / data.max) * 100);
          this.callbacks.onItemUpdate?.(this.activeItemId, {
            progress: Math.min(stepPercent, 99),
            currentStep: data.value,
            maxSteps: data.max,
          });
        }
      },
      onExecuting: (data) => {
        if (this.activeItemId) {
          if (data.node) {
            this.callbacks.onItemUpdate?.(this.activeItemId, {
              currentNodeId: data.node,
              currentNodeName: this.getNodeDisplayName(data.node),
            });
            this.callbacks.onLog?.(`[Node ${data.node}] ${this.getNodeDisplayName(data.node)}`);
          } else {
            // Workflow execution finished
            this.callbacks.onItemUpdate?.(this.activeItemId, {
              currentNodeName: "Finalizing output...",
            });
          }
        }
      },
      onExecuted: (data) => {
        if (data.prompt_id && this.promptResolveMap.has(data.prompt_id)) {
          if (data.output?.images?.length > 0) {
            const resolver = this.promptResolveMap.get(data.prompt_id);
            if (resolver.interval) clearInterval(resolver.interval);
            resolver.resolve(data.output.images[0]);
            this.promptResolveMap.delete(data.prompt_id);
          }
        }
      },
      onExecutionError: (data) => {
        if (data.prompt_id && this.promptResolveMap.has(data.prompt_id)) {
          const resolver = this.promptResolveMap.get(data.prompt_id);
          if (resolver.interval) clearInterval(resolver.interval);
          resolver.reject(new Error(data.exception_message || "ComfyUI Execution Error"));
          this.promptResolveMap.delete(data.prompt_id);
        }
      },
    });

    this.wsClient.connect();
  }

  getNodeDisplayName(nodeId) {
    const map = {
      "76": "Loading Subject Dish",
      "81": "Loading Background Surface",
      "124": "Scaling Background Canvas",
      "125": "Scaling Subject Canvas",
      "92:101": "KSampler Select (Euler)",
      "92:102": "Flux2 Scheduler (4 Steps)",
      "92:103": "CFG Guider",
      "92:104": "Denoising Latents",
      "92:105": "Tiled VAE Decoding",
      "92:106": "Random Seed Noise",
      "92:108": "Loading Qwen CLIP",
      "92:109": "CLIP Text Encode",
      "92:110": "Loading VAE",
      "92:111": "Subject Pixel Scaling",
      "92:85": "Background Pixel Scaling",
      "92:112:116": "VAE Encoding Subject",
      "92:84:119": "VAE Encoding Background",
      "92:126": "Loading Flux.2 Klein 4B GGUF",
      "94": "Saving Output Image",
    };
    return map[nodeId] || `Processing Node ${nodeId}`;
  }

  cancel() {
    this.isCancelled = true;
    if (this.activeItemId) {
      this.callbacks.onItemUpdate?.(this.activeItemId, {
        status: "idle",
        progress: 0,
        currentNodeName: "Cancelled",
      });
    }
    if (this.wsClient) {
      this.wsClient.disconnect();
    }
    ComfyUIService.freeMemory(this.config.serverUrl, false).catch(() => {});
  }

  /**
   * Run the batch transformation sequentially through the ComfyUI queue
   */
  async runBatch(items, background) {
    this.isCancelled = false;
    this.initWebSocket();

    if (!background || !background.file) {
      throw new Error("Target background surface is required to start transformation.");
    }

    this.callbacks.onLog?.("Optimizing and uploading target background image...");
    const optimizedBgFile = await optimizeImageForGeneration(background.file, 1200);
    const bgUploadRes = await ComfyUIService.uploadImage(
      optimizedBgFile,
      this.config.serverUrl,
      true
    );
    const bgFilename = bgUploadRes.name;
    this.callbacks.onLog?.(`✓ Background uploaded: ${bgFilename}`);

    let completedCount = 0;
    const totalCount = items.length;

    for (const item of items) {
      if (this.isCancelled) {
        this.callbacks.onLog?.("Batch execution cancelled by user.");
        break;
      }

      if (item.status === "completed") {
        completedCount++;
        this.callbacks.onOverallProgress?.(completedCount, totalCount);
        continue;
      }

      const startTime = performance.now();
      this.activeItemId = item.id;

      try {
        // Step 1: Optimize & Upload Subject
        this.callbacks.onItemUpdate?.(item.id, {
          status: "uploading",
          progress: 5,
          currentNodeName: "Preparing & uploading image...",
          errorMessage: undefined,
        });
        this.callbacks.onLog?.(`Preparing dish: "${item.name}"...`);

        let sourceFile = item.file;
        if (!sourceFile && (item.originalUrl || item.previewUrl || item.image_url)) {
          const rawUrl = item.originalUrl || item.image_url || item.previewUrl;
          const targetUrl = rawUrl.startsWith("http")
            ? `/api/proxy-image?url=${encodeURIComponent(rawUrl)}`
            : rawUrl;
          const imgResp = await fetch(targetUrl);
          const blob = await imgResp.blob();
          sourceFile = new File([blob], `${item.name.replace(/[/\\?%*:|"<>]/g, "_")}.jpg`, {
            type: blob.type || "image/jpeg",
          });
        }

        if (!sourceFile) {
          throw new Error("No image file or URL available for processing");
        }

        const optimizedSubjectFile = await optimizeImageForGeneration(sourceFile, 1200);
        const subjectUploadRes = await ComfyUIService.uploadImage(
          optimizedSubjectFile,
          this.config.serverUrl,
          true
        );
        const subjectFilename = subjectUploadRes.name;

        // Step 2: Build Workflow Graph Prompt
        const promptText =
          item.customPrompt?.trim() ||
          this.config.promptTemplate.replace("{subject}", item.name.replace(/\.[^/.]+$/, ""));

        const workflowPrompt = buildComfyWorkflowPrompt({
          subjectImageFilename: subjectFilename,
          backgroundImageFilename: bgFilename,
          promptText,
          config: this.config,
        });

        // Step 3: Queue Prompt
        this.callbacks.onItemUpdate?.(item.id, {
          status: "queued",
          progress: 10,
          currentNodeName: "Queued in ComfyUI...",
        });

        const promptRes = await ComfyUIService.queuePrompt(
          workflowPrompt,
          this.clientId,
          this.config.serverUrl
        );

        const promptId = promptRes.prompt_id;
        this.activePromptId = promptId;
        this.callbacks.onItemUpdate?.(item.id, {
          comfyPromptId: promptId,
          status: "processing",
          progress: 15,
        });
        this.callbacks.onLog?.(`Queued Prompt ID: ${promptId}`);

        // Step 4: Await completion via WebSocket promise + fallback poller
        const outputImage = await new Promise((resolve, reject) => {
          let checkHistoryInterval = null;

          const wrappedResolve = (img) => {
            if (checkHistoryInterval) clearInterval(checkHistoryInterval);
            resolve(img);
          };

          const wrappedReject = (err) => {
            if (checkHistoryInterval) clearInterval(checkHistoryInterval);
            reject(err);
          };

          checkHistoryInterval = setInterval(async () => {
            if (this.isCancelled) {
              clearInterval(checkHistoryInterval);
              reject(new Error("Cancelled"));
              return;
            }
            try {
              const history = await ComfyUIService.getHistory(promptId, this.config.serverUrl);
              if (history && history[promptId]) {
                const historyData = history[promptId];
                const outputs = historyData.outputs || {};
                const imageList =
                  outputs["94"]?.images ||
                  Object.values(outputs).find((nodeOut) => nodeOut?.images?.length)?.images;

                if (imageList && imageList.length > 0) {
                  clearInterval(checkHistoryInterval);
                  wrappedResolve(imageList[0]);
                }
              }
            } catch {
              // Ignore polling errors
            }
          }, 2500);

          this.promptResolveMap.set(promptId, {
            resolve: wrappedResolve,
            reject: wrappedReject,
            interval: checkHistoryInterval,
          });
        });

        const endTime = performance.now();
        const durationSec = (endTime - startTime) / 1000;

        const outputUrl = ComfyUIService.getImageUrl(
          outputImage.filename,
          outputImage.subfolder,
          outputImage.type,
          this.config.serverUrl,
          this.config.useProxy
        );

        let finalOutputUrl = outputUrl;
        let s3Url = null;
        let savedImageDoc = null;

        // Step 5: Upload to AWS S3 & Save to Image Model (with approved: false, premium: false)
        try {
          this.callbacks.onLog?.(`Uploading processed "${item.name}" to AWS S3 & saving to Image model...`);
          const s3Res = await axios.post("/api/processor/complete", {
            dishData: {
              title: item.name,
              name: item.name,
              description: item.description || promptText,
              category: item.category || "Main Course",
              sub_category: item.sub_category || item.category,
              food_type: item.food_type || item.dietaryType || "unknown",
              cuisine: item.cuisine || item.category,
              tags: item.tags || [],
              productId: item.productId,
            },
            outputFilename: outputImage.filename,
            serverUrl: this.config.serverUrl,
            subfolder: outputImage.subfolder,
            type: outputImage.type,
            executionTimeSec: durationSec,
            customPrompt: promptText,
          });

          if (s3Res.data?.s3Url) {
            s3Url = s3Res.data.s3Url;
            finalOutputUrl = s3Url;
            savedImageDoc = s3Res.data.image;
            this.callbacks.onLog?.(`✓ AWS S3 Uploaded & Image saved to DB (approved: false, premium: false)`);
          }
        } catch (s3Err) {
          console.error("Failed to upload/save to DB:", s3Err);
          this.callbacks.onLog?.(`⚠ S3/DB Upload warning: ${s3Err.response?.data?.error || s3Err.message}`);
        }

        this.callbacks.onItemUpdate?.(item.id, {
          status: "completed",
          progress: 100,
          currentNodeName: "Completed",
          outputImageUrl: finalOutputUrl,
          s3Url: s3Url,
          dbImage: savedImageDoc,
          outputFilename: outputImage.filename,
          executionTimeSec: durationSec,
        });

        completedCount++;
        this.callbacks.onOverallProgress?.(completedCount, totalCount);
        this.callbacks.onLog?.(`✓ Done "${item.name}" in ${durationSec.toFixed(1)}s`);
      } catch (err) {
        if (!this.isCancelled) {
          const formattedError =
            typeof err === "string"
              ? err
              : err?.message || JSON.stringify(err) || "Failed to render image";

          this.callbacks.onItemUpdate?.(item.id, {
            status: "error",
            progress: 0,
            currentNodeName: "Failed",
            errorMessage: formattedError,
          });
          this.callbacks.onLog?.(`✕ Error on "${item.name}": ${formattedError}`);
        }
      } finally {
        if (this.activePromptId) {
          this.promptResolveMap.delete(this.activePromptId);
        }
        this.activePromptId = null;
        this.activeItemId = null;
      }
    }

    // Free memory after entire batch completes
    ComfyUIService.freeMemory(this.config.serverUrl, false).catch(() => {});

    if (this.wsClient) {
      this.wsClient.disconnect();
    }
  }
}
