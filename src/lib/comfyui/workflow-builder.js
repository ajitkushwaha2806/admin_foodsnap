/**
 * Builds the ComfyUI API Prompt payload for the Flux.2 Klein Background Replacement Workflow.
 * 
 * Nodes:
 * - 76: Load Subject Image
 * - 81: Load Background Image
 * - 125: Scale Subject Image (ImageScaleToTotalPixels)
 * - 124: Scale Background Image (ImageScaleToTotalPixels)
 * - 92:* Subgraph nodes (CLIP, VAE, ReferenceLatent, SamplerCustomAdvanced, UnetLoaderGGUF)
 * - 94: Save Image (SaveImage)
 */
export function buildComfyWorkflowPrompt({
  subjectImageFilename,
  backgroundImageFilename,
  promptText,
  config = {},
  seed,
}) {
  const finalSeed =
    typeof seed === "number" ? seed : Math.floor(Math.random() * 1000000000000000);

  return {
    "76": {
      inputs: {
        image: subjectImageFilename,
      },
      class_type: "LoadImage",
      _meta: {
        title: "Load Subject Image",
      },
    },
    "81": {
      inputs: {
        image: backgroundImageFilename,
      },
      class_type: "LoadImage",
      _meta: {
        title: "Load Background Image",
      },
    },
    "94": {
      inputs: {
        filename_prefix: config.filenamePrefix || "Flux2-Klein",
        images: ["92:105", 0],
      },
      class_type: "SaveImage",
      _meta: {
        title: "Save Image",
      },
    },
    "124": {
      inputs: {
        upscale_method: "bicubic",
        megapixels: config.backgroundMegapixels || 0.3,
        resolution_steps: 1,
        image: ["81", 0],
      },
      class_type: "ImageScaleToTotalPixels",
      _meta: {
        title: "Scale Image to Total Pixels",
      },
    },
    "125": {
      inputs: {
        upscale_method: "bicubic",
        megapixels: config.subjectMegapixels || 0.45,
        resolution_steps: 1,
        image: ["76", 0],
      },
      class_type: "ImageScaleToTotalPixels",
      _meta: {
        title: "Scale Image to Total Pixels",
      },
    },
    "92:101": {
      inputs: {
        sampler_name: "euler",
      },
      class_type: "KSamplerSelect",
      _meta: {
        title: "KSamplerSelect",
      },
    },
    "92:102": {
      inputs: {
        steps: config.steps || 4,
        width: ["92:114", 0],
        height: ["92:114", 1],
      },
      class_type: "Flux2Scheduler",
      _meta: {
        title: "Flux2Scheduler",
      },
    },
    "92:103": {
      inputs: {
        cfg: 1,
        model: ["92:126", 0],
        positive: ["92:84:120", 0],
        negative: ["92:84:118", 0],
      },
      class_type: "CFGGuider",
      _meta: {
        title: "CFG Guider",
      },
    },
    "92:104": {
      inputs: {
        noise: ["92:106", 0],
        guider: ["92:103", 0],
        sampler: ["92:101", 0],
        sigmas: ["92:102", 0],
        latent_image: ["92:113", 0],
      },
      class_type: "SamplerCustomAdvanced",
      _meta: {
        title: "SamplerCustomAdvanced",
      },
    },
    "92:105": {
      inputs: {
        samples: ["92:104", 0],
        vae: ["92:110", 0],
        ...(config.useTiledVAE === true
          ? {
              tile_size: config.tileSize || 512,
              overlap: 64,
              temporal_size: 64,
              temporal_overlap: 8,
            }
          : {}),
      },
      class_type: config.useTiledVAE === true ? "VAEDecodeTiled" : "VAEDecode",
      _meta: {
        title: config.useTiledVAE === true ? "VAE Decode (Tiled)" : "VAE Decode",
      },
    },
    "92:106": {
      inputs: {
        noise_seed: finalSeed,
      },
      class_type: "RandomNoise",
      _meta: {
        title: "RandomNoise",
      },
    },
    "92:108": {
      inputs: {
        clip_name: config.clipName || "qwen_3_4b.safetensors",
        type: "flux2",
        device: "default",
      },
      class_type: "CLIPLoader",
      _meta: {
        title: "Load CLIP",
      },
    },
    "92:109": {
      inputs: {
        text: promptText,
        clip: ["92:108", 0],
      },
      class_type: "CLIPTextEncode",
      _meta: {
        title: "CLIP Text Encode (Positive Prompt)",
      },
    },
    "92:110": {
      inputs: {
        vae_name: config.vaeName || "full_encoder_small_decoder.safetensors",
      },
      class_type: "VAELoader",
      _meta: {
        title: "Load VAE",
      },
    },
    "92:111": {
      inputs: {
        upscale_method: "nearest-exact",
        megapixels: config.subjectMegapixels || 0.45,
        resolution_steps: 1,
        image: ["125", 0],
      },
      class_type: "ImageScaleToTotalPixels",
      _meta: {
        title: "Scale Image to Total Pixels",
      },
    },
    "92:85": {
      inputs: {
        upscale_method: "nearest-exact",
        megapixels: config.backgroundMegapixels || 0.3,
        resolution_steps: 1,
        image: ["124", 0],
      },
      class_type: "ImageScaleToTotalPixels",
      _meta: {
        title: "Scale Image to Total Pixels",
      },
    },
    "92:112:115": {
      inputs: {
        conditioning: ["92:86", 0],
        latent: ["92:112:116", 0],
      },
      class_type: "ReferenceLatent",
      _meta: {
        title: "Set Reference Latent",
      },
    },
    "92:112:116": {
      inputs: {
        pixels: ["92:111", 0],
        vae: ["92:110", 0],
      },
      class_type: "VAEEncode",
      _meta: {
        title: "VAE Encode",
      },
    },
    "92:112:117": {
      inputs: {
        conditioning: ["92:109", 0],
        latent: ["92:112:116", 0],
      },
      class_type: "ReferenceLatent",
      _meta: {
        title: "Set Reference Latent",
      },
    },
    "92:84:118": {
      inputs: {
        conditioning: ["92:112:115", 0],
        latent: ["92:84:119", 0],
      },
      class_type: "ReferenceLatent",
      _meta: {
        title: "Set Reference Latent",
      },
    },
    "92:84:119": {
      inputs: {
        pixels: ["92:85", 0],
        vae: ["92:110", 0],
      },
      class_type: "VAEEncode",
      _meta: {
        title: "VAE Encode",
      },
    },
    "92:84:120": {
      inputs: {
        conditioning: ["92:112:117", 0],
        latent: ["92:84:119", 0],
      },
      class_type: "ReferenceLatent",
      _meta: {
        title: "Set Reference Latent",
      },
    },
    "92:86": {
      inputs: {
        conditioning: ["92:109", 0],
      },
      class_type: "ConditioningZeroOut",
      _meta: {
        title: "Conditioning Zero Out",
      },
    },
    "92:113": {
      inputs: {
        width: ["92:114", 0],
        height: ["92:114", 1],
        batch_size: 1,
      },
      class_type: "EmptyFlux2LatentImage",
      _meta: {
        title: "Empty Flux 2 Latent",
      },
    },
    "92:114": {
      inputs: {
        image: ["92:111", 0],
      },
      class_type: "GetImageSize",
      _meta: {
        title: "Get Image Size",
      },
    },
    "92:126": {
      inputs: {
        unet_name: config.unetName || "flux-2-klein-4b-Q3_K_M.gguf",
      },
      class_type: "UnetLoaderGGUF",
      _meta: {
        title: "Unet Loader (GGUF)",
      },
    },
  };
}

export const DEFAULT_WORKFLOW_CONFIG = {
  serverUrl: "http://127.0.0.1:8188",
  promptTemplate:
    "Replace the background and surface of reference_image1 with the wooden table and mat background from reference_image2. Keep the main dish, bowls, and garnishes sharp, delicious, and intact with studio food lighting.",
  subjectMegapixels: 0.45,
  backgroundMegapixels: 0.30,
  clipName: "qwen_3_4b.safetensors",
  vaeName: "full_encoder_small_decoder.safetensors",
  unetName: "flux-2-klein-4b-Q3_K_M.gguf",
  filenamePrefix: "Flux2-Klein",
  steps: 4,
  useProxy: true,
  useTiledVAE: false,
  tileSize: 512,
};

