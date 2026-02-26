import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Sparkles, Loader2, Bot } from 'lucide-react';
import { ChatMessage, Product } from '../types';
import { getAIRecommendation } from '../services/geminiService';

interface AIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onRecommend: (ids: string[]) => void;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ isOpen, onClose, products, onRecommend }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: "👋 I'm your **OneSearch Assistant**.\n\nAsk me about products, specs, or deals (e.g., *'Cheapest gaming laptop with RTX 4070'*).",
      timestamp: Date.now()
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const historyForAI = messages.map(m => ({ role: m.role, text: m.text }));
    const result = await getAIRecommendation(input, products, historyForAI);

    const botMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: result.text,
      timestamp: Date.now(),
      relatedProductIds: result.relatedProductIds
    };

    setMessages(prev => [...prev, botMsg]);
    setIsLoading(false);

    if (result.relatedProductIds && result.relatedProductIds.length > 0) {
      onRecommend(result.relatedProductIds);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-[450px] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300 border-l border-slate-100 font-sans">
      
      {/* Header */}
      <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 p-2 rounded-xl shadow-lg shadow-slate-900/20">
            <Sparkles size={20} className="text-lime-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">AI Assistant</h3>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-lime-500 animate-pulse"></span>
              <p className="text-xs text-slate-500 font-medium">Online</p>
            </div>
          </div>
        </div>
        <button 
          onClick={onClose} 
          className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-800 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-slate-50/30" ref={scrollRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            {msg.role === 'model' && (
              <div className="w-8 h-8 bg-white border border-slate-100 rounded-full flex items-center justify-center mr-2 flex-shrink-0 self-end mb-1 shadow-sm">
                <Bot size={14} className="text-slate-900" />
              </div>
            )}
            
            <div 
              className={`
                max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm
                ${msg.role === 'user' 
                  ? 'bg-slate-900 text-white rounded-br-sm' 
                  : 'bg-white border border-slate-100 text-slate-700 rounded-bl-sm'
                }
              `}
            >
              <div 
                className="markdown-content"
                dangerouslySetInnerHTML={{ 
                  __html: msg.text
                    .replace(/\n/g, '<br/>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                }} 
              />
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start animate-in fade-in">
             <div className="w-8 h-8 bg-white border border-slate-100 rounded-full flex items-center justify-center mr-2 flex-shrink-0 self-end mb-1 shadow-sm">
                <Bot size={14} className="text-slate-900" />
              </div>
            <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-sm p-4 shadow-sm flex items-center gap-3">
              <Loader2 size={16} className="animate-spin text-lime-600" />
              <span className="text-xs text-slate-400 font-medium">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-slate-100 sticky bottom-0">
        <div className="relative shadow-sm rounded-2xl overflow-hidden ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-slate-900 transition-shadow">
          <input
            ref={inputRef}
            type="text"
            className="w-full pl-4 pr-12 py-4 bg-white border-none outline-none text-sm placeholder:text-slate-400 text-slate-800"
            placeholder="Type your question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-slate-900 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;