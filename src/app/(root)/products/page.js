import React from "react";
import { ProductTable } from "@/components/products/product-table";

export const metadata = {
  title: "Scraped Products - FoodSnap Studio",
  description: "View and manage scraped restaurant products and menu items",
};

export default function ProductsPage() {
  return (
    <div className="space-y-4">
      <ProductTable />
    </div>
  );
}
