import { Scenario, User } from './types';

export const MOCK_USER: User = {
  id: 'u1',
  name: 'Алексей Смирнов',
  email: 'alex.smirnov@example.ru',
  avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  cart: [],
  wishlist: [],
  history: [],
  bonuses: 0,
  status: 'Silver'
};

export const SCENARIOS: Scenario[] = [
  { id: 'coding', label: 'Программирование', icon: '💻', description: 'Много ОЗУ, мощный процессор', promptModifier: '' },
  { id: 'gaming', label: 'Гейминг', icon: '🎮', description: 'Максимальная мощность видеокарты', promptModifier: '' },
];
