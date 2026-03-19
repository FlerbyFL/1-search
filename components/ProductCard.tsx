import React from 'react';
import { Product } from '../types';
import { BarChart2, Check, Star, ArrowUpRight, Heart, Truck } from 'lucide-react';

const IMAGE_FALLBACK = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="#F1F5F9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#64748B" font-family="Arial" font-size="40">Нет фото</text></svg>'
)}`;

interface ProductCardProps {
  product: Product;
  onCompare: (product: Product) => void;
  isCompared: boolean;
  onSelect: (product: Product) => void;
  highlight?: boolean;
  isLiked?: boolean;
  onToggleLike: (e: React.MouseEvent, product: Product) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onCompare, isCompared, onSelect, highlight, isLiked, onToggleLike }) => {
  const bestOffer = product.offers[0];
  const specs = Object.values(product.specs || {});
  const displayedSpecs = specs.slice(0, 6);
  const stockStatus =
    product.inStock === false
      ? { label: 'Нет в наличии', className: 'bg-rose-50 text-rose-700' }
      : product.inStock === true
        ? { label: 'В наличии', className: 'bg-emerald-50 text-emerald-700' }
        : null;

  const formatPrice = (price: number) => {
    return price.toLocaleString('ru-RU');
  };

  return (
    <div 
      className={`
        group relative bg-white rounded-2xl transition-all duration-300 flex flex-col overflow-hidden h-[640px] md:h-[660px] 2xl:h-[680px]
        ${highlight 
          ? 'ring-2 ring-lime-400 shadow-2xl shadow-lime-500/10 scale-[1.02]' 
          : 'border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1'
        }
      `}
      onClick={() => onSelect(product)}
    >
      {/* Floating Actions */}
      <div className="absolute top-3 right-3 flex flex-col gap-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <button 
            onClick={(e) => onToggleLike(e, product)}
            className={`p-2 rounded-full shadow-lg backdrop-blur-md transition-all ${
              isLiked ? 'bg-red-50 text-red-500' : 'bg-white/90 text-slate-400 hover:text-red-500'
            }`}
          >
            <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onCompare(product); }}
            className={`p-2 rounded-full shadow-lg backdrop-blur-md transition-all ${
              isCompared ? 'bg-slate-900 text-white' : 'bg-white/90 text-slate-600 hover:text-slate-900'
            }`}
          >
            {isCompared ? <Check size={16} /> : <BarChart2 size={16} />}
          </button>
      </div>

      {/* Image Container */}
      <div className="relative h-48 md:h-52 bg-white p-4 flex items-center justify-center border-b border-slate-50">
        <img 
          src={product.image} 
          alt={product.name} 
          loading="lazy"
          decoding="async"
          className="object-contain w-full h-full mix-blend-multiply transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            if (e.currentTarget.src !== IMAGE_FALLBACK) {
              e.currentTarget.src = IMAGE_FALLBACK;
            }
          }}
        />
        {highlight && (
           <div className="absolute top-3 left-3 bg-lime-400 text-slate-900 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider shadow-sm">
              Лучший выбор
           </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1">
        {/* Header */}
        <div className="flex justify-between items-start mb-2">
           <h3 className="font-bold text-slate-900 text-base leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">
             {product.name}
           </h3>
           <div className="flex items-center gap-1 text-yellow-500 flex-shrink-0 ml-2">
              <Star size={12} fill="currentColor" />
              {/* RATING FIXED TO 2 DECIMALS */}
              <span className="text-xs font-bold text-slate-700">{product.rating.toFixed(2)}</span>
           </div>
        </div>

        {/* Store Comparison Mini-Table */}
        <div className="mt-4 space-y-2 mb-4">
           {product.offers.slice(0, 3).map((offer, idx) => (
             <a 
               key={idx} 
               href={offer.url}
               target="_blank"
               rel="noopener noreferrer"
               onClick={(e) => e.stopPropagation()}
               className="flex items-center justify-between text-xs group/offer hover:bg-slate-50 p-1 rounded transition-colors"
             >
                <div className="flex items-center gap-2 text-slate-500 group-hover/offer:text-blue-600">
                   <span className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-lime-500' : 'bg-slate-300'}`}></span>
                   {offer.name}
                </div>
                <div className={`font-medium ${idx === 0 ? 'text-lime-600 font-bold' : 'text-slate-600'}`}>
                   {formatPrice(offer.price)} ₽
                </div>
             </a>
           ))}
        </div>

        {displayedSpecs.length > 0 && (
          <div className="mb-4 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5 space-y-1.5 max-h-[140px] overflow-hidden">
            {displayedSpecs.map((spec, idx) => (
              <div key={`${spec.label}-${idx}`} className="flex items-start justify-between gap-2 text-[11px] leading-tight">
                <span className="text-slate-500">{spec.label}</span>
                <span className="text-slate-700 font-medium text-right">{String(spec.value)} {spec.unit || ''}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
           <div>
              <div className="flex items-center gap-1.5 text-[10px] text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full w-fit mb-1">
                 <Truck size={10} /> {bestOffer?.delivery || 'Быстрая доставка'}
              </div>
              {stockStatus && (
                <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit mb-1 ${stockStatus.className}`}>
                  {stockStatus.label}
                </div>
              )}
              <div className="text-lg font-bold text-slate-900">{formatPrice(product.price)} ₽</div>
           </div>
           
           <button 
             onClick={(e) => { e.stopPropagation(); window.open(bestOffer.url, '_blank'); }}
             className="bg-slate-900 text-white p-2.5 rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10"
           >
              <ArrowUpRight size={18} />
           </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;





