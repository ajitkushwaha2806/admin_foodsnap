import axios from "axios";

export async function getSavedBackgrounds() {
  const res = await axios.get("/api/backgrounds");
  return res.data?.data || [];
}

export async function uploadSavedBackground(file, name) {
  const formData = new FormData();
  formData.append("image", file);
  if (name) formData.append("name", name);

  const res = await axios.post("/api/backgrounds", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data?.data;
}

export async function deleteSavedBackground(id) {
  const res = await axios.delete(`/api/backgrounds/${id}`);
  return res.data;
}
