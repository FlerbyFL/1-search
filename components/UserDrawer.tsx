import React, { useEffect, useState } from 'react';
import { User, Product } from '../types';
import { updateUserProfile, uploadUserAvatar } from '../services/userService';
import {
  X,
  Heart,
  Clock,
  Trash2,
  ArrowLeft,
  User as UserIcon,
  Award,
  Gift,
  LogOut,
} from 'lucide-react';

interface UserDrawerProps {
  user: User;
  isOpen: boolean;
  variant?: 'drawer' | 'page';
  onClose: (options?: { skipUrl?: boolean }) => void;
  products: Product[];
  onRemoveFromWishlist: (id: string) => void;
  onSelectProduct: (product: Product) => void;
  onUpdateUser: (user: User) => void;
}

const STATUS_LABELS: Record<User['status'], string> = {
  Silver: 'Серебро',
  Gold: 'Золото',
  Platinum: 'Платина',
};

const UserDrawer: React.FC<UserDrawerProps> = ({
  user,
  isOpen,
  variant = 'drawer',
  onClose,
  products,
  onRemoveFromWishlist,
  onSelectProduct,
  onUpdateUser,
}) => {
  const [activeTab, setActiveTab] = useState<'wishlist' | 'history'>('wishlist');
  const [nameInput, setNameInput] = useState(user.name);
  const [profileError, setProfileError] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  useEffect(() => {
    setNameInput(user.name);
  }, [user.name]);

  if (!isOpen) return null;

  const getProductsByIds = (ids: string[]) =>
    ids.map((id) => products.find((p) => p.id === id)).filter(Boolean) as Product[];

  const wishlistItems = getProductsByIds(user.wishlist);
  const historyItems = getProductsByIds(user.history);

  const formatPrice = (price: number) => price.toLocaleString('ru-RU');

  const handleLogout = () => {
    localStorage.removeItem('nex_current_user');
    window.location.reload();
  };

  const handleSaveProfile = async () => {
    const trimmed = nameInput.trim();
    if (trimmed.length < 2) {
      setProfileError('Имя должно быть не короче 2 символов.');
      return;
    }
    setProfileError('');
    setIsSavingProfile(true);
    const updated = await updateUserProfile(user.id, { name: trimmed });
    setIsSavingProfile(false);
    if (!updated) {
      setProfileError('Не удалось сохранить профиль.');
      return;
    }
    onUpdateUser(updated);
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    if (!file.type.startsWith('image/')) {
      setProfileError('Можно загружать только изображения.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileError('Размер файла не должен превышать 2 МБ.');
      return;
    }

    setProfileError('');
    setIsUploadingAvatar(true);
    const updated = await uploadUserAvatar(user.id, file);
    setIsUploadingAvatar(false);
    if (!updated) {
      setProfileError('Не удалось загрузить аватар.');
      return;
    }
    onUpdateUser(updated);
  };

  const renderProductList = (items: Product[], type: 'wishlist' | 'history') => {
    const closeForSelect = () => onClose(variant === 'page' ? { skipUrl: true } : undefined);
    return (
    <div className="space-y-4">
      {items.length === 0 && (
        <div className="text-center py-10 text-slate-400">
          <p>Пока здесь пусто.</p>
        </div>
      )}
      {items.map((item) => (
        <div
          key={item.id}
          className="flex gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100 group hover:border-slate-300 transition-colors"
        >
          <div
            className="w-20 h-20 bg-white rounded-lg p-2 flex items-center justify-center cursor-pointer"
            onClick={() => {
              closeForSelect();
              onSelectProduct(item);
            }}
          >
            <img src={item.image} alt={item.name} className="w-full h-full object-contain mix-blend-multiply" />
          </div>
          <div className="flex-1 min-w-0">
            <h4
              className="font-bold text-slate-800 text-sm truncate cursor-pointer hover:text-slate-900"
              onClick={() => {
                closeForSelect();
                onSelectProduct(item);
              }}
            >
              {item.name}
            </h4>
            <div className="text-slate-900 font-bold mt-1">{formatPrice(item.price)} ₽</div>
          </div>
          <div className="flex flex-col justify-between items-end">
            {type === 'wishlist' && (
              <button
                onClick={() => onRemoveFromWishlist(item.id)}
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
  };

  const isPage = variant === 'page';

  const content = (
    <div className={`relative bg-white flex flex-col ${isPage ? 'min-h-[calc(100vh-8rem)]' : 'h-full'}`}>
      <div className="p-6 border-b border-slate-100 bg-slate-50/50">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            {isPage && (
              <button
                onClick={() => onClose()}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 hover:text-slate-900"
                title="Назад"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <h2 className="font-bold text-slate-900 text-xl flex items-center gap-2">
              <UserIcon size={20} className="text-lime-600" />
              Личный кабинет
            </h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors text-slate-400"
              title="Выйти"
            >
              <LogOut size={20} />
            </button>
            {!isPage && (
              <button
                onClick={() => onClose()}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-800"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-start gap-4 mb-4">
          <div className="relative">
            <img src={user.avatar} alt={user.name} className="w-16 h-16 rounded-full border-4 border-white shadow-md" />
            <label
              htmlFor={`avatar-upload-${user.id}`}
              className={`absolute -bottom-2 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded-full bg-white border border-slate-200 shadow-sm cursor-pointer ${
                isUploadingAvatar ? 'opacity-60 pointer-events-none' : 'hover:border-slate-300'
              }`}
            >
              {isUploadingAvatar ? 'Загрузка...' : 'Сменить'}
            </label>
            <input
              id={`avatar-upload-${user.id}`}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                className="w-full sm:max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                placeholder="Имя"
              />
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={isSavingProfile || nameInput.trim() === user.name}
                className="px-3 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSavingProfile ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
            <div className="text-xs text-slate-500 mt-1">{user.email}</div>
            {profileError && <div className="text-xs text-red-500 mt-2">{profileError}</div>}
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
          onClick={() => setActiveTab('wishlist')}
          className={`flex-1 py-4 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'wishlist'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Heart size={16} /> Избранное
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-4 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'history'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock size={16} /> История
        </button>
      </div>

      <div className={`flex-1 ${isPage ? 'overflow-visible' : 'overflow-y-auto'} p-6 bg-white`}>
        {activeTab === 'wishlist' && renderProductList(wishlistItems, 'wishlist')}
        {activeTab === 'history' && renderProductList(historyItems, 'history')}
      </div>
    </div>
  );

  if (isPage) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => onClose()} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {content}
      </div>
    </div>
  );
};

export default UserDrawer;

