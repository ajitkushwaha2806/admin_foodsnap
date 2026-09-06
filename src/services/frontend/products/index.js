import axios from "axios";

export async function getProducts(params = {}) {
  const response = await axios.get("/api/products", { params });
  return response.data;
}

export async function deleteProduct(productId) {
  const response = await axios.delete(`/api/products?id=${productId}`);
  return response.data;
}

const productService = {
  getProducts,
  deleteProduct,
};

export default productService;
