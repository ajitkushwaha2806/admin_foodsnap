import axios from "axios";

export async function getImages(params = {}) {
  const response = await axios.get("/api/images/search", { params });
  return response.data;
}

export async function updateImage(imageId, updateData) {
  const response = await axios.patch(`/api/images/${imageId}`, updateData);
  return response.data;
}

export async function deleteImage(imageId) {
  const response = await axios.delete(`/api/images/${imageId}`);
  return response.data;
}

export async function uploadImage(payload) {
  const response = await axios.post("/api/images", payload);
  return response.data;
}

export async function bulkUploadWithAi(file, onUploadProgress) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await axios.post("/api/images/bulk-upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress,
  });
  return response.data;
}

const imageService = {
  getImages,
  updateImage,
  deleteImage,
  uploadImage,
  bulkUploadWithAi,
};

export default imageService;
