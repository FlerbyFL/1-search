import React from 'react';
import { Scenario } from '../types';
import { Check } from 'lucide-react';

interface ScenarioSelectorProps {
  scenarios: Scenario[];
  onSelect: (scenario: Scenario) => void;
  activeId: string | null;
}

const ScenarioSelector: React.FC<ScenarioSelectorProps> = ({ scenarios, onSelect, activeId }) => {
  return (
    <div className="w-full mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Select Your Use Case</h2>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {scenarios.map((scenario) => {
          const isActive = activeId === scenario.id;
          return (
            <button
              key={scenario.id}
              onClick={() => onSelect(scenario)}
              className={`
                relative p-5 rounded-2xl text-left transition-all duration-300 group
                ${isActive 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-[1.02] ring-2 ring-offset-2 ring-blue-600' 
                  : 'bg-white text-slate-600 shadow-sm hover:shadow-md hover:bg-slate-50 border border-slate-100'
                }
              `}
            >
              {isActive && (
                <div className="absolute top-3 right-3 bg-white/20 p-1 rounded-full backdrop-blur-sm">
                  <Check size={12} className="text-white" />
                </div>
              )}
              
              <div className={`text-3xl mb-3 transform transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
                {scenario.icon}
              </div>
              
              <div className={`font-bold text-sm mb-1 ${isActive ? 'text-white' : 'text-slate-800'}`}>
                {scenario.label}
              </div>
              
              <p className={`text-[10px] leading-relaxed opacity-80 ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                {scenario.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ScenarioSelector;