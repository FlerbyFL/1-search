import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MOCK_PRODUCTS } from './constants';
import { Product, User, Spec, Review, Category } from './types';
import ProductCard from './components/ProductCard';
import AIAssistant from './components/AIAssistant';
import ComparisonView from './components/ComparisonView';
import PriceHistoryChart from './components/PriceHistoryChart';
import UserDrawer from './components/UserDrawer';
import AuthScreen from './components/AuthScreen';
import { searchProductsWithAI } from './services/geminiService';
import { Search, Bot, BarChart2, ArrowRight, ShieldCheck, Sparkles, ShoppingBag, Heart, Star, CheckCircle, TrendingDown, Truck, ArrowLeft, Filter, ArrowUpRight, Store, Loader2, LogOut, ChevronDown } from 'lucide-react';

const CATEGORY_LABELS: Record<Category, string> = {
  smartphone: 'Смартфоны',
  laptop: 'Ноутбуки',
  tv: 'Телевизоры',
  tablet: 'Планшеты',
  headphones: 'Наушники',
  smartwatch: 'Смарт-часы',
  camera: 'Камеры',
  gpu: 'Видеокарты',
  cpu: 'Процессоры',
};

const IMAGE_FALLBACK = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="#F1F5F9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#64748B" font-family="Arial" font-size="40">Нет фото</text></svg>'
)}`;

const PAGE_SIZE = 48;

const normalizeValue = (value: string) => value.trim().toLowerCase();

const getProductBrand = (product: Product): string => {
  if (product.brand && product.brand.trim()) return product.brand.trim();
  const [firstWord] = product.name.trim().split(/\s+/);
  return firstWord || 'Неизвестно';
};

const hasFastDelivery = (product: Product): boolean =>
  product.offers.some((offer) => {
    const delivery = offer.delivery.toLowerCase();
    return (
      delivery.includes('сегодня') ||
      delivery.includes('завтра') ||
      delivery.includes('today') ||
      delivery.includes('tomorrow')
    );
  });

const hasDiscount = (product: Product): boolean => {
  if (typeof product.oldPrice === 'number' && product.oldPrice > product.price) return true;
  return product.offers.some((offer) => typeof offer.oldPrice === 'number' && offer.oldPrice > offer.price);
};

const getSpecsSearchBlob = (product: Product): string =>
  Object.values(product.specs)
    .map((spec) => `${spec.label} ${String(spec.value)} ${spec.unit || ''}`)
    .join(' ')
    .toLowerCase();

const normalizeProductKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const stripVariantColor = (value: string): string => {
  const colorPattern =
    /\b(черный|чёрный|белый|синий|голубой|зеленый|зелёный|красный|серый|серебристый|золотой|розовый|фиолетовый|желтый|жёлтый|оранжевый|коричневый|бежевый|мятный|лайм|графит|темно[-\s]?синий|темно[-\s]?серый|space\s?gray|space\s?black|midnight|starlight|graphite|silver|gold|black|white|blue|green|red|purple|pink|orange)\b$/i;
  return value.replace(colorPattern, '').replace(/\s+/g, ' ').trim();
};

const extractVariantBaseName = (name: string): string => {
  let base = name.trim();
  const commaIndex = base.indexOf(',');
  if (commaIndex !== -1) base = base.slice(0, commaIndex);

  base = base
    .replace(/\b\d+\s*\/\s*\d+\s*(gb|гб|tb|тб)\b/gi, '')
    .replace(/\b\d+\s*(gb|гб|tb|тб|mb|мб)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  base = stripVariantColor(base);
  return base;
};

const normalizeVariantKey = (name: string): string => normalizeProductKey(extractVariantBaseName(name));

const getProductUrlKey = (product: Product): string => product.name?.trim() || product.id;

type VariantAttributes = {
  colorKey?: string;
  colorLabel?: string;
  colorHex?: string;
  storage?: string;
  storageGb?: number;
  ram?: string;
  ramGb?: number;
};

type MemoryValue = {
  label: string;
  gbValue: number;
};

const COLOR_DEFS = [
  { key: 'black', label: 'Черный', hex: '#111827', aliases: ['черный', 'чёрный', 'black', 'space black', 'midnight', 'graphite'] },
  { key: 'white', label: 'Белый', hex: '#f8fafc', aliases: ['белый', 'white', 'starlight'] },
  { key: 'blue', label: 'Синий', hex: '#2563eb', aliases: ['синий', 'голубой', 'blue', 'sky', 'navy'] },
  { key: 'green', label: 'Зеленый', hex: '#16a34a', aliases: ['зеленый', 'зелёный', 'green', 'mint', 'мятный', 'лайм', 'lime'] },
  { key: 'red', label: 'Красный', hex: '#dc2626', aliases: ['красный', 'red'] },
  { key: 'purple', label: 'Фиолетовый', hex: '#7c3aed', aliases: ['фиолетовый', 'purple', 'lavender', 'лаванда'] },
  { key: 'pink', label: 'Розовый', hex: '#ec4899', aliases: ['розовый', 'pink'] },
  { key: 'orange', label: 'Оранжевый', hex: '#f97316', aliases: ['оранжевый', 'orange'] },
  { key: 'yellow', label: 'Желтый', hex: '#facc15', aliases: ['желтый', 'жёлтый', 'yellow'] },
  { key: 'gray', label: 'Серый', hex: '#64748b', aliases: ['серый', 'gray', 'grey', 'серебристый', 'silver'] },
  { key: 'gold', label: 'Золотой', hex: '#d4af37', aliases: ['золотой', 'gold'] },
  { key: 'brown', label: 'Коричневый', hex: '#8b5e34', aliases: ['коричневый', 'brown', 'beige', 'бежевый'] },
];

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractColorKey = (name: string): { key?: string; label?: string; hex?: string } => {
  const lower = name.toLowerCase();
  for (const color of COLOR_DEFS) {
    for (const alias of color.aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i');
      if (pattern.test(lower)) {
        return { key: color.key, label: color.label, hex: color.hex };
      }
    }
  }
  return {};
};

const parseMemoryValue = (value: string, unit: string): MemoryValue => {
  const numeric = Number(value.replace(',', '.'));
  const isTb = unit.toLowerCase().includes('t');
  const labelUnit = isTb ? 'ТБ' : 'ГБ';
  const gbValue = isTb ? numeric * 1024 : numeric;
  return { label: `${numeric} ${labelUnit}`, gbValue };
};

const extractMemoryValues = (name: string): { ram?: MemoryValue; storage?: MemoryValue } => {
  const combinedMatch = name.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*(gb|гб|tb|тб)/i);
  if (combinedMatch) {
    const ram = parseMemoryValue(combinedMatch[1], combinedMatch[3]);
    const storage = parseMemoryValue(combinedMatch[2], combinedMatch[3]);
    return { ram, storage };
  }

  const matches = [...name.matchAll(/(\d+(?:[.,]\d+)?)\s*(gb|гб|tb|тб)/gi)].map((m) =>
    parseMemoryValue(m[1], m[2])
  );
  if (matches.length === 0) return {};

  const sorted = matches.sort((a, b) => a.gbValue - b.gbValue);
  const smallest = sorted[0];
  const largest = sorted[sorted.length - 1];
  const ram = smallest.gbValue <= 64 && sorted.length > 1 ? smallest : undefined;
  const storage = largest;
  return { ram, storage };
};

const extractVariantAttributes = (name: string): VariantAttributes => {
  const color = extractColorKey(name);
  const memory = extractMemoryValues(name);
  return {
    colorKey: color.key,
    colorLabel: color.label,
    colorHex: color.hex,
    storage: memory.storage?.label,
    storageGb: memory.storage?.gbValue,
    ram: memory.ram?.label,
    ramGb: memory.ram?.gbValue,
  };
};

function App() {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Data State
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState('');
  
  // UI State
  const [comparisonList, setComparisonList] = useState<Product[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [aiRecommendedIds, setAiRecommendedIds] = useState<string[]>([]);
  const [detailTab, setDetailTab] = useState<'overview' | 'reviews'>('overview');
  const [selectedProductImage, setSelectedProductImage] = useState('');
  const [variantProducts, setVariantProducts] = useState<Product[]>([]);
  const [isVariantsLoading, setIsVariantsLoading] = useState(false);
  
  // App Mode State
  const [viewMode, setViewMode] = useState<'home' | 'results' | 'product'>('home');
  const [lastListViewMode, setLastListViewMode] = useState<'home' | 'results'>('home');
  const [searchPlaceholder, setSearchPlaceholder] = useState('iPhone 15...');
  const [isUserDrawerOpen, setIsUserDrawerOpen] = useState(false);

  // Filters State
  const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [sortBy, setSortBy] = useState<'none' | 'price_asc' | 'price_desc' | 'rating_desc' | 'rating_asc' | 'name_asc'>('none');
  const [selectedShops, setSelectedShops] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [minRatingInput, setMinRatingInput] = useState('0');
  const [specSearchTerm, setSpecSearchTerm] = useState('');
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [onlyWithDiscount, setOnlyWithDiscount] = useState(false);
  const [minReviewsInput, setMinReviewsInput] = useState('0');
  const [onlyWithReviews, setOnlyWithReviews] = useState(false);
  const [onlyWithImages, setOnlyWithImages] = useState(false);
  const [brandSearchTerm, setBrandSearchTerm] = useState('');
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  const getProductKeyFromHash = () => {
    const hash = window.location.hash || '';
    const match = hash.match(/^#\/?product\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  };

  const setProductHash = (productKey: string | null, replace = false) => {
    const hash = productKey ? `#/product/${encodeURIComponent(productKey)}` : '';
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    if (replace) {
      window.history.replaceState({}, '', url);
    } else {
      window.history.pushState({}, '', url);
    }
  };

  const categoryStats = useMemo(() => {
    const stats: Record<Category, number> = {
      smartphone: 0,
      laptop: 0,
      tv: 0,
      tablet: 0,
      headphones: 0,
      smartwatch: 0,
      camera: 0,
      gpu: 0,
      cpu: 0,
    };

    products.forEach((product) => {
      stats[product.category] = (stats[product.category] || 0) + 1;
    });

    return (Object.entries(stats) as Array<[Category, number]>).filter(([, count]) => count > 0);
  }, [products]);

  const shopStats = useMemo(() => {
    const stats = new Map<string, number>();
    products.forEach((product) => {
      const uniqueShops = new Set(product.offers.map((offer) => offer.name).filter(Boolean));
      uniqueShops.forEach((shop) => {
        stats.set(shop, (stats.get(shop) || 0) + 1);
      });
    });
    return [...stats.entries()].sort((a, b) => b[1] - a[1]);
  }, [products]);

  const brandStats = useMemo(() => {
    const stats = new Map<string, number>();
    products.forEach((product) => {
      const brand = getProductBrand(product);
      stats.set(brand, (stats.get(brand) || 0) + 1);
    });
    return [...stats.entries()].sort((a, b) => b[1] - a[1]);
  }, [products]);

  const filteredBrandStats = useMemo(() => {
    const needle = brandSearchTerm.trim().toLowerCase();
    if (!needle) return brandStats;
    return brandStats.filter(([brand]) => brand.toLowerCase().includes(needle));
  }, [brandStats, brandSearchTerm]);

  const priceBounds = useMemo(() => {
    if (products.length === 0) return null;
    const prices = products.map((product) => product.price);
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [products]);

  const normalizedPriceRange = useMemo(() => {
    const min = minPriceInput.trim() ? Number(minPriceInput) : null;
    const max = maxPriceInput.trim() ? Number(maxPriceInput) : null;

    if (min !== null && max !== null && min > max) {
      return { min: max, max: min, isSwapped: true };
    }

    return { min, max, isSwapped: false };
  }, [minPriceInput, maxPriceInput]);

  const normalizedMinRating = useMemo(() => {
    const rating = Number(minRatingInput);
    if (!Number.isFinite(rating)) return 0;
    return Math.max(0, Math.min(5, rating));
  }, [minRatingInput]);

  const normalizedMinReviews = useMemo(() => {
    const value = Number(minReviewsInput);
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value));
  }, [minReviewsInput]);

  const hasRealImage = (product: Product): boolean => {
    const images = [product.image, ...(product.images || [])].filter(Boolean);
    return images.some((src) => src && src !== IMAGE_FALLBACK);
  };

  const activeFilterCount = useMemo(() => {
    let count = selectedCategories.length;
    if (activeQuickFilter) count += 1;
    if (normalizedPriceRange.min !== null || normalizedPriceRange.max !== null) count += 1;
    if (sortBy !== 'none') count += 1;
    if (selectedShops.length > 0) count += 1;
    if (selectedBrands.length > 0) count += 1;
    if (normalizedMinRating > 0) count += 1;
    if (normalizedMinReviews > 0) count += 1;
    if (specSearchTerm.trim()) count += 1;
    if (onlyInStock) count += 1;
    if (onlyWithDiscount) count += 1;
    if (onlyWithReviews) count += 1;
    if (onlyWithImages) count += 1;
    return count;
  }, [
    selectedCategories.length,
    activeQuickFilter,
    normalizedPriceRange,
    sortBy,
    selectedShops.length,
    selectedBrands.length,
    normalizedMinRating,
    normalizedMinReviews,
    specSearchTerm,
    onlyInStock,
    onlyWithDiscount,
    onlyWithReviews,
    onlyWithImages,
  ]);

  const resetFilters = () => {
    setActiveQuickFilter(null);
    setSelectedCategories([]);
    setSelectedShops([]);
    setSelectedBrands([]);
    setMinPriceInput('');
    setMaxPriceInput('');
    setMinRatingInput('0');
    setMinReviewsInput('0');
    setSpecSearchTerm('');
    setOnlyInStock(false);
    setOnlyWithDiscount(false);
    setOnlyWithReviews(false);
    setOnlyWithImages(false);
    setBrandSearchTerm('');
    setSortBy('none');
  };

  const handlePriceInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    setter(event.target.value.replace(/[^\d]/g, ''));
  };

  const handleSortChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(event.target.value as 'none' | 'price_asc' | 'price_desc' | 'rating_desc' | 'rating_asc' | 'name_asc');
  };

  // Check for existing session
  useEffect(() => {
    const storedUser = localStorage.getItem('nex_current_user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        setIsAuthenticated(true);
      } catch (e) {
        console.error("Failed to parse stored user", e);
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    localStorage.setItem('nex_current_user', JSON.stringify(user));
  }, [user]);

  // Placeholder Animation
  useEffect(() => {
    const placeholders = ['iPhone 15...', 'Игровой ноутбук...', 'Sony наушники...', 'RTX 4090...'];
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % placeholders.length;
      setSearchPlaceholder(placeholders[idx]);
    }, 3000);
    return () => clearInterval(interval);
  }, []);
  // Filtering Logic (Client Side)
  useEffect(() => {
    const hasPriceRangeFilter = normalizedPriceRange.min !== null || normalizedPriceRange.max !== null;
    const hasSpecSearch = specSearchTerm.trim().length > 0;
    const hasAnyFilters =
      selectedCategories.length > 0 ||
      selectedShops.length > 0 ||
      selectedBrands.length > 0 ||
      normalizedMinRating > 0 ||
      normalizedMinReviews > 0 ||
      hasSpecSearch ||
      onlyInStock ||
      onlyWithDiscount ||
      onlyWithReviews ||
      onlyWithImages ||
      Boolean(activeQuickFilter) ||
      hasPriceRangeFilter ||
      sortBy !== 'none';

    if (!searchTerm && !isSearching && !hasAnyFilters) {
      if (viewMode === 'home') setFilteredProducts(MOCK_PRODUCTS);
      else setFilteredProducts(products);
      return;
    }

    let result = products;

    if (searchTerm && !isSearching && viewMode === 'home') {
      result = result.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    if (selectedCategories.length > 0) {
      result = result.filter((p) => selectedCategories.includes(p.category));
    }

    if (selectedShops.length > 0) {
      const normalizedShops = selectedShops.map(normalizeValue);
      result = result.filter((product) =>
        product.offers.some((offer) => normalizedShops.includes(normalizeValue(offer.name)))
      );
    }

    if (selectedBrands.length > 0) {
      const normalizedBrands = selectedBrands.map(normalizeValue);
      result = result.filter((product) => normalizedBrands.includes(normalizeValue(getProductBrand(product))));
    }

    if (hasPriceRangeFilter) {
      result = result.filter((p) => {
        const isAboveMin = normalizedPriceRange.min === null || p.price >= normalizedPriceRange.min;
        const isBelowMax = normalizedPriceRange.max === null || p.price <= normalizedPriceRange.max;
        return isAboveMin && isBelowMax;
      });
    }

    if (normalizedMinRating > 0) {
      result = result.filter((product) => product.rating >= normalizedMinRating);
    }

    if (normalizedMinReviews > 0) {
      result = result.filter((product) => product.reviewCount >= normalizedMinReviews);
    }

    if (hasSpecSearch) {
      const specNeedle = specSearchTerm.trim().toLowerCase();
      result = result.filter((product) => getSpecsSearchBlob(product).includes(specNeedle));
    }

    if (onlyInStock) {
      result = result.filter((product) => product.inStock !== false);
    }

    if (onlyWithDiscount) {
      result = result.filter((product) => hasDiscount(product));
    }

    if (onlyWithReviews) {
      result = result.filter((product) => product.reviewCount > 0);
    }

    if (onlyWithImages) {
      result = result.filter((product) => hasRealImage(product));
    }

    if (activeQuickFilter) {
      if (activeQuickFilter === 'price_low') result = [...result].sort((a, b) => a.price - b.price);
      if (activeQuickFilter === 'price_high') result = [...result].sort((a, b) => b.price - a.price);
      if (activeQuickFilter === 'rating') result = [...result].sort((a, b) => b.rating - a.rating);
      if (activeQuickFilter === 'delivery') {
        result = result.filter((product) => hasFastDelivery(product));
      }
      if (activeQuickFilter === 'deals') {
        result = result.filter((product) => hasDiscount(product));
      }
    }

    switch (sortBy) {
      case 'price_asc':
        result = [...result].sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        result = [...result].sort((a, b) => b.price - a.price);
        break;
      case 'rating_desc':
        result = [...result].sort((a, b) => b.rating - a.rating);
        break;
      case 'rating_asc':
        result = [...result].sort((a, b) => a.rating - b.rating);
        break;
      case 'name_asc':
        result = [...result].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        break;
      default:
        break;
    }

    setFilteredProducts(result);
  }, [
    searchTerm,
    products,
    activeQuickFilter,
    selectedCategories,
    selectedShops,
    selectedBrands,
    normalizedPriceRange,
    normalizedMinRating,
    normalizedMinReviews,
    specSearchTerm,
    onlyInStock,
    onlyWithDiscount,
    onlyWithReviews,
    onlyWithImages,
    sortBy,
    isSearching,
    viewMode,
  ]);

  useEffect(() => {
    const syncFromUrl = () => {
      const productKey = getProductKeyFromHash();
      if (!productKey) {
        if (viewMode === 'product') {
          closeProductPage({ skipUrl: true });
        }
        return;
      }

      if (selectedProduct && normalizeProductKey(selectedProduct.name) === normalizeProductKey(productKey)) return;
      void openProductByKey(productKey, { pushUrl: false });
    };

    syncFromUrl();
    window.addEventListener('hashchange', syncFromUrl);
    window.addEventListener('popstate', syncFromUrl);
    return () => {
      window.removeEventListener('hashchange', syncFromUrl);
      window.removeEventListener('popstate', syncFromUrl);
    };
  }, [viewMode, selectedProduct, products, lastListViewMode]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [
    searchTerm,
    selectedCategories,
    selectedShops,
    selectedBrands,
    minPriceInput,
    maxPriceInput,
    minRatingInput,
    minReviewsInput,
    specSearchTerm,
    onlyInStock,
    onlyWithDiscount,
    onlyWithReviews,
    onlyWithImages,
    activeQuickFilter,
    sortBy,
    viewMode,
  ]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount]
  );

  const hasMoreResults = filteredProducts.length > visibleCount;

  const toggleCategoryFilter = (category: Category) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const toggleShopFilter = (shop: string) => {
    setSelectedShops((prev) =>
      prev.includes(shop) ? prev.filter((value) => value !== shop) : [...prev, shop]
    );
  };

  const toggleBrandFilter = (brand: string) => {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((value) => value !== brand) : [...prev, brand]
    );
  };

  const toggleCompare = (product: Product) => {
    setComparisonList(prev => {
      if (prev.find(p => p.id === product.id)) {
        return prev.filter(p => p.id !== product.id);
      }
      if (prev.length >= 4) return prev; // Max 4
      return [...prev, product];
    });
  };

  const openProduct = (product: Product, options?: { pushUrl?: boolean }) => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setLastListViewMode(viewMode === 'product' ? lastListViewMode : viewMode);
    setViewMode('product');
    setSelectedProduct(product);
    setSelectedProductImage(product.images?.[0] || product.image || IMAGE_FALLBACK);
    setDetailTab('overview');
    if (options?.pushUrl !== false) {
      setProductHash(getProductUrlKey(product));
    }
  };

  const handleProductSelect = (product: Product) => {
    if (user) {
        setUser(prev => {
           if (!prev) return null;
           return {
             ...prev,
             history: [product.id, ...prev.history.filter(id => id !== product.id)].slice(0, 10)
           };
        });
    }
    openProduct(product);
  };

  const closeProductPage = (options?: { skipUrl?: boolean }) => {
    setSelectedProduct(null);
    setSelectedProductImage('');
    setDetailTab('overview');
    setViewMode(lastListViewMode);
    if (!options?.skipUrl) {
      setProductHash(null);
    }
  };

  const openProductByKey = async (productKey: string, options?: { pushUrl?: boolean }) => {
    if (!productKey) return;
    const normalizedKey = normalizeProductKey(productKey);
    const existing =
      products.find((product) => product.id === productKey) ||
      products.find((product) => normalizeProductKey(product.name) === normalizedKey);
    if (existing) {
      openProduct(existing, options);
      return;
    }

    setIsSearching(true);
    setSearchStatus('Загружаем карточку товара...');
    const results = await searchProductsWithAI(productKey);
    setIsSearching(false);
    setSearchStatus('');

    if (results.length > 0) {
      setProducts(results);
      const found =
        results.find((product) => product.id === productKey) ||
        results.find((product) => normalizeProductKey(product.name) === normalizedKey) ||
        results[0];
      openProduct(found, options);
      return;
    }

    if (options?.pushUrl !== false) {
      setProductHash(null, true);
    }
    setViewMode(lastListViewMode);
  };

  const selectedProductGallery = useMemo(() => {
    if (!selectedProduct) return [];

    const unique = new Set<string>();
    const gallery = [selectedProduct.image, ...(selectedProduct.images || [])]
      .map((src) => src?.trim())
      .filter((src): src is string => Boolean(src))
      .filter((src) => {
        if (unique.has(src)) return false;
        unique.add(src);
        return true;
      });

    return gallery.length > 0 ? gallery : [IMAGE_FALLBACK];
  }, [selectedProduct]);

  const variantKey = useMemo(
    () => (selectedProduct ? normalizeVariantKey(selectedProduct.name) : ''),
    [selectedProduct?.name]
  );

  const variants = useMemo(() => {
    if (!selectedProduct) return [];
    const combined = [...variantProducts, ...products, selectedProduct];
    const unique = new Map<string, Product>();
    combined.forEach((product) => {
      const key = normalizeProductKey(product.name);
      if (!unique.has(key)) unique.set(key, product);
    });
    unique.set(normalizeProductKey(selectedProduct.name), selectedProduct);
    const filtered = [...unique.values()].filter(
      (product) =>
        product.category === selectedProduct.category &&
        normalizeVariantKey(product.name) === variantKey
    );
    return filtered.sort((a, b) => a.price - b.price);
  }, [variantProducts, products, selectedProduct, variantKey]);

  const variantInfos = useMemo(
    () => variants.map((product) => ({ product, attrs: extractVariantAttributes(product.name) })),
    [variants]
  );

  const selectedVariantAttrs = useMemo(
    () => (selectedProduct ? extractVariantAttributes(selectedProduct.name) : {}),
    [selectedProduct?.name]
  );

  const colorOptions = useMemo(() => {
    const map = new Map<string, { key: string; label: string; hex: string; product: Product }>();
    variantInfos.forEach(({ product, attrs }) => {
      if (!attrs.colorKey) return;
      if (!map.has(attrs.colorKey)) {
        map.set(attrs.colorKey, {
          key: attrs.colorKey,
          label: attrs.colorLabel || attrs.colorKey,
          hex: attrs.colorHex || '#e2e8f0',
          product,
        });
      }
    });
    return [...map.values()];
  }, [variantInfos]);

  const storageOptions = useMemo(() => {
    const map = new Map<string, MemoryValue>();
    variantInfos.forEach(({ attrs }) => {
      if (!attrs.storage || typeof attrs.storageGb !== 'number') return;
      if (!map.has(attrs.storage)) {
        map.set(attrs.storage, { label: attrs.storage, gbValue: attrs.storageGb });
      }
    });
    return [...map.values()].sort((a, b) => a.gbValue - b.gbValue);
  }, [variantInfos]);

  const ramOptions = useMemo(() => {
    const map = new Map<string, MemoryValue>();
    variantInfos.forEach(({ attrs }) => {
      if (!attrs.ram || typeof attrs.ramGb !== 'number') return;
      if (!map.has(attrs.ram)) {
        map.set(attrs.ram, { label: attrs.ram, gbValue: attrs.ramGb });
      }
    });
    return [...map.values()].sort((a, b) => a.gbValue - b.gbValue);
  }, [variantInfos]);

  const showVariantFallback = useMemo(
    () => colorOptions.length === 0 && storageOptions.length <= 1 && ramOptions.length <= 1,
    [colorOptions.length, storageOptions.length, ramOptions.length]
  );

  const selectVariant = (next: Partial<VariantAttributes>) => {
    if (!variantInfos.length) return;
    const desired = {
      colorKey: next.colorKey ?? selectedVariantAttrs.colorKey,
      storage: next.storage ?? selectedVariantAttrs.storage,
      ram: next.ram ?? selectedVariantAttrs.ram,
    };

    const match = (attrs: VariantAttributes, requireAll = true) => {
      const checks = [
        desired.colorKey ? attrs.colorKey === desired.colorKey : !requireAll,
        desired.storage ? attrs.storage === desired.storage : !requireAll,
        desired.ram ? attrs.ram === desired.ram : !requireAll,
      ];
      return checks.every(Boolean);
    };

    let found = variantInfos.find(({ attrs }) => match(attrs, true));
    if (!found && desired.colorKey && desired.storage) {
      found = variantInfos.find(({ attrs }) => attrs.colorKey === desired.colorKey && attrs.storage === desired.storage);
    }
    if (!found && desired.colorKey && desired.ram) {
      found = variantInfos.find(({ attrs }) => attrs.colorKey === desired.colorKey && attrs.ram === desired.ram);
    }
    if (!found && desired.storage && desired.ram) {
      found = variantInfos.find(({ attrs }) => attrs.storage === desired.storage && attrs.ram === desired.ram);
    }
    if (!found && desired.colorKey) {
      found = variantInfos.find(({ attrs }) => attrs.colorKey === desired.colorKey);
    }
    if (!found && desired.storage) {
      found = variantInfos.find(({ attrs }) => attrs.storage === desired.storage);
    }
    if (!found && desired.ram) {
      found = variantInfos.find(({ attrs }) => attrs.ram === desired.ram);
    }
    if (!found) found = variantInfos[0];

    if (found) {
      openProduct(found.product);
    }
  };

  useEffect(() => {
    if (!selectedProduct) {
      setVariantProducts([]);
      return;
    }
    let isActive = true;

    const loadVariants = async () => {
      const baseQuery = extractVariantBaseName(selectedProduct.name) || selectedProduct.name;
      setIsVariantsLoading(true);
      try {
        const results = await searchProductsWithAI(baseQuery);
        if (!isActive) return;
        const filtered = results.filter(
          (product) =>
            product.category === selectedProduct.category &&
            normalizeVariantKey(product.name) === normalizeVariantKey(selectedProduct.name)
        );
        setVariantProducts(filtered);
      } finally {
        if (isActive) setIsVariantsLoading(false);
      }
    };

    loadVariants();
    return () => {
      isActive = false;
    };
  }, [selectedProduct?.name, selectedProduct?.category]);

  const handleToggleLike = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    if (!user) {
        setIsUserDrawerOpen(true); 
        return;
    }
    setUser(prev => {
      if (!prev) return null;
      const isLiked = prev.wishlist.includes(product.id);
      return {
        ...prev,
        wishlist: isLiked 
          ? prev.wishlist.filter(id => id !== product.id)
          : [...prev.wishlist, product.id]
      };
    });
  };

  const handleAIRecommend = (ids: string[]) => {
    setAiRecommendedIds(ids);
    if (ids.length > 0 && viewMode === 'home') {
      setViewMode('results');
    }
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setProductHash(null, true);
    setViewMode('results');
    resetFilters();
    setIsSearching(true);
    setSearchStatus('Анализируем предложения магазинов...');
    
    const results = await searchProductsWithAI(searchTerm);
    
    if (results.length > 0) {
        setProducts(results);
    } else {
        setProducts(MOCK_PRODUCTS.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())));
    }
    
    setIsSearching(false);
    setSearchStatus('');
  };

  const handleGoToStore = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString('ru-RU');
  };

  const getSourceColor = (source: string) => {
    switch(source) {
      case 'Ozon': return 'bg-blue-100 text-blue-700';
      case 'Wildberries': return 'bg-purple-100 text-purple-700';
      case 'Yandex Market': return 'bg-yellow-100 text-yellow-800';
      case 'DNS': return 'bg-orange-100 text-orange-700';
      case 'M.Video': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  if (!isAuthenticated) {
    return <AuthScreen onLogin={(u) => { setUser(u); setIsAuthenticated(true); }} />;
  }

  return (
    <div className={`min-h-screen font-sans text-slate-900 selection:bg-lime-200 selection:text-slate-900 transition-colors duration-500 ${viewMode === 'home' ? 'bg-white' : 'bg-slate-50'}`}>
      
      {/* Background Ambience */}
      <div className={`fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-100 via-white to-white pointer-events-none transition-opacity duration-1000 ${viewMode === 'home' ? 'opacity-100' : 'opacity-0'}`}></div>

      {/* Navbar */}
      <header className={`fixed top-0 inset-x-0 h-16 z-40 transition-all duration-500 ${viewMode === 'results' || viewMode === 'product' ? 'bg-white/90 backdrop-blur-xl border-b border-slate-200' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setProductHash(null, true); setViewMode('home'); setSearchTerm(''); setProducts(MOCK_PRODUCTS); resetFilters(); }}>
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-lime-400 font-bold shadow-lg shadow-slate-900/20">
              1S
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-900">Единный поиск</span>
          </div>

          {viewMode === 'results' && (
             <form onSubmit={handleSearchSubmit} className="flex-1 max-w-2xl mx-8 relative group animate-in fade-in zoom-in-95 duration-300">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" size={18} />
               <input 
                 type="text"
                 placeholder={searchPlaceholder}
                 className="w-full pl-11 pr-4 py-2.5 bg-slate-100 hover:bg-slate-50 focus:bg-white rounded-full border border-transparent focus:border-slate-300 focus:ring-4 focus:ring-slate-100 outline-none text-sm transition-all duration-300 shadow-sm"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
                 disabled={isSearching}
               />
               {isSearching && (
                 <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <Loader2 className="animate-spin text-slate-400" size={18} />
                 </div>
               )}
             </form>
          )}

          <div className="flex items-center gap-3">
             <button onClick={() => setShowComparison(true)} className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-all">
                <BarChart2 size={20} />
                {comparisonList.length > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-lime-500 rounded-full ring-2 ring-white"></span>}
             </button>
             <button onClick={() => setIsAIOpen(true)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-all">
                <Sparkles size={20} />
             </button>
             <button onClick={() => setIsUserDrawerOpen(true)} className="relative p-1 rounded-full hover:ring-2 hover:ring-slate-200 transition-all group">
               <img src={user?.avatar} alt={user?.name} className="w-8 h-8 rounded-full border border-white shadow-sm" />
               {(user?.cart.length || 0) > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center rounded-full border border-white">
                    {user?.cart.length}
                  </span>
               )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      {viewMode === 'home' && (
        <main className="min-h-screen flex flex-col items-center justify-center px-4 relative pb-20 pt-20">
           <div className="w-full max-w-4xl text-center space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <h1 className="text-5xl md:text-7xl font-bold text-slate-900 tracking-tight leading-[1.1]">
                 Найдите лучший товар <br/>
                 <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-700 to-slate-400">одним поиском.</span>
              </h1>
              
              <form onSubmit={handleSearchSubmit} className="relative max-w-2xl mx-auto group z-10">
                 <div className="absolute inset-0 bg-gradient-to-r from-lime-400 to-purple-500 rounded-full blur-xl opacity-20 group-hover:opacity-30 transition-opacity"></div>
                 <div className="relative bg-white rounded-full shadow-2xl shadow-slate-200/50 flex items-center p-2 border border-slate-100 group-focus-within:border-slate-300 transition-colors">
                    <Search className="ml-4 text-slate-400" size={24} />
                    <input 
                       ref={searchInputRef}
                       type="text" 
                       className="flex-1 bg-transparent border-none outline-none text-xl px-4 py-3 placeholder:text-slate-300 text-slate-900"
                       placeholder={searchPlaceholder}
                       value={searchTerm}
                       onChange={(e) => setSearchTerm(e.target.value)}
                       autoFocus
                       disabled={isSearching}
                    />
                    <button 
                        type="submit" 
                        disabled={isSearching}
                        className="bg-slate-900 text-white px-8 py-3 rounded-full font-bold hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-900/20 disabled:opacity-80 flex items-center gap-2"
                    >
                       {isSearching ? <Loader2 className="animate-spin" size={20} /> : 'Поиск'}
                    </button>
                 </div>
              </form>
</div>
        </main>
      )}

      {/* Results Section */}
      {viewMode === 'results' && (
        <main className="pt-24 pb-20 max-w-[1600px] mx-auto px-4 md:px-8 flex gap-8">
           <div className="hidden lg:block w-72 flex-shrink-0 sticky top-24 h-[calc(100vh-8rem)]">
              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm h-full flex flex-col overflow-hidden overflow-x-hidden">
                 <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2 text-slate-900 font-bold">
                      <Filter size={18} /> Фильтры

                    </div>
                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="text-[11px] text-slate-500 hover:text-slate-700"
                      >
                        Сбросить все

                      </button>
                    )}
                 </div>
                 <div className="space-y-5 overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar min-h-0">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Сортировка</label>
                      <select
                        value={sortBy}
                        onChange={handleSortChange}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                      >
                        <option value="none">Без сортировки</option>
                        <option value="price_asc">Цена: по возрастанию</option>
                        <option value="price_desc">Цена: по убыванию</option>
                        <option value="rating_desc">Рейтинг: по убыванию</option>
                        <option value="rating_asc">Рейтинг: по возрастанию</option>
                        <option value="name_asc">Название: А-Я</option>
                      </select>
                    </div>
                    <details open className="group border-b border-slate-100 pb-4">
                      <summary className="flex items-center justify-between text-sm font-semibold text-slate-700 cursor-pointer list-none">
                        <span>Цена</span>
                        <ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" />
                      </summary>
                      <div className="pt-3 space-y-3">
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="text-[11px] font-semibold uppercase">От</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={minPriceInput}
                              onChange={(event) => handlePriceInputChange(event, setMinPriceInput)}
                              placeholder={priceBounds ? formatPrice(priceBounds.min) : '0'}
                              className="w-24 h-8 rounded-lg border border-slate-200 px-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                            />
                            <span className="text-[11px] text-slate-400">₽</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="text-[11px] font-semibold uppercase">До</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={maxPriceInput}
                              onChange={(event) => handlePriceInputChange(event, setMaxPriceInput)}
                              placeholder={priceBounds ? formatPrice(priceBounds.max) : '0'}
                              className="w-24 h-8 rounded-lg border border-slate-200 px-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                            />
                            <span className="text-[11px] text-slate-400">₽</span>
                          </label>
                        </div>
                        {normalizedPriceRange.isSwapped && (
                          <p className="text-[11px] text-amber-600">Минимум и максимум были автоматически поменяны местами.</p>
                        )}
                      </div>
                    </details>

                    <details className="group border-b border-slate-100 pb-4">
                      <summary className="flex items-center justify-between text-sm font-semibold text-slate-700 cursor-pointer list-none">
                        <span>Рейтинг</span>
                        <ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" />
                      </summary>
                      <div className="pt-3 space-y-3">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>От {normalizedMinRating.toFixed(1)}</span>
                          <span>{normalizedMinReviews} отзывов+</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={5}
                          step={0.1}
                          value={normalizedMinRating}
                          onChange={(event) => setMinRatingInput(event.target.value.replace(',', '.'))}
                          className="w-full accent-slate-900"
                        />
                        <input
                          type="number"
                          min={0}
                          value={minReviewsInput}
                          onChange={(event) => setMinReviewsInput(event.target.value.replace(/[^\d]/g, ''))}
                          placeholder="Минимум отзывов"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                        />
                      </div>
                    </details>

                    <details className="group border-b border-slate-100 pb-4">
                      <summary className="flex items-center justify-between text-sm font-semibold text-slate-700 cursor-pointer list-none">
                        <span>Производитель</span>
                        <ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" />
                      </summary>
                      <div className="pt-3 space-y-3">
                        <input
                          type="text"
                          value={brandSearchTerm}
                          onChange={(event) => setBrandSearchTerm(event.target.value)}
                          placeholder="Поиск бренда"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                        />
                        <div className="space-y-2 max-h-40 overflow-y-auto overflow-x-hidden pr-1">
                          {filteredBrandStats.map(([brand, count]) => (
                            <label key={brand} className="flex items-center justify-between gap-3 text-sm text-slate-700 cursor-pointer hover:text-slate-900">
                              <span className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                                  checked={selectedBrands.includes(brand)}
                                  onChange={() => toggleBrandFilter(brand)}
                                />
                                {brand}
                              </span>
                              <span className="text-xs text-slate-400">{count}</span>
                            </label>
                          ))}
                          {filteredBrandStats.length === 0 && (
                            <div className="text-xs text-slate-400">Бренды не найдены.</div>
                          )}
                        </div>
                      </div>
                    </details>

                    <details className="group pb-2">
                      <summary className="flex items-center justify-between text-sm font-semibold text-slate-700 cursor-pointer list-none">
                        <span>Ещё фильтры</span>
                        <ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" />
                      </summary>
                      <div className="pt-3 space-y-4">
                        <input
                          type="text"
                          value={specSearchTerm}
                          onChange={(event) => setSpecSearchTerm(event.target.value)}
                          placeholder="Поиск по характеристикам"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                        />
                        <div className="space-y-2">
                          <label className="flex items-center justify-between text-sm text-slate-700 cursor-pointer">
                            <span className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                                checked={onlyInStock}
                                onChange={() => setOnlyInStock((prev) => !prev)}
                              />
                              Только в наличии
                            </span>
                          </label>
                          <label className="flex items-center justify-between text-sm text-slate-700 cursor-pointer">
                            <span className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                                checked={onlyWithReviews}
                                onChange={() => setOnlyWithReviews((prev) => !prev)}
                              />
                              Только с отзывами
                            </span>
                          </label>
                          <label className="flex items-center justify-between text-sm text-slate-700 cursor-pointer">
                            <span className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                                checked={onlyWithImages}
                                onChange={() => setOnlyWithImages((prev) => !prev)}
                              />
                              Только с фото
                            </span>
                          </label>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Категории</label>
                            {selectedCategories.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setSelectedCategories([])}
                                className="text-[11px] text-slate-500 hover:text-slate-700"
                              >
                                Сбросить
                              </button>
                            )}
                          </div>
                          <div className="space-y-2">
                            {categoryStats.map(([category, count]) => (
                              <label key={category} className="flex items-center justify-between gap-3 text-sm text-slate-700 cursor-pointer hover:text-slate-900">
                                <span className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                                    checked={selectedCategories.includes(category)}
                                    onChange={() => toggleCategoryFilter(category)}
                                  />
                                  {CATEGORY_LABELS[category]}
                                </span>
                                <span className="text-xs text-slate-400">{count}</span>
                              </label>
                            ))}
                            {categoryStats.length === 0 && (
                              <div className="text-xs text-slate-400">Категории появятся после поиска.</div>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Магазины</label>
                            {selectedShops.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setSelectedShops([])}
                                className="text-[11px] text-slate-500 hover:text-slate-700"
                              >
                                Сбросить
                              </button>
                            )}
                          </div>
                          <div className="space-y-2 max-h-40 overflow-y-auto overflow-x-hidden pr-1">
                            {shopStats.map(([shop, count]) => (
                              <label key={shop} className="flex items-center justify-between gap-3 text-sm text-slate-700 cursor-pointer hover:text-slate-900">
                                <span className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                                    checked={selectedShops.includes(shop)}
                                    onChange={() => toggleShopFilter(shop)}
                                  />
                                  {shop}
                                </span>
                                <span className="text-xs text-slate-400">{count}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </details>
                 </div>
              </div>
           </div>

           <div className="flex-1">
              {isSearching ? (
                 <div className="w-full h-64 flex flex-col items-center justify-center text-slate-500 animate-in fade-in">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center max-w-md">
                       <Loader2 className="animate-spin text-lime-500 mb-4" size={48} />
                       <h3 className="font-bold text-lg text-slate-900">Анализируем предложения...</h3>
                       <p className="text-slate-500 text-sm mt-2 text-center">{searchStatus}</p>
                    </div>
                 </div>
              ) : (
                <>
                  {searchTerm && filteredProducts.length > 0 && (
                    <div className="mb-6 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-5 py-4 shadow-sm">
                       <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                             <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-lg font-bold">
                               {filteredProducts.length}
                             </div>
                             <div>
                                <div className="text-[11px] uppercase tracking-wide text-slate-500 font-bold">Результаты</div>
                                <div className="text-lg md:text-xl font-bold text-slate-900 leading-tight">
                                  Найдено {filteredProducts.length} предложений
                                </div>
                                <div className="text-sm text-slate-500">по запросу «{searchTerm}»</div>
                             </div>
                          </div>
                          <div className="flex items-center gap-2">
                             {activeFilterCount > 0 && (
                               <span className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700">
                                 Фильтры: {activeFilterCount}
                               </span>
                             )}
                          </div>
                       </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                    {visibleProducts.map(product => (
                      <ProductCard 
                        key={product.id}
                        product={product}
                        isCompared={!!comparisonList.find(c => c.id === product.id)}
                        onCompare={toggleCompare}
                        onSelect={handleProductSelect}
                        highlight={aiRecommendedIds.includes(product.id)}
                        isLiked={user?.wishlist.includes(product.id)}
                        onToggleLike={handleToggleLike}
                      />
                    ))}
                  </div>

                  {hasMoreResults && (
                    <div className="flex justify-center mt-8">
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredProducts.length))
                        }
                        className="px-5 py-2.5 rounded-full border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 shadow-sm"
                      >
                        Показать ещё ({visibleProducts.length} / {filteredProducts.length})
                      </button>
                    </div>
                  )}
                  
                  {filteredProducts.length === 0 && (
                     <div className="text-center py-20">
                        <p className="text-slate-400 text-lg">По запросу "{searchTerm}" ничего не найдено</p>
                        <button onClick={() => { setSearchTerm(''); setViewMode('home'); }} className="mt-4 text-lime-600 hover:underline">На главную</button>

                     </div>
                  )}
                </>
              )}
           </div>
        </main>
      )}

      {/* Comparison Modal */}
      {showComparison && (
        <ComparisonView 
          products={comparisonList} 
          onRemove={(id) => setComparisonList(prev => prev.filter(p => p.id !== id))}
          onClose={() => setShowComparison(false)}
        />
      )}

      {/* User Drawer */}
      {user && (
        <UserDrawer 
          user={user}
          isOpen={isUserDrawerOpen}
          onClose={() => setIsUserDrawerOpen(false)}
          products={products}
          onRemoveFromCart={(id) => setUser(prev => prev ? ({ ...prev, cart: prev.cart.filter(c => c !== id) }) : null)}
          onRemoveFromWishlist={(id) => setUser(prev => prev ? ({ ...prev, wishlist: prev.wishlist.filter(w => w !== id) }) : null)}
          onSelectProduct={handleProductSelect}
        />
      )}

      {/* AI Sidebar */}
      <AIAssistant 
        isOpen={isAIOpen} 
        onClose={() => setIsAIOpen(false)} 
        products={products}
        onRecommend={handleAIRecommend}
      />

      {/* Product Detail Page */}
      {viewMode === 'product' && selectedProduct && (
        <main className="pt-24 pb-20 max-w-6xl mx-auto px-4 md:px-6">
          <div className="mb-6">
            <button
              onClick={closeProductPage}
              className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft size={18} /> Назад к результатам
            </button>
          </div>

          <div className="relative bg-white rounded-3xl w-full max-w-6xl shadow-2xl flex flex-col md:flex-row overflow-hidden border border-slate-100">

             {/* Left: Images & Store Matrix */}
             <div className="w-full md:w-5/12 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col">
                <div className="p-8 aspect-square flex items-center justify-center relative bg-white flex-shrink-0 border-b border-slate-50">
                    <img 
                       src={selectedProductImage || selectedProductGallery[0]} 
                       alt={selectedProduct.name} 
                       className="w-full h-full object-contain mix-blend-multiply" 
                       onError={(e) => {
                         if (e.currentTarget.src !== IMAGE_FALLBACK) {
                           e.currentTarget.src = IMAGE_FALLBACK;
                         }
                       }}
                    />
                </div>

                {selectedProductGallery.length > 1 && (
                  <div className="px-6 pt-4 pb-2 border-b border-slate-100 bg-white">
                    <div className="grid grid-cols-4 gap-2">
                      {selectedProductGallery.slice(0, 4).map((imageSrc, index) => {
                        const isActive = (selectedProductImage || selectedProductGallery[0]) === imageSrc;
                        return (
                          <button
                            key={`${selectedProduct.id}-thumb-${index}`}
                            type="button"
                            onClick={() => setSelectedProductImage(imageSrc)}
                            className={`aspect-square rounded-lg overflow-hidden border transition ${
                              isActive ? 'border-slate-900 shadow-sm' : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <img
                              src={imageSrc}
                              alt={`${selectedProduct.name} ${index + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                if (e.currentTarget.src !== IMAGE_FALLBACK) {
                                  e.currentTarget.src = IMAGE_FALLBACK;
                                }
                              }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="p-6">
                   <h3 className="text-sm font-bold text-slate-900 uppercase mb-4 flex items-center gap-2">
                      <ShoppingBag size={16} /> Доступно в магазинах
                   </h3>
                   <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                      {selectedProduct.offers.map((offer, idx) => (
                         <a 
                           key={idx} 
                           href={offer.url}
                           target="_blank"
                           rel="noopener noreferrer"
                           className="flex items-center justify-between p-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors group"
                         >
                            <div className="flex items-center gap-3">
                               <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-500 uppercase">
                                  {offer.name[0]}
                               </div>
                               <div>
                                  <div className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">{offer.name}</div>
                                  <div className="text-xs text-slate-500">{offer.delivery}</div>
                               </div>
                            </div>
                            <div className="text-right">
                               <div className="font-bold text-slate-900">{formatPrice(offer.price)} ₽</div>
                               {idx === 0 && <span className="text-[10px] bg-lime-100 text-lime-700 px-1.5 py-0.5 rounded font-bold">Лучшая цена</span>}
                            </div>
                            <ArrowUpRight size={16} className="text-slate-400 group-hover:text-blue-600 transition-colors" />
                         </a>
                      ))}
                   </div>
                </div>
             </div>

             {/* Right: Details */}
             <div className="flex-1 bg-white">
                <div className="p-8">
                   <div className="flex justify-between items-start mb-4">
                      <div>
                         <h2 className="text-3xl font-bold text-slate-900 mb-2">{selectedProduct.name}</h2>
                         <div className="flex items-center gap-2">
                            <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold uppercase">
                              {CATEGORY_LABELS[selectedProduct.category] || selectedProduct.category}
                            </span>
                            <div className="flex items-center gap-1 text-yellow-500">
                               <Star size={14} fill="currentColor" />
                               {/* PRECISE RATING TO 2 DECIMALS */}
                               <span className="text-sm font-bold text-slate-700">{selectedProduct.rating.toFixed(2)}</span>
                            </div>
                         </div>
                      </div>
                      
                      <div className="flex gap-2">
                          <button 
                             onClick={(e) => handleToggleLike(e, selectedProduct)} 
                             className={`p-3 rounded-full border ${user?.wishlist.includes(selectedProduct.id) ? 'bg-red-50 border-red-100 text-red-500' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}
                          >
                             <Heart size={20} fill={user?.wishlist.includes(selectedProduct.id) ? "currentColor" : "none"} />
                          </button>
                      </div>
                   </div>

                   {(variants.length > 1 || isVariantsLoading) && (
                     <div className="mb-6 space-y-4">
                       <div className="flex items-center justify-between">
                         <h4 className="text-xs font-bold text-slate-500 uppercase">Варианты</h4>
                         {isVariantsLoading && (
                           <span className="text-xs text-slate-400">Загружаем варианты...</span>
                         )}
                       </div>

                       {colorOptions.length > 0 && (
                         <div>
                           <div className="text-xs font-semibold text-slate-500 mb-2">
                             Цвет: <span className="text-slate-900">{selectedVariantAttrs.colorLabel || '—'}</span>
                           </div>
                           <div className="flex flex-wrap gap-2">
                             {colorOptions.map((option) => {
                               const isActive = option.key === selectedVariantAttrs.colorKey;
                               return (
                                 <button
                                   key={option.key}
                                   type="button"
                                   onClick={() => selectVariant({ colorKey: option.key })}
                                   className={`w-12 h-12 rounded-xl border transition flex items-center justify-center overflow-hidden ${
                                     isActive ? 'border-slate-900 ring-2 ring-slate-900/20' : 'border-slate-200 hover:border-slate-300'
                                   }`}
                                   title={option.label}
                                 >
                                   <img
                                     src={option.product.image}
                                     alt={option.label}
                                     className="w-full h-full object-contain mix-blend-multiply"
                                     onError={(e) => {
                                       if (e.currentTarget.src !== IMAGE_FALLBACK) {
                                         e.currentTarget.src = IMAGE_FALLBACK;
                                       }
                                     }}
                                   />
                                 </button>
                               );
                             })}
                           </div>
                         </div>
                       )}

                       {storageOptions.length > 1 && (
                         <div>
                           <div className="text-xs font-semibold text-slate-500 mb-2">
                             Объем встроенной памяти:{' '}
                             <span className="text-slate-900">{selectedVariantAttrs.storage || '—'}</span>
                           </div>
                           <div className="flex flex-wrap gap-2">
                             {storageOptions.map((option) => {
                               const isActive = option.label === selectedVariantAttrs.storage;
                               return (
                                 <button
                                   key={option.label}
                                   type="button"
                                   onClick={() => selectVariant({ storage: option.label })}
                                   className={`px-3 py-2 rounded-lg text-sm font-semibold border transition ${
                                     isActive
                                       ? 'border-slate-900 text-slate-900 bg-slate-50'
                                       : 'border-slate-200 text-slate-600 hover:border-slate-300'
                                   }`}
                                 >
                                   {option.label}
                                 </button>
                               );
                             })}
                           </div>
                         </div>
                       )}

                       {ramOptions.length > 1 && (
                         <div>
                           <div className="text-xs font-semibold text-slate-500 mb-2">
                             Объем оперативной памяти:{' '}
                             <span className="text-slate-900">{selectedVariantAttrs.ram || '—'}</span>
                           </div>
                           <div className="flex flex-wrap gap-2">
                             {ramOptions.map((option) => {
                               const isActive = option.label === selectedVariantAttrs.ram;
                               return (
                                 <button
                                   key={option.label}
                                   type="button"
                                   onClick={() => selectVariant({ ram: option.label })}
                                   className={`px-3 py-2 rounded-lg text-sm font-semibold border transition ${
                                     isActive
                                       ? 'border-slate-900 text-slate-900 bg-slate-50'
                                       : 'border-slate-200 text-slate-600 hover:border-slate-300'
                                   }`}
                                 >
                                   {option.label}
                                 </button>
                               );
                             })}
                           </div>
                         </div>
                       )}

                       {showVariantFallback && (
                         <div className="flex flex-wrap gap-2">
                           {variants.map((variant) => {
                             const isActive = variant.id === selectedProduct.id;
                             return (
                               <button
                                 key={variant.id}
                                 type="button"
                                 onClick={() => openProduct(variant)}
                                 className={`px-3 py-2 rounded-lg text-xs font-semibold border transition ${
                                   isActive
                                     ? 'border-slate-900 text-slate-900 bg-slate-50'
                                     : 'border-slate-200 text-slate-600 hover:border-slate-300'
                                 }`}
                               >
                                 {variant.name}
                               </button>
                             );
                           })}
                         </div>
                       )}
                     </div>
                   )}
                   
                   <div className="flex gap-6 border-b border-slate-100 mb-6">
                      <button onClick={() => setDetailTab('overview')} className={`pb-3 text-sm font-bold border-b-2 transition-colors ${detailTab === 'overview' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400'}`}>Обзор</button>
                      <button onClick={() => setDetailTab('reviews')} className={`pb-3 text-sm font-bold border-b-2 transition-colors ${detailTab === 'reviews' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400'}`}>Отзывы</button>
                   </div>

                   {detailTab === 'overview' ? (
                      <div className="space-y-8 pb-4">
                         <div className="bg-lime-50 border border-lime-100 rounded-xl p-4 flex items-start gap-3">
                            <TrendingDown className="text-lime-600 mt-1" size={20} />
                            <div>
                               <h4 className="font-bold text-lime-900 text-sm">Аналитика цены</h4>
                               <p className="text-sm text-lime-700">Цена снизилась примерно на 5% за последнюю неделю. Хороший момент для покупки.</p>

                            </div>
                         </div>

                         <p className="text-slate-600 leading-relaxed">{selectedProduct.description}</p>
                         
                         {selectedProduct.tags && (
                             <div className="flex gap-2 flex-wrap">
                                 {selectedProduct.tags.map(tag => (
                                     <span key={tag} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md">{tag}</span>
                                 ))}
                             </div>
                         )}
                         
                         <div>
                            <h4 className="font-bold text-slate-900 uppercase text-xs mb-3">Характеристики</h4>
                            {(Object.values(selectedProduct.specs) as Spec[]).length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                 {(Object.values(selectedProduct.specs) as Spec[]).map((spec, i) => (
                                    <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                       <div className="text-xs text-slate-500 uppercase">{spec.label}</div>
                                       <div className="font-bold text-slate-900 break-words">{spec.value.toString()} {spec.unit}</div>
                                    </div>
                                 ))}
                              </div>
                            ) : (
                              <div className="text-sm text-slate-400">Характеристики временно недоступны.</div>
                            )}
                         </div>

                         <PriceHistoryChart data={selectedProduct.priceHistory} />
                      </div>
                   ) : (
                      <div className="space-y-6 pb-4">
                         {selectedProduct.reviews.map(review => (
                            <div key={review.id} className="border-b border-slate-100 pb-6 last:border-0">
                               <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                     <span className="font-bold text-slate-900">{review.author}</span>
                                     <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${getSourceColor(review.source)}`}>
                                        <Store size={8} /> {review.source}
                                     </span>
                                  </div>
                                  <span className="text-xs text-slate-400">{review.date}</span>
                               </div>
                               <div className="flex text-yellow-400 mb-2">
                                  {[...Array(5)].map((_, i) => (
                                     <Star key={i} size={12} fill={i < Math.floor(review.rating) ? "currentColor" : "none"} className={i >= Math.floor(review.rating) ? "text-slate-200" : ""} />
                                  ))}
                               </div>
                               <h5 className="font-bold text-sm mb-1">{review.title}</h5>
                               <p className="text-sm text-slate-600">{review.content}</p>
                            </div>
                         ))}
                         {selectedProduct.reviews.length === 0 && (
                            <div className="text-center py-10 text-slate-400">
                               Отзывов пока нет.
                            </div>
                         )}
                      </div>
                   )}
                </div>

                <div className="p-6 border-t border-slate-100 flex items-center justify-between bg-slate-50">
                   <div>
                      <div className="text-xs text-slate-500 font-bold uppercase">Лучшая цена</div>
                      <div className="text-3xl font-bold text-slate-900">{formatPrice(selectedProduct.price)} ₽</div>
                   </div>
                   <button 
                     onClick={() => handleGoToStore(selectedProduct.offers[0].url)}
                     className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-xl font-bold shadow-lg shadow-slate-900/10 flex items-center gap-2"
                   >
                      Перейти в магазин <ArrowRight size={18} />
                   </button>
                </div>
             </div>
          </div>
        </main>
      )}

      {user && (
         <div className="hidden">
         </div>
      )}
    </div>
  );
}

export default App;




