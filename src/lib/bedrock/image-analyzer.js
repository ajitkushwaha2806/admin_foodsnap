import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_BEDROCK_REGION || "us-east-1",
  credentials: {
    accessKeyId:
      process.env.AWS_BEDROCK_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey:
      process.env.AWS_BEDROCK_SECRET_ACCESS_KEY ||
      process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Safely parse JSON returned from AI model, handling markdown fences and truncated output.
 */
function safeParseJson(rawText) {
  if (!rawText) return null;

  let cleaned = rawText.trim();
  // Remove markdown code blocks if present
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Attempt to extract first matching JSON object
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // Ignore
      }
    }
  }
  return null;
}

/**
 * Analyzes a food image buffer using Amazon Bedrock Nova Lite and extracts full culinary metadata.
 * @param {Buffer|Uint8Array} imageBuffer - Raw image buffer
 * @param {string} mimeType - MIME type (e.g., 'image/png', 'image/jpeg', 'image/webp')
 * @returns {Promise<{
 *   title: string,
 *   description: string,
 *   tags: string[],
 *   cuisine: string,
 *   category: string,
 *   sub_category: string,
 *   food_type: "veg"|"non-veg"
 * }>}
 */
export async function analyzeFoodImageWithNova(imageBuffer, mimeType = "image/png") {
  let cleanFormat = (mimeType || "image/png").toLowerCase().split(";")[0].trim().replace("image/", "");
  if (cleanFormat === "jpg") cleanFormat = "jpeg";
  const allowedFormats = ["gif", "jpeg", "png", "webp"];
  if (!allowedFormats.includes(cleanFormat)) {
    cleanFormat = "png";
  }

  const modelId = process.env.AWS_BEDROCK_MODEL || "amazon.nova-lite-v1:0";

  const systemPrompt = `You are a professional culinary photographer and restaurant food categorization AI.
Analyze the provided food dish photograph with high precision.
Identify the exact dish, its dietary classification (veg or non-veg), category, sub-category, cuisine style, an appetizing 1-2 sentence description, and keywords/tags.

Return ONLY a valid, minified JSON object matching this schema:
{
  "title": "Dish Name",
  "description": "Appetizing 1-2 sentence description highlighting flavors and ingredients.",
  "category": "Broad category like Steam Momos, Tandoori Chaap, Main Course, Starters, etc.",
  "sub_category": "Specific category or group",
  "cuisine": "Cuisine type like North Indian, Indo-Chinese, Tibetan, Continental, etc.",
  "food_type": "veg" or "non-veg",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"]
}

Rules:
- food_type MUST strictly be either "veg" or "non-veg".
- tags must be 5 to 8 relevant lowercase single-word or hyphenated keywords.
- Do NOT output markdown codeblocks, explanations, or any text outside the JSON object.`;

  const userPrompt = `Analyze this food photo. Output the JSON metadata for title, description, category, sub_category, cuisine, food_type, and tags.`;

  const command = new ConverseCommand({
    modelId,
    system: [
      {
        text: systemPrompt,
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            image: {
              format: cleanFormat,
              source: {
                bytes: new Uint8Array(imageBuffer),
              },
            },
          },
          {
            text: userPrompt,
          },
        ],
      },
    ],
    inferenceConfig: {
      maxTokens: 1000,
      temperature: 0.2,
    },
  });

  const response = await bedrockClient.send(command);
  const contentBlocks = response?.output?.message?.content || [];
  const rawText = contentBlocks.map((b) => b.text || "").join("\n");

  const parsed = safeParseJson(rawText);

  if (!parsed || !parsed.title) {
    throw new Error(`Failed to extract valid dish details from image. Response: ${rawText.slice(0, 150)}`);
  }

  const title = (parsed.title || "AI Food Dish").trim();
  const category = (parsed.category || "Main Course").trim();
  const sub_category = (parsed.sub_category || category).trim();
  const cuisine = (parsed.cuisine || category).trim();
  const rawFoodType = (parsed.food_type || "veg").trim().toLowerCase();
  const food_type = rawFoodType === "non-veg" || rawFoodType === "nonveg" ? "non-veg" : "veg";
  const description = (parsed.description || `${title} - freshly prepared culinary dish.`).trim();

  let tags = [];
  if (Array.isArray(parsed.tags) && parsed.tags.length > 0) {
    tags = parsed.tags
      .map((t) => String(t).toLowerCase().trim().replace(/[^a-z0-9-]/g, ""))
      .filter((t) => t.length > 1);
  } else {
    tags = [title, category, sub_category, food_type, cuisine]
      .flatMap((t) => t.toLowerCase().split(/[\s,]+/))
      .filter((t) => t.length > 1);
  }
  tags = Array.from(new Set(tags)).slice(0, 10);

  return {
    title,
    description,
    category,
    sub_category,
    cuisine,
    food_type,
    tags,
  };
}
