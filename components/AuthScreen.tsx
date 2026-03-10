import React, { useState } from 'react';
import { User } from '../types';
import { Mail, Lock, User as UserIcon, ArrowRight } from 'lucide-react';
import { loginUser, registerUser } from '../services/authService';

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
    password: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const name = formData.name.trim();
    const email = formData.email.trim().toLowerCase();
    const password = formData.password;

    if (!isLogin && name.length < 2) {
      setError('Введите имя (минимум 2 символа).');
      return;
    }
    if (!email) {
      setError('Введите email.');
      return;
    }
    if (password.length < 6) {
      setError('Пароль должен быть не короче 6 символов.');
      return;
    }

    setIsLoading(true);
    try {
      const user = isLogin ? await loginUser(email, password) : await registerUser(name, email, password);
      localStorage.setItem('nex_current_user', JSON.stringify(user));
      onLogin(user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка авторизации.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-lime-200 rounded-full blur-[100px] opacity-30" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-200 rounded-full blur-[100px] opacity-30" />

      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden relative z-10 flex flex-col">
        <div className="p-8 pb-0 text-center">
          <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-lime-400 font-bold shadow-lg mx-auto mb-6 text-xl">
            1S
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            {isLogin ? 'С возвращением!' : 'Создать аккаунт'}
          </h1>
          <p className="text-slate-500 text-sm">
            {isLogin ? 'Введите свои данные для входа.' : 'Регистрация займет меньше минуты.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-4">
          {!isLogin && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase ml-1">Имя</label>
              <div className="relative group">
                <UserIcon
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors"
                  size={18}
                />
                <input
                  type="text"
                  required
                  placeholder="Иван Иванов"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 outline-none focus:border-slate-900 focus:bg-white transition-all text-sm font-medium"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase ml-1">Email</label>
            <div className="relative group">
              <Mail
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors"
                size={18}
              />
              <input
                type="email"
                required
                placeholder="email@example.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 outline-none focus:border-slate-900 focus:bg-white transition-all text-sm font-medium"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase ml-1">Пароль</label>
            <div className="relative group">
              <Lock
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors"
                size={18}
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 outline-none focus:border-slate-900 focus:bg-white transition-all text-sm font-medium"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                {isLogin ? 'Войти' : 'Зарегистрироваться'} <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="px-8 pb-8 mt-2 text-center">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
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
  );
};

export default AuthScreen;
