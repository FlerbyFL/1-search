import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MOCK_PRODUCTS, SCENARIOS } from './constants';
import { Product, User, Spec, Review, Scenario, Category } from './types';
import ProductCard from './components/ProductCard';
import AIAssistant from './components/AIAssistant';
import ComparisonView from './components/ComparisonView';
import PriceHistoryChart from './components/PriceHistoryChart';
import UserDrawer from './components/UserDrawer';
import AuthScreen from './components/AuthScreen';
import ScenarioSelector from './components/ScenarioSelector';
import { searchProductsWithAI } from './services/geminiService';
import { Search, Bot, BarChart2, X, ArrowRight, ShieldCheck, Sparkles, ShoppingBag, Heart, Star, CheckCircle, Zap, TrendingDown, TrendingUp, Truck, ArrowLeft, Filter, ArrowUpRight, Store, Loader2, LogOut } from 'lucide-react';

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

function App() {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Data State
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>(MOCK_PRODUCTS);
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
  
  // App Mode State
  const [viewMode, setViewMode] = useState<'home' | 'results'>('home');
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
  
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const activeFilterCount = useMemo(() => {
    let count = selectedCategories.length;
    if (activeQuickFilter) count += 1;
    if (normalizedPriceRange.min !== null || normalizedPriceRange.max !== null) count += 1;
    if (sortBy !== 'none') count += 1;
    if (selectedShops.length > 0) count += 1;
    if (selectedBrands.length > 0) count += 1;
    if (normalizedMinRating > 0) count += 1;
    if (specSearchTerm.trim()) count += 1;
    if (onlyInStock) count += 1;
    if (onlyWithDiscount) count += 1;
    return count;
  }, [
    selectedCategories.length,
    activeQuickFilter,
    normalizedPriceRange,
    sortBy,
    selectedShops.length,
    selectedBrands.length,
    normalizedMinRating,
    specSearchTerm,
    onlyInStock,
    onlyWithDiscount,
  ]);

  const resetFilters = () => {
    setActiveQuickFilter(null);
    setSelectedCategories([]);
    setSelectedShops([]);
    setSelectedBrands([]);
    setMinPriceInput('');
    setMaxPriceInput('');
    setMinRatingInput('0');
    setSpecSearchTerm('');
    setOnlyInStock(false);
    setOnlyWithDiscount(false);
    setSortBy('none');
  };

  const handlePriceInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    setter(event.target.value.replace(/[^\d]/g, ''));
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
      hasSpecSearch ||
      onlyInStock ||
      onlyWithDiscount ||
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
    specSearchTerm,
    onlyInStock,
    onlyWithDiscount,
    sortBy,
    isSearching,
    viewMode,
  ]);

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
    setSelectedProduct(product);
    setSelectedProductImage(product.images?.[0] || product.image || IMAGE_FALLBACK);
    setDetailTab('overview');
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

  const handleScenarioSelect = (scenario: Scenario) => {
     setSearchTerm(scenario.label + " ");
     searchInputRef.current?.focus();
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
      <header className={`fixed top-0 inset-x-0 h-16 z-40 transition-all duration-500 ${viewMode === 'results' ? 'bg-white/80 backdrop-blur-xl border-b border-slate-200' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setViewMode('home'); setSearchTerm(''); setProducts(MOCK_PRODUCTS); resetFilters(); }}>
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-lime-400 font-bold shadow-lg shadow-slate-900/20">
              1S
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-900">OneSearch</span>
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

              <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
                <ScenarioSelector 
                  scenarios={SCENARIOS} 
                  activeId={null} 
                  onSelect={handleScenarioSelect} 
                />
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                 {[
                    { id: 'price_low', label: 'Низкая цена', icon: <TrendingDown size={14} /> },
                    { id: 'price_high', label: 'Высокая цена', icon: <TrendingUp size={14} /> },
                    { id: 'delivery', label: 'Быстрая доставка', icon: <Truck size={14} /> },
                    { id: 'rating', label: 'Рейтинг', icon: <Star size={14} /> },
                    { id: 'deals', label: 'Скидки', icon: <Zap size={14} /> }
                 ].map(filter => (
                    <button 
                       key={filter.id}
                       onClick={() => { setActiveQuickFilter(prev => prev === filter.id ? null : filter.id); setViewMode('results'); }}
                       className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                          activeQuickFilter === filter.id 
                             ? 'bg-slate-900 text-white border-slate-900' 
                             : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                       }`}
                    >
                       {filter.icon} {filter.label}
                    </button>
                 ))}
              </div>
           </div>
        </main>
      )}

      {/* Results Section */}
      {viewMode === 'results' && (
        <main className="pt-24 pb-20 max-w-[1600px] mx-auto px-4 md:px-8 flex gap-8">
           <div className="hidden lg:block w-64 flex-shrink-0 sticky top-24 h-[calc(100vh-8rem)]">
              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm h-full flex flex-col overflow-hidden">
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
                 <div className="space-y-6 overflow-y-auto pr-1 custom-scrollbar min-h-0">
                    <div>
                       <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Цена, ₽</label>
                       <div className="grid grid-cols-2 gap-2">
                         <input
                           type="text"
                           inputMode="numeric"
                           placeholder="От"
                           value={minPriceInput}
                           onChange={(event) => handlePriceInputChange(event, setMinPriceInput)}
                           className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                         />
                         <input
                           type="text"
                           inputMode="numeric"
                           placeholder="До"
                           value={maxPriceInput}
                           onChange={(event) => handlePriceInputChange(event, setMaxPriceInput)}
                           className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                         />
                       </div>
                       <div className="flex justify-between text-xs text-slate-500 mt-2 gap-2">
                          <span>Показанный диапазон цен</span>
                          <span className="text-right text-slate-600 font-medium">
                            {priceBounds ? `${formatPrice(priceBounds.min)} - ${formatPrice(priceBounds.max)} ₽` : '--'}
                          </span>
                       </div>
                       {normalizedPriceRange.isSwapped && (
                         <p className="text-[11px] text-amber-600 mt-2">Минимум и максимум были автоматически поменяны местами.</p>
                       )}
                    </div>
                    <div>
                       <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Сортировка</label>
                       <select
                         value={sortBy}
                         onChange={(event) =>
                           setSortBy(
                             event.target.value as
                               | 'none'
                               | 'price_asc'
                               | 'price_desc'
                               | 'rating_desc'
                               | 'rating_asc'
                               | 'name_asc'
                           )
                         }
                         className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                       >
                         <option value="none">По умолчанию</option>
                         <option value="price_asc">Цена: по возрастанию</option>
                         <option value="price_desc">Цена: по убыванию</option>
                         <option value="rating_desc">Рейтинг: по убыванию</option>
                         <option value="rating_asc">Рейтинг: по возрастанию</option>
                         <option value="name_asc">Название (А-Я)</option>
                       </select>
                    </div>
                    <div>
                       <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Минимальный рейтинг</label>
                       <input
                         type="number"
                         min={0}
                         max={5}
                         step={0.1}
                         value={minRatingInput}
                         onChange={(event) => setMinRatingInput(event.target.value.replace(',', '.'))}
                         className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                       />
                    </div>
                    <div>
                       <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Поиск по характеристикам</label>
                       <input
                         type="text"
                         value={specSearchTerm}
                         onChange={(event) => setSpecSearchTerm(event.target.value)}
                         placeholder="Например: OLED, 16 ГБ, RTX"
                         className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                       />
                    </div>
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
                             checked={onlyWithDiscount}
                             onChange={() => setOnlyWithDiscount((prev) => !prev)}
                           />
                           Только со скидкой

                         </span>
                       </label>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                       <div className="flex items-center justify-between text-xs text-slate-500">
                         <span>Активные фильтры</span>

                         <span className="font-bold text-slate-700">{activeFilterCount}</span>
                       </div>
                       <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                         <span>Товаров после фильтрации</span>

                         <span className="font-bold text-slate-700">{filteredProducts.length}</span>
                       </div>
                    </div>
                    <div>
                       <div className="flex items-center justify-between mb-3">
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
                       <div className="flex items-center justify-between mb-3">
                          <label className="text-xs font-bold text-slate-500 uppercase">Бренды</label>
                          {selectedBrands.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setSelectedBrands([])}
                              className="text-[11px] text-slate-500 hover:text-slate-700"
                            >
                              Сбросить

                            </button>
                          )}
                       </div>
                       <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {brandStats.map(([brand, count]) => (
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
                       </div>
                    </div>
                    <div>
                       <div className="flex items-center justify-between mb-3">
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
                       <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
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
                    <div className="mb-6 bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-1 shadow-lg text-white">
                       <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl px-4 py-3 flex items-center gap-3">
                          <div className="bg-lime-400 text-slate-900 p-1.5 rounded-lg">
                             <Sparkles size={16} />
                          </div>
                          <span className="text-sm font-medium">
                             Найдено <strong>{filteredProducts.length}</strong> актуальных предложений из интернет-магазинов.

                          </span>
                       </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                    {filteredProducts.map(product => (
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

      {/* Product Detail Modal - IMPROVED SCROLLING ARCHITECTURE */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => {
              setSelectedProduct(null);
              setSelectedProductImage('');
            }}
          />
          
          <div className="relative bg-white rounded-3xl w-full max-w-6xl shadow-2xl flex flex-col md:flex-row animate-in zoom-in-95 duration-200 overflow-hidden h-[90vh] md:h-[85vh]">
             
             {/* Left: Images & Store Matrix */}
             {/* Mobile: 40% height. Desktop: 5/12 width. Independent scroll. */}
             <div className="h-[40%] md:h-full w-full md:w-5/12 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col overflow-y-auto custom-scrollbar flex-shrink-0">
                <div className="p-8 aspect-square flex items-center justify-center relative bg-white flex-shrink-0 border-b border-slate-50">
                    <button 
                       onClick={() => {
                         setSelectedProduct(null);
                         setSelectedProductImage('');
                       }}
                       className="absolute top-4 left-4 p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 md:hidden z-10"
                    >
                       <X size={20} />
                    </button>
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
             {/* Mobile: 60% height. Desktop: Flex-1 width. Independent scroll. */}
             <div className="h-[60%] md:h-full flex-1 flex flex-col bg-white overflow-hidden relative min-h-0">
                
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
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
                   
                   <div className="flex gap-6 border-b border-slate-100 mb-6 sticky top-0 bg-white z-10 pt-2">
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

                <div className="p-6 border-t border-slate-100 flex items-center justify-between bg-slate-50 z-20 flex-shrink-0">
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

             <button
               onClick={() => {
                 setSelectedProduct(null);
                 setSelectedProductImage('');
               }}
               className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 hidden md:block z-50"
             >
                <X size={20} />
             </button>
          </div>
        </div>
      )}

      {user && (
         <div className="hidden">
         </div>
      )}
    </div>
  );
}

export default App;

