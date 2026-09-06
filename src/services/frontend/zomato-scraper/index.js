import axios from "axios";

export async function scrapeAndImportZomatoMenu(url) {
  if (!url || typeof url !== "string" || !url.trim()) {
    throw new Error("Please provide a valid Zomato restaurant URL.");
  }

  const response = await axios.post("/api/menu/zomato/import", {
    url: url.trim(),
  });

  return response.data;
}

const zomatoScraperService = {
  scrapeAndImportZomatoMenu,
};

export default zomatoScraperService;
