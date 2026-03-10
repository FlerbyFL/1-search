import React, { useState } from 'react';
import { User, Product } from '../types';
import { X, ShoppingBag, Heart, Clock, Trash2, ArrowRight, User as UserIcon, Award, Gift, LogOut } from 'lucide-react';

interface UserDrawerProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onRemoveFromCart: (id: string) => void;
  onRemoveFromWishlist: (id: string) => void;
  onSelectProduct: (product: Product) => void;
}

const STATUS_LABELS: Record<User["status"], string> = {
  Silver: "Серебро",
  Gold: "Золото",
  Platinum: "Платина",
};

const UserDrawer: React.FC<UserDrawerProps> = ({
  user, isOpen, onClose, products, onRemoveFromCart, onRemoveFromWishlist, onSelectProduct,
}) => {
  const [activeTab, setActiveTab] = useState<'cart' | 'wishlist' | 'history'>('cart');

  if (!isOpen) return null;

  const getProductsByIds = (ids: string[]) =>
    ids.map((id) => products.find((p) => p.id === id)).filter(Boolean) as Product[];

  const cartItems = getProductsByIds(user.cart);
  const wishlistItems = getProductsByIds(user.wishlist);
  const historyItems = getProductsByIds(user.history);

  const cartTotal = cartItems.reduce((sum, item) => sum + item.price, 0);
  const formatPrice = (price: number) => price.toLocaleString('ru-RU');

  const handleLogout = () => {
    localStorage.removeItem('nex_current_user');
    window.location.reload();
  };

  const renderProductList = (items: Product[], type: 'cart' | 'wishlist' | 'history') => (
    <div className="space-y-4">
      {items.length === 0 && (
        <div className="text-center py-10 text-slate-400">
          <p>Пока здесь пусто.</p>
        </div>
      )}
      {items.map((item) => (
        <div key={item.id} className="flex gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100 group hover:border-slate-300 transition-colors">
          <div
            className="w-20 h-20 bg-white rounded-lg p-2 flex items-center justify-center cursor-pointer"
            onClick={() => { onClose(); onSelectProduct(item); }}
          >
            <img src={item.image} alt={item.name} className="w-full h-full object-contain mix-blend-multiply" />
          </div>
          <div className="flex-1 min-w-0">
            <h4
              className="font-bold text-slate-800 text-sm truncate cursor-pointer hover:text-slate-900"
              onClick={() => { onClose(); onSelectProduct(item); }}
            >
              {item.name}
            </h4>
            <div className="text-slate-900 font-bold mt-1">{formatPrice(item.price)} ₽</div>
          </div>
          <div className="flex flex-col justify-between items-end">
            {type !== 'history' && (
              <button
                onClick={() => (type === 'cart' ? onRemoveFromCart(item.id) : onRemoveFromWishlist(item.id))}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex justify-between items-start mb-4">
            <h2 className="font-bold text-slate-900 text-xl flex items-center gap-2">
              <UserIcon size={20} className="text-lime-600" />
              Личный кабинет
            </h2>
            <div className="flex gap-2">
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors text-slate-400"
                title="Выйти"
              >
                <LogOut size={20} />
              </button>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-800">
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <img src={user.avatar} alt={user.name} className="w-16 h-16 rounded-full border-4 border-white shadow-md" />
            <div>
              <div className="font-bold text-slate-900 text-lg">{user.name}</div>
              <div className="text-xs text-slate-500">{user.email}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
              <div className="bg-yellow-50 p-2 rounded-lg text-yellow-600">
                <Award size={20} />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold">Статус</div>
                <div className="text-sm font-bold text-slate-900">{STATUS_LABELS[user.status]}</div>
              </div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
              <div className="bg-purple-50 p-2 rounded-lg text-purple-600">
                <Gift size={20} />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-bold">Бонусы</div>
                <div className="text-sm font-bold text-slate-900">{user.bonuses}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex border-b border-slate-100">
          <button
            onClick={() => setActiveTab('cart')}
            className={`flex-1 py-4 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'cart' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <ShoppingBag size={16} /> Корзина ({cartItems.length})
          </button>
          <button
            onClick={() => setActiveTab('wishlist')}
            className={`flex-1 py-4 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'wishlist' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <Heart size={16} /> Избранное
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-4 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'history' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <Clock size={16} /> История
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {activeTab === 'cart' && renderProductList(cartItems, 'cart')}
          {activeTab === 'wishlist' && renderProductList(wishlistItems, 'wishlist')}
          {activeTab === 'history' && renderProductList(historyItems, 'history')}
        </div>

        {activeTab === 'cart' && cartItems.length > 0 && (
          <div className="p-6 border-t border-slate-100 bg-slate-50">
            <div className="flex justify-between items-end mb-4">
              <span className="text-sm text-slate-500 font-medium">Итого</span>
              <span className="text-2xl font-bold text-slate-900">{formatPrice(cartTotal)} ₽</span>
            </div>
            <button className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-slate-900/20">
              Оформить заказ <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserDrawer;
