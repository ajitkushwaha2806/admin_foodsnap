import axios from "axios";

export async function getDashboardStats() {
  const response = await axios.get("/api/dashboard/stats");
  return response.data;
}

const dashboardService = {
  getDashboardStats,
};

export default dashboardService;
