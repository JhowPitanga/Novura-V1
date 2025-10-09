
import { LucideIcon } from "lucide-react";

export interface ProductVariation {
  id: string;
  name: string;
  color?: string;
  size?: string;
  voltage?: string;
  customType?: string;
  customValue?: string;
  sku: string;
  ean: string;
  costPrice: string;
  images: File[];
  height?: string;
  width?: string;
  length?: string;
  weight?: string;
  ncm?: string;
  cest?: string;
  barcode?: string;
  unit?: string;
  origin?: string;
  stock?: string;
  storage?: string;
}

export interface VariationType {
  id: string;
  name: string;
  icon: LucideIcon;
  options: string[];
}

export interface ProductFormData {
  type: string;
  name: string;
  sku: string;
  category: string;
  brand: string;
  description: string;
  costPrice: string;
  sellPrice: string;
  stock: string;
  warehouse: string;
  height: string;
  width: string;
  length: string;
  weight: string;
  unitType: string;
  barcode: string;
  ncm: string;
  cest: string;
  origin: string;
}

export interface ProductStep {
  id: number;
  title: string;
  description: string;
}

export interface KitItem {
  id: string;
  name: string;
  sku: string;
  type: "single" | "variation";
  quantity: number;
  image?: string;
}

export type ProductType = "single" | "variation" | "kit";
export type VariationStep = "types" | "options" | "configuration";
export type KitStep = "info" | "products";
