import axios from "axios";

export async function getJobs({ status = "all", page = 1, limit = 25 } = {}) {
  const params = new URLSearchParams();
  if (status) params.append("status", status);
  if (page) params.append("page", page.toString());
  if (limit) params.append("limit", limit.toString());

  const res = await axios.get(`/api/jobs?${params.toString()}`);
  return res.data;
}

export async function getJobDetails(jobId) {
  const res = await axios.get(`/api/jobs/${jobId}`);
  return res.data;
}

export async function queueJobs({ items, item, config, options } = {}) {
  const res = await axios.post("/api/jobs", { items, item, config, options });
  return res.data;
}

export async function retryJob(jobId) {
  const res = await axios.post(`/api/jobs/${jobId}/retry`);
  return res.data;
}

export async function deleteJob(jobId) {
  const res = await axios.delete(`/api/jobs/${jobId}`);
  return res.data;
}

export async function deleteSelectedJobs(jobIds) {
  const res = await axios.post("/api/jobs/action", {
    action: "delete_selected",
    jobIds,
  });
  return res.data;
}

export async function purgeDuplicateJobs() {
  const res = await axios.post("/api/jobs/action", {
    action: "delete_duplicates",
  });
  return res.data;
}

export async function performQueueAction(payload) {
  const body = typeof payload === "string" ? { action: payload } : payload;
  const res = await axios.post("/api/jobs/action", body);
  return res.data;
}
