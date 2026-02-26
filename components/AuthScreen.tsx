import React, { useState } from 'react';
import { User } from '../types';
import { Mail, Lock, User as UserIcon, ArrowRight, Github, Chrome } from 'lucide-react';

interface AuthScreenProps {
  onLogin: (user: User) => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });

  const generateUser = (data: Partial<User>): User => ({
    id: 'u-' + Math.random().toString(36).substr(2, 9),
    name: data.name || 'User',
    email: data.email || 'user@example.com',
    avatar: data.avatar || `https://i.pravatar.cc/150?u=${data.email}`,
    cart: [],
    wishlist: [],
    history: [],
    bonuses: 0,
    status: 'Silver'
  });

  const getUsersFromStorage = (): any[] => {
    try {
      const usersStr = localStorage.getItem('nex_users');
      return usersStr ? JSON.parse(usersStr) : [];
    } catch {
      return [];
    }
  };

  const saveUserToStorage = (user: User, password?: string) => {
    const users = getUsersFromStorage();
    // Check if user already exists to update or add
    const existingIdx = users.findIndex(u => u.email === user.email);
    
    const userToSave = { ...user, ...(password ? { password } : {}) };
    
    if (existingIdx >= 0) {
      users[existingIdx] = { ...users[existingIdx], ...userToSave };
    } else {
      users.push(userToSave);
    }
    
    localStorage.setItem('nex_users', JSON.stringify(users));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    setTimeout(() => {
      const users = getUsersFromStorage();

      if (isLogin) {
        // Login Logic
        const foundUser = users.find(u => u.email === formData.email && u.password === formData.password);
        if (foundUser) {
          const userData = { ...foundUser };
          delete userData.password;
          localStorage.setItem('nex_current_user', JSON.stringify(userData));
          onLogin(userData as User);
        } else {
          setError('Неверный email или пароль');
          setIsLoading(false);
        }
      } else {
        // Registration Logic
        if (users.find(u => u.email === formData.email)) {
           setError('Пользователь с таким email уже существует');
           setIsLoading(false);
           return;
        }
        
        const newUser = generateUser({ name: formData.name, email: formData.email });
        saveUserToStorage(newUser, formData.password);
        
        localStorage.setItem('nex_current_user', JSON.stringify(newUser));
        onLogin(newUser);
      }
    }, 800);
  };

  const handleSocialLogin = (provider: 'Google' | 'GitHub') => {
     setIsLoading(true);
     setTimeout(() => {
        // Simulate a stable social user identity
        const email = `user@${provider.toLowerCase()}.com`;
        const users = getUsersFromStorage();
        let socialUser = users.find(u => u.email === email);

        if (!socialUser) {
           socialUser = generateUser({ 
              name: `${provider} User`, 
              email: email,
              avatar: provider === 'GitHub' 
                ? 'https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80' 
                : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
           });
           saveUserToStorage(socialUser);
        }

        // Strip internal fields like password if any (though social users usually don't have one here)
        const sessionUser = { ...socialUser };
        delete sessionUser.password;

        localStorage.setItem('nex_current_user', JSON.stringify(sessionUser));
        onLogin(sessionUser as User);
     }, 1000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-lime-200 rounded-full blur-[100px] opacity-30"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-200 rounded-full blur-[100px] opacity-30"></div>

      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden relative z-10 flex flex-col">
        <div className="p-8 pb-0 text-center">
          <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-lime-400 font-bold shadow-lg mx-auto mb-6 text-xl">
            1S
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            {isLogin ? 'С возвращением!' : 'Создать аккаунт'}
          </h1>
          <p className="text-slate-500 text-sm">
            {isLogin 
              ? 'Введите свои данные для входа.' 
              : 'Регистрация займет меньше минуты.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-4">
          {!isLogin && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase ml-1">Имя</label>
              <div className="relative group">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" size={18} />
                <input 
                  type="text" 
                  required
                  placeholder="Иван Иванов"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 outline-none focus:border-slate-900 focus:bg-white transition-all text-sm font-medium"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase ml-1">Email</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" size={18} />
              <input 
                type="email" 
                required
                placeholder="email@example.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 outline-none focus:border-slate-900 focus:bg-white transition-all text-sm font-medium"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase ml-1">Пароль</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" size={18} />
              <input 
                type="password" 
                required
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 outline-none focus:border-slate-900 focus:bg-white transition-all text-sm font-medium"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
              />
            </div>
          </div>
          
          {error && <div className="text-red-500 text-sm font-bold text-center">{error}</div>}

          <button 
            type="submit" 
            disabled={isLoading}
            className="mt-4 bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 active:scale-[0.98] transition-all shadow-lg shadow-slate-900/20 flex items-center justify-center gap-2"
          >
            {isLoading ? (
               <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            ) : (
               <>
                 {isLogin ? 'Войти' : 'Зарегистрироваться'} <ArrowRight size={18} />
               </>
            )}
          </button>
        </form>

        <div className="px-8 pb-8">
           <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                 <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                 <span className="bg-white px-2 text-slate-400">или войти через</span>
              </div>
           </div>

           <div className="grid grid-cols-2 gap-3">
              <button onClick={() => handleSocialLogin('Google')} type="button" className="flex items-center justify-center gap-2 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                 <Chrome size={18} className="text-slate-900" />
                 <span className="text-sm font-bold text-slate-600">Google</span>
              </button>
              <button onClick={() => handleSocialLogin('GitHub')} type="button" className="flex items-center justify-center gap-2 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                 <Github size={18} className="text-slate-900" />
                 <span className="text-sm font-bold text-slate-600">Github</span>
              </button>
           </div>

           <div className="mt-6 text-center">
              <button 
                type="button"
                onClick={() => { setIsLogin(!isLogin); setError(''); }}
                className="text-sm text-slate-600 font-medium hover:text-slate-900 transition-colors"
              >
                 {isLogin ? 'Нет аккаунта? ' : 'Уже есть аккаунт? '}
                 <span className="font-bold underline decoration-lime-400 decoration-2 underline-offset-2">
                    {isLogin ? 'Создать' : 'Войти'}
                 </span>
              </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;