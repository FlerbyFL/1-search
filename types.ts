export type Category = 'laptop' | 'smartphone' | 'gpu' | 'cpu' | 'headphones' | 'smartwatch' | 'camera' | 'tablet' | 'tv';

export interface PricePoint {
  date: string;
  price: number;
  shopName: string;
}

export interface Spec {
  label: string;
  value: string | number | boolean;
  unit?: string;
  important?: boolean;
}

export interface Review {
  id: string;
  author: string;
  avatar?: string;
  rating: number; // 1-5
  date: string;
  title: string;
  content: string;
  verified: boolean;
  helpfulCount: number;
  source: 'Ozon' | 'Wildberries' | 'Yandex Market' | 'DNS' | 'M.Video' | 'Citilink';
}

export interface StoreOffer {
  id: string;
  name: string;
  price: number;
  oldPrice?: number;
  delivery: string;
  rating: number;
  logo: string; // URL or name for icon
  url: string;
}

export interface Product {
  id: string;
  name: string;
  category: Category;
  image: string; // Main image
  images: string[]; // Gallery
  price: number;
  oldPrice?: number;
  rating: number;
  reviewCount: number;
  reviews: Review[];
  specs: Record<string, Spec>;
  priceHistory: PricePoint[];
  tags: string[];
  description: string;
  offers: StoreOffer[];
  brand?: string;
  inStock?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  cart: string[]; // Product IDs
  wishlist: string[]; // Product IDs
  history: string[]; // Product IDs
  bonuses: number;
  status: 'Silver' | 'Gold' | 'Platinum';
}

export interface Scenario {
  id: string;
  label: string;
  icon: string;
  description: string;
  promptModifier: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  relatedProductIds?: string[];
}
