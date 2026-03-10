import { Product, Scenario, User, StoreOffer, Review } from './types';

export const MOCK_USER: User = {
  id: 'u1',
  name: 'Алексей Смирнов',
  email: 'alex.smirnov@example.ru',
  avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  cart: ['hp-1'],
  wishlist: ['lp-1', 'gp-1'],
  history: ['lp-2', 'sm-1'],
  bonuses: 4520,
  status: 'Gold'
};

export const SCENARIOS: Scenario[] = [
  { id: 'coding', label: 'Программирование', icon: '💻', description: 'Много ОЗУ, мощный процессор', promptModifier: '' },
  { id: 'gaming', label: 'Гейминг', icon: '🎮', description: 'Максимальная мощность видеокарты', promptModifier: '' },
];

export const reviewSources = ['Ozon', 'Wildberries', 'Yandex Market', 'DNS', 'M.Video', 'Citilink'] as const;

export const generateReviews = (productId: string, count: number): Review[] => {
  const reviews: Review[] = [];
  const authors = ['Иван П.', 'Мария К.', 'Сергей В.', 'Елена Д.', 'Дмитрий О.', 'Анна С.', 'Кирилл М.', 'Ольга Р.'];
  const titles = [
    'Отличный товар, рекомендую!',
    'Своих денег стоит',
    'Есть небольшие недостатки',
    'Превзошло ожидания',
    'Нормально, но доставка долгая',
    'Топ за свои деньги',
    'Качество сборки радует',
  ];
  const contents = [
    'Пользуюсь уже месяц, все работает отлично. Качество сборки на высоте, ничего не люфтит.',
    'За эту цену один из лучших вариантов на рынке. Из минусов только маркий корпус.',
    'Доставили быстро, упаковка целая. Работает шустро, экраном доволен.',
    'В целом хорошо, но ожидал большей автономности. На день хватает впритык.',
    'Очень удобная вещь, приятно пользоваться каждый день. Качество звука и материалов отличное.',
    'Сравнил с аналогами, этот вариант выглядит наиболее сбалансированным по параметрам.',
    'Брал в подарок, именинник доволен. Выглядит дороже своей цены.',
  ];

  for (let i = 0; i < count; i++) {
    reviews.push({
      id: `r-${productId}-${i}`,
      author: authors[i % authors.length],
      avatar: `https://i.pravatar.cc/150?u=${productId}${i}`,
      rating: 4 + (Math.random() > 0.3 ? 1 : 0) - (Math.random() > 0.8 ? 1 : 0),
      date: new Date(Date.now() - Math.floor(Math.random() * 10000000000)).toLocaleDateString('ru-RU'),
      title: titles[i % titles.length],
      content: contents[i % contents.length],
      verified: Math.random() > 0.2,
      helpfulCount: Math.floor(Math.random() * 50),
      source: reviewSources[Math.floor(Math.random() * reviewSources.length)],
    });
  }
  return reviews;
};

const generateOffers = (basePrice: number, productName: string): StoreOffer[] => {
  const encodedName = encodeURIComponent(productName);
  const stores = [
    { name: 'Ozon', variance: 0, delivery: 'Завтра', logo: 'ozon', url: `https://www.ozon.ru/search/?text=${encodedName}` },
    { name: 'Wildberries', variance: -0.05, delivery: '2-3 дня', logo: 'wb', url: `https://www.wildberries.ru/catalog/0/search.aspx?search=${encodedName}` },
    { name: 'DNS', variance: 0.02, delivery: 'Сегодня', logo: 'dns', url: `https://www.dns-shop.ru/search/?q=${encodedName}` },
    { name: 'Yandex Market', variance: -0.02, delivery: 'Сегодня', logo: 'yandex', url: `https://market.yandex.ru/search?text=${encodedName}` },
    { name: 'Citilink', variance: 0.01, delivery: 'Завтра', logo: 'citilink', url: `https://www.citilink.ru/search/?text=${encodedName}` },
    { name: 'M.Video', variance: 0.03, delivery: 'Сегодня', logo: 'mvideo', url: `https://www.mvideo.ru/product-list-page?q=${encodedName}` },
  ];

  const selectedStores = stores.sort(() => 0.5 - Math.random()).slice(0, 3 + Math.floor(Math.random() * 2));

  return selectedStores
    .map((store, idx) => ({
      id: `offer-${idx}`,
      name: store.name,
      price: Math.floor(basePrice * (1 + store.variance + (Math.random() * 0.04 - 0.02))),
      delivery: store.delivery,
      rating: 4.5 + Math.random() * 0.5,
      logo: store.logo,
      url: store.url,
    }))
    .sort((a, b) => a.price - b.price);
};

export const MOCK_PRODUCTS: Product[] = [
  // Laptops
  {
    id: 'lp-1',
    name: 'MacBook Air 15 M3',
    category: 'laptop',
    image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca4?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca4?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?auto=format&fit=crop&w=800&q=80'
    ],
    price: 149990,
    rating: 4.8,
    reviewCount: 1240,
    reviews: generateReviews('lp-1', 5),
    tags: ['Выбор редакции', 'Бесшумный'],
    description: 'Идеальный портативный ноутбук с невероятным временем автономной работы и потрясающим дисплеем Liquid Retina.',
    priceHistory: [
      { date: 'Янв', price: 155000, shopName: 'Re:Store' },
      { date: 'Фев', price: 149990, shopName: 'M.Video' },
      { date: 'Мар', price: 145000, shopName: 'Yandex Market' },
    ],
    specs: {
      cpu: { label: 'Процессор', value: 'Apple M3', important: true },
      ram: { label: 'ОЗУ', value: 16, unit: 'ГБ', important: true },
      storage: { label: 'SSD', value: 512, unit: 'ГБ' },
      screen: { label: 'Экран', value: '15.3 Retina' },
    },
    offers: [] // Populated below
  },
  {
    id: 'lp-2',
    name: 'ASUS ROG Zephyrus G14',
    category: 'laptop',
    image: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?auto=format&fit=crop&w=800&q=80',
    images: [
        'https://images.unsplash.com/photo-1603302576837-37561b2e2302?auto=format&fit=crop&w=800&q=80'
    ],
    price: 185000,
    rating: 4.6,
    reviewCount: 850,
    reviews: generateReviews('lp-2', 4),
    tags: ['Лучший компактный'],
    description: 'Мощь и портативность. OLED экран и топовые характеристики в корпусе, который поместится в любой рюкзак.',
    priceHistory: [
      { date: 'Янв', price: 195000, shopName: 'DNS' },
      { date: 'Фев', price: 190000, shopName: 'Citilink' },
      { date: 'Мар', price: 185000, shopName: 'Ozon' },
    ],
    specs: {
      cpu: { label: 'Процессор', value: 'Ryzen 9', important: true },
      ram: { label: 'ОЗУ', value: 32, unit: 'ГБ', important: true },
      gpu: { label: 'Видеокарта', value: 'RTX 4070', important: true },
    },
    offers: []
  },
  
  // Headphones
  {
    id: 'hp-1',
    name: 'Sony WH-1000XM5',
    category: 'headphones',
    image: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&w=800&q=80',
    images: ['https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&w=800&q=80'],
    price: 34990,
    rating: 4.7,
    reviewCount: 5600,
    reviews: generateReviews('hp-1', 6),
    tags: ['Шумоподавление', 'Комфорт'],
    description: 'Лучшее в отрасли шумоподавление с двумя процессорами, управляющими 8 микрофонами.',
    priceHistory: [
       { date: 'Янв', price: 39990, shopName: 'Sony Store' },
       { date: 'Фев', price: 34990, shopName: 'Ozon' }
    ],
    specs: {
       type: { label: 'Тип', value: 'Полноразмерные', important: true },
       anc: { label: 'ANC', value: 'Да', important: true },
       battery: { label: 'Батарея', value: 30, unit: 'ч' },
    },
    offers: []
  },
  {
    id: 'hp-2',
    name: 'AirPods Max',
    category: 'headphones',
    image: 'https://images.unsplash.com/photo-1628202926206-c63a34b1618f?auto=format&fit=crop&w=800&q=80',
    images: ['https://images.unsplash.com/photo-1628202926206-c63a34b1618f?auto=format&fit=crop&w=800&q=80'],
    price: 64990,
    rating: 4.5,
    reviewCount: 3200,
    reviews: generateReviews('hp-2', 5),
    tags: ['Премиум', 'Пространственное аудио'],
    description: 'Идеальный баланс захватывающего Hi-Fi звука и магии AirPods.',
    priceHistory: [
       { date: 'Янв', price: 69990, shopName: 'Re:Store' },
       { date: 'Мар', price: 64990, shopName: 'M.Video' }
    ],
    specs: {
       type: { label: 'Тип', value: 'Полноразмерные' },
       anc: { label: 'ANC', value: 'Активное', important: true },
       battery: { label: 'Батарея', value: 20, unit: 'ч' },
    },
    offers: []
  },

  // Smartwatches
  {
    id: 'sw-1',
    name: 'Apple Watch Ultra 2',
    category: 'smartwatch',
    image: 'https://images.unsplash.com/photo-1544117519-31a4b719223d?auto=format&fit=crop&w=800&q=80',
    images: ['https://images.unsplash.com/photo-1544117519-31a4b719223d?auto=format&fit=crop&w=800&q=80'],
    price: 89990,
    rating: 4.9,
    reviewCount: 950,
    reviews: generateReviews('sw-1', 4),
    tags: ['Прочные', 'Для дайвинга'],
    description: 'Самые прочные и способные Apple Watch. Созданы для выносливости и приключений.',
    priceHistory: [
        { date: 'Янв', price: 89990, shopName: 'Re:Store' }
    ],
    specs: {
        case: { label: 'Корпус', value: 'Титан', important: true },
        battery: { label: 'Батарея', value: 36, unit: 'ч' },
        water: { label: 'Водонепр.', value: 100, unit: 'м', important: true },
    },
    offers: []
  },

  // Smartphones
  {
    id: 'sm-1',
    name: 'iPhone 15 Pro Max',
    category: 'smartphone',
    image: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=800&q=80',
    images: ['https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=800&q=80'],
    price: 139990,
    rating: 4.8,
    reviewCount: 4500,
    reviews: generateReviews('sm-1', 8),
    tags: ['Титан', 'Лучшая камера'],
    description: 'Выкован из титана и оснащен революционным чипом A17 Pro.',
    priceHistory: [
        { date: 'Янв', price: 145000, shopName: 'Re:Store' }
    ],
    specs: {
        chip: { label: 'Чип', value: 'A17 Pro', important: true },
        camera: { label: 'Камера', value: 48, unit: 'МП' },
        zoom: { label: 'Зум', value: '5x', important: true },
    },
    offers: []
  },
  {
    id: 'sm-2',
    name: 'Samsung Galaxy S24 Ultra',
    category: 'smartphone',
    image: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?auto=format&fit=crop&w=800&q=80',
    images: ['https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?auto=format&fit=crop&w=800&q=80'],
    price: 129990,
    rating: 4.7,
    reviewCount: 3200,
    reviews: generateReviews('sm-2', 5),
    tags: ['AI функции', 'S-Pen'],
    description: 'Откройте новые способы творить и общаться с Galaxy AI.',
    priceHistory: [
        { date: 'Янв', price: 135000, shopName: 'Samsung Official' }
    ],
    specs: {
        chip: { label: 'Чип', value: 'Snapdragon 8 Gen 3', important: true },
        camera: { label: 'Камера', value: 200, unit: 'МП' },
        pen: { label: 'Стилус', value: 'В комплекте', important: true },
    },
    offers: []
  },

  // GPUs
  {
    id: 'gp-1',
    name: 'NVIDIA RTX 4090',
    category: 'gpu',
    image: 'https://images.unsplash.com/photo-1591488320449-011701bb6704?auto=format&fit=crop&w=800&q=80',
    images: ['https://images.unsplash.com/photo-1591488320449-011701bb6704?auto=format&fit=crop&w=800&q=80'],
    price: 240000,
    rating: 4.9,
    reviewCount: 300,
    reviews: generateReviews('gp-1', 3),
    tags: ['Максимальная мощь'],
    description: 'Король видеокарт. Справится с любой задачей.',
    priceHistory: [
      { date: 'Янв', price: 250000, shopName: 'DNS' },
      { date: 'Фев', price: 245000, shopName: 'Regard' },
      { date: 'Мар', price: 240000, shopName: 'Lime Store' },
    ],
    specs: {
      vram: { label: 'VRAM', value: 24, unit: 'ГБ', important: true },
      power: { label: 'TDP', value: 450, unit: '\u0412\u0442' },
    },
    offers: []
  }
];

// Hydrate products with offers
MOCK_PRODUCTS.forEach(p => {
  p.offers = generateOffers(p.price, p.name);
  p.price = p.offers[0].price; // Ensure main price matches best offer
});
