import React, { useEffect, useRef, useState } from 'react';
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
  Camera,
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

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const MIN_AVATAR_DIMENSION = 100;

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
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSuccessRingVisible, setIsSuccessRingVisible] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [avatarAnimKey, setAvatarAnimKey] = useState(0);

  const dropzoneRef = useRef<HTMLLabelElement | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const hideProgressTimerRef = useRef<number | null>(null);
  const successTimerRef = useRef<number | null>(null);
  const shakeTimerRef = useRef<number | null>(null);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    setNameInput(user.name);
  }, [user.name]);

  useEffect(() => {
    if (previewUrl) {
      setPreviewUrl(null);
    }
  }, [user.avatar]);

  useEffect(() => {
    setAvatarAnimKey((prev) => prev + 1);
  }, [previewUrl, user.avatar]);

  useEffect(() => {
    if (!isOpen) return;
    const handleWindowDragOver = (event: DragEvent) => {
      if (!event.dataTransfer || !Array.from(event.dataTransfer.types).includes('Files')) return;
      if (dropzoneRef.current && event.target instanceof Node && dropzoneRef.current.contains(event.target)) return;
      event.preventDefault();
    };
    const handleWindowDrop = (event: DragEvent) => {
      if (!event.dataTransfer || !Array.from(event.dataTransfer.types).includes('Files')) return;
      const isInside = dropzoneRef.current && event.target instanceof Node && dropzoneRef.current.contains(event.target);
      if (isInside) return;
      event.preventDefault();
      if (event.dataTransfer.files.length > 0) {
        dragCounterRef.current = 0;
        setIsDragActive(false);
        setProfileError('Перетащите файл в область загрузки.');
        triggerShake();
      }
    };
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
      }
      if (hideProgressTimerRef.current) {
        window.clearTimeout(hideProgressTimerRef.current);
      }
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
      }
      if (shakeTimerRef.current) {
        window.clearTimeout(shakeTimerRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const getProductsByIds = (ids: string[]) =>
    ids.map((id) => products.find((p) => p.id === id)).filter(Boolean) as Product[];

  const wishlistItems = getProductsByIds(user.wishlist);
  const historyItems = getProductsByIds(user.history);

  const formatPrice = (price: number) => price.toLocaleString('ru-RU');
  const displayAvatar = previewUrl ?? user.avatar;

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

  const triggerShake = () => {
    setIsShaking(true);
    if (shakeTimerRef.current) {
      window.clearTimeout(shakeTimerRef.current);
    }
    shakeTimerRef.current = window.setTimeout(() => setIsShaking(false), 450);
  };

  const startProgressSimulation = () => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
    }
    if (hideProgressTimerRef.current) {
      window.clearTimeout(hideProgressTimerRef.current);
    }
    setUploadProgress(8);
    progressTimerRef.current = window.setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) return prev;
        const increment = Math.floor(6 + Math.random() * 10);
        return Math.min(90, prev + increment);
      });
    }, 240);
  };

  const finishProgressSimulation = (isSuccess: boolean) => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (hideProgressTimerRef.current) {
      window.clearTimeout(hideProgressTimerRef.current);
    }
    if (isSuccess) {
      setUploadProgress(100);
      hideProgressTimerRef.current = window.setTimeout(() => setUploadProgress(0), 800);
    } else {
      setUploadProgress(0);
    }
  };

  const readAvatarFile = (file: File) =>
    new Promise<{ dataUrl: string; width: number; height: number }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!dataUrl) {
          reject(new Error('empty'));
          return;
        }
        const img = new Image();
        img.onload = () => {
          resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = () => reject(new Error('invalid'));
        img.src = dataUrl;
      };
      reader.onerror = () => reject(new Error('read'));
      reader.readAsDataURL(file);
    });

  const validateAvatarFile = async (file: File) => {
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      return { error: 'Разрешены только JPG, PNG, WEBP или GIF.' };
    }
    if (file.size > MAX_AVATAR_SIZE) {
      return { error: 'Размер файла не должен превышать 5 МБ.' };
    }
    if (file.size === 0) {
      return { error: 'Файл пуст.' };
    }
    try {
      const { dataUrl, width, height } = await readAvatarFile(file);
      if (width < MIN_AVATAR_DIMENSION || height < MIN_AVATAR_DIMENSION) {
        return { error: `Минимальное разрешение — ${MIN_AVATAR_DIMENSION}×${MIN_AVATAR_DIMENSION} px.` };
      }
      return { dataUrl };
    } catch (error) {
      return { error: 'Файл поврежден или не является изображением.' };
    }
  };

  const handleNewAvatarFile = async (file: File) => {
    if (isUploadingAvatar) {
      setProfileError('Дождитесь завершения загрузки.');
      triggerShake();
      return;
    }
    if (isSuccessRingVisible) {
      setIsSuccessRingVisible(false);
    }
    const result = await validateAvatarFile(file);
    if (result.error) {
      setProfileError(result.error);
      triggerShake();
      return;
    }

    setProfileError('');
    if (result.dataUrl) {
      setPreviewUrl(result.dataUrl);
    }
    setIsUploadingAvatar(true);
    startProgressSimulation();
    const updated = await uploadUserAvatar(user.id, file);
    setIsUploadingAvatar(false);
    if (!updated) {
      finishProgressSimulation(false);
      setProfileError('Не удалось загрузить аватар.');
      setPreviewUrl(null);
      triggerShake();
      return;
    }
    finishProgressSimulation(true);
    onUpdateUser(updated);
    setIsSuccessRingVisible(true);
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current);
    }
    successTimerRef.current = window.setTimeout(() => setIsSuccessRingVisible(false), 900);
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    await handleNewAvatarFile(file);
  };

  const handleDragEnter = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleDragEnd = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragActive(false);
  };

  const handleAvatarDrop = async (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handleNewAvatarFile(file);
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
      <style>{`
        .avatar-pop {
          animation: avatar-pop 480ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: transform, opacity;
        }
        @keyframes avatar-pop {
          0% { transform: scale(0.86); opacity: 0.7; }
          60% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .avatar-success {
          animation: avatar-success 900ms ease-out;
        }
        @keyframes avatar-success {
          0% { opacity: 0; box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55); }
          35% { opacity: 1; box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.35); }
          100% { opacity: 0; box-shadow: 0 0 0 12px rgba(34, 197, 94, 0); }
        }
        .avatar-shake {
          animation: avatar-shake 450ms ease-in-out;
        }
        @keyframes avatar-shake {
          0% { transform: translateX(0); }
          20% { transform: translateX(-4px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
          100% { transform: translateX(0); }
        }
      `}</style>
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
          <div className="flex flex-col items-center">
            <label
              ref={dropzoneRef}
              htmlFor={`avatar-upload-${user.id}`}
              className={`group relative w-24 h-24 rounded-full cursor-pointer select-none ${
                isUploadingAvatar ? 'pointer-events-none opacity-80' : ''
              } ${isShaking ? 'avatar-shake' : ''}`}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDragEnd={handleDragEnd}
              onDrop={handleAvatarDrop}
            >
              <span
                className={`absolute -inset-1 rounded-full border-2 border-dashed border-slate-300/80 transition-opacity ${
                  isDragActive ? 'opacity-100 animate-spin' : 'opacity-0'
                }`}
              />
              <span
                className={`absolute -inset-1 rounded-full ring-2 ring-lime-400/80 opacity-0 ${
                  isSuccessRingVisible ? 'avatar-success' : ''
                }`}
              />
              <span className="relative w-24 h-24 rounded-full overflow-hidden bg-slate-100 border-4 border-white shadow-md flex items-center justify-center">
                <img
                  key={avatarAnimKey}
                  src={displayAvatar}
                  alt={user.name}
                  className="w-full h-full object-cover avatar-pop"
                  draggable={false}
                />
                {!isUploadingAvatar && (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-900/55 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={18} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide">сменить фото</span>
                  </span>
                )}
                {isUploadingAvatar && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/70">
                    <span className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                  </span>
                )}
              </span>
            </label>
            <input
              id={`avatar-upload-${user.id}`}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarChange}
            />
            {uploadProgress > 0 && (
              <div className="mt-2 w-24">
                <div className="h-1 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-lime-500 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-slate-400 text-center">
                  {uploadProgress < 100 ? 'Загрузка…' : 'Готово'}
                </div>
              </div>
            )}
            <div className="mt-2 text-[10px] text-slate-400 text-center leading-snug">
              JPG · PNG · WEBP · GIF
              <br />
              до 5 МБ · мин. 100×100
            </div>
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

