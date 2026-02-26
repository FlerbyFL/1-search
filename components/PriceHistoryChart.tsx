import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { PricePoint } from '../types';

interface PriceHistoryChartProps {
  data: PricePoint[];
}

const PriceHistoryChart: React.FC<PriceHistoryChartProps> = ({ data }) => {
  return (
    <div className="h-48 w-full mt-4 bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
      <h4 className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Динамика цен (3 мес)</h4>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#84cc16" stopOpacity={0.2}/>
              <stop offset="95%" stopColor="#84cc16" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey="date" 
            tick={{fontSize: 10}} 
            axisLine={false}
            tickLine={false}
          />
          <YAxis 
            hide 
            domain={['dataMin - 100', 'dataMax + 100']} 
          />
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            formatter={(value: number) => [`${value.toLocaleString('ru-RU')} ₽`, 'Цена']}
            labelStyle={{ color: '#64748b' }}
          />
          <Area 
            type="monotone" 
            dataKey="price" 
            stroke="#84cc16" 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorPrice)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PriceHistoryChart;