import axios from "axios";

export class ComfyUIService {
  /**
   * Check ComfyUI server health and GPU hardware stats
   */
  static async getSystemStats(serverUrl) {
    const response = await axios.get("/api/comfyui/system_stats", {
      params: { serverUrl },
    });
    return response.data;
  }

  /**
   * Upload an input image to ComfyUI
   */
  static async uploadImage(file, serverUrl, overwrite = true) {
    const formData = new FormData();
    formData.append("image", file, file.name);
    formData.append("overwrite", overwrite ? "true" : "false");
    formData.append("type", "input");

    const response = await axios.post("/api/comfyui/upload", formData, {
      params: { serverUrl },
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  }

  /**
   * Queue a workflow prompt in ComfyUI
   */
  static async queuePrompt(prompt, clientId, serverUrl) {
    const response = await axios.post(
      "/api/comfyui/prompt",
      {
        prompt,
        client_id: clientId,
      },
      {
        params: { serverUrl },
      }
    );
    return response.data;
  }

  /**
   * Retrieve execution history for a prompt ID
   */
  static async getHistory(promptId, serverUrl) {
    const response = await axios.get(
      `/api/comfyui/history/${encodeURIComponent(promptId)}`,
      {
        params: { serverUrl },
      }
    );
    return response.data;
  }

  /**
   * Construct the URL to view/fetch a generated output image
   */
  static getImageUrl(
    filename,
    subfolder = "",
    type = "output",
    serverUrl = "http://127.0.0.1:8188",
    useProxy = true
  ) {
    if (useProxy) {
      const params = new URLSearchParams({
        filename,
        subfolder,
        type,
        serverUrl,
      });
      return `/api/comfyui/view?${params.toString()}`;
    }
    const cleanBase = serverUrl.replace(/\/$/, "");
    return `${cleanBase}/view?filename=${encodeURIComponent(
      filename
    )}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(type)}`;
  }

  /**
   * Start ComfyUI process with low-RAM optimizations
   */
  static async startServer() {
    const response = await axios.post("/api/comfyui/control", { action: "start" });
    return response.data;
  }

  /**
   * Stop running ComfyUI process
   */
  static async stopServer() {
    const response = await axios.post("/api/comfyui/control", { action: "stop" });
    return response.data;
  }

  /**
   * Free ComfyUI memory / VRAM cache and trigger garbage collection
   */
  static async freeMemory(serverUrl, unloadModels = false) {
    try {
      const response = await axios.post(
        "/api/comfyui/free",
        {
          unload_models: unloadModels,
          free_memory: true,
        },
        {
          params: { serverUrl },
        }
      );
      return response.data;
    } catch {
      // Non-blocking fallback
      return null;
    }
  }
}
