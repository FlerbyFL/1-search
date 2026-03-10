import React from 'react';
import { Product } from '../types';
import { X, Trash2 } from 'lucide-react';

interface ComparisonViewProps {
  products: Product[];
  onRemove: (id: string) => void;
  onClose: () => void;
}

const ComparisonView: React.FC<ComparisonViewProps> = ({ products, onRemove, onClose }) => {
  if (products.length === 0) return null;

  const allSpecKeys = Array.from(new Set(products.flatMap((p) => Object.keys(p.specs)))) as string[];
  const getSpecLabel = (key: string): string => {
    for (const product of products) {
      const label = product.specs[key]?.label;
      if (label) return label;
    }
    return key.replace(/_/g, ' ');
  };

  const formatPrice = (price: number) => price.toLocaleString('ru-RU');

  return (
    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-xl z-[60] overflow-auto animate-in slide-in-from-bottom-10 duration-300">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8 sticky top-0 bg-white/80 backdrop-blur-xl py-4 z-20 border-b border-slate-100 rounded-2xl px-6 shadow-sm mt-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Сравнение товаров</h2>
            <p className="text-slate-500 text-sm">Выбрано товаров: {products.length}</p>
          </div>
          <button
            onClick={onClose}
            className="group flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-all"
          >
            <span className="text-sm">Закрыть</span>
            <div className="bg-white p-1 rounded-full group-hover:bg-slate-50">
              <X size={16} />
            </div>
          </button>
        </div>

        <div className="overflow-x-auto pb-10 custom-scrollbar bg-white rounded-3xl shadow-xl border border-slate-100">
          <table className="w-full min-w-[1000px] border-collapse table-fixed">
            <thead>
              <tr>
                <th className="w-48 p-6 text-left bg-white sticky left-0 z-10 border-b border-r border-slate-100">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Параметры</span>
                </th>
                {products.map((product) => (
                  <th key={product.id} className="w-64 p-6 text-left align-top border-b border-r border-slate-100 last:border-r-0 bg-slate-50/30">
                    <div className="relative group">
                      <button
                        onClick={() => onRemove(product.id)}
                        className="absolute -top-3 -right-3 p-2 bg-white text-slate-400 hover:text-red-500 rounded-full shadow-sm hover:shadow-md border border-slate-100 transition-all opacity-0 group-hover:opacity-100"
                        title="Удалить"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="h-32 mb-4 flex items-center justify-center bg-white rounded-xl border border-slate-100 p-4">
                        <img src={product.image} alt={product.name} className="h-full w-full object-contain mix-blend-multiply" />
                      </div>
                      <h3 className="font-bold text-slate-800 text-lg leading-tight mb-1">{product.name}</h3>
                      <div className="text-xl font-bold text-lime-600">{formatPrice(product.price)} ₽</div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <tr className="bg-white hover:bg-slate-50/50 transition-colors">
                <td className="p-6 text-sm font-semibold text-slate-500 sticky left-0 bg-white z-10 border-r border-slate-100 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                  Рейтинг пользователей
                </td>
                {products.map((product) => (
                  <td key={product.id} className="p-6 border-r border-slate-100 last:border-r-0">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800 bg-yellow-50 w-fit px-3 py-1 rounded-lg border border-yellow-100">
                      <span className="text-yellow-600">{product.rating.toFixed(2)}</span>
                      <span className="text-slate-400 font-normal">/ 5</span>
                    </div>
                  </td>
                ))}
              </tr>

              {allSpecKeys.map((specKey) => (
                <tr key={specKey} className="bg-white hover:bg-slate-50/50 transition-colors group">
                  <td className="p-6 text-sm font-medium text-slate-500 capitalize sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-100 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                    {getSpecLabel(specKey)}
                  </td>
                  {products.map((product) => {
                    const spec = product.specs[specKey];
                    return (
                      <td key={product.id} className={`p-6 border-r border-slate-100 last:border-r-0 ${spec?.important ? 'bg-lime-50/30' : ''}`}>
                        {spec ? (
                          <div>
                            <span className={`text-base ${spec.important ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
                              {spec.value.toString()} <span className="text-slate-400 text-sm font-normal">{spec.unit || ''}</span>
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300 font-light">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ComparisonView;
