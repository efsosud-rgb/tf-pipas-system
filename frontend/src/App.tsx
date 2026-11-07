import React, { useState, useEffect } from 'react';
import { Kite3DCanvas } from './components/Kite3DCanvas';
import { PosView } from './components/PosView';
import { FactoryView } from './components/FactoryView';
import { FinancialView } from './components/FinancialView';
import { AiAgentsView } from './components/AiAgentsView';
import { Product, MaterialItem, ProductionOrder, DREData, CashFlowData, MLForecastMonth } from './types';
import {
  ShoppingCart,
  Factory,
  BarChart3,
  Bot,
  Wind,
  Sparkles,
  Compass,
  ShieldCheck,
  Activity,
  Box
} from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<'pos' | 'factory' | 'financial' | 'ai' | '3d'>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [dre, setDre] = useState<DREData | null>(null);
  const [cashflow, setCashflow] = useState<CashFlowData | null>(null);
  const [forecast, setForecast] = useState<MLForecastMonth[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      // Backend Laravel
      const [prodRes, matRes, ordRes, dreRes, cfRes] = await Promise.all([
        fetch('http://127.0.0.1:8000/api/products').catch(() => null),
        fetch('http://127.0.0.1:8000/api/materials').catch(() => null),
        fetch('http://127.0.0.1:8000/api/production-orders').catch(() => null),
        fetch('http://127.0.0.1:8000/api/financial/dre').catch(() => null),
        fetch('http://127.0.0.1:8000/api/financial/cashflow').catch(() => null),
      ]);

      if (prodRes && prodRes.ok) setProducts(await prodRes.json());
      if (matRes && matRes.ok) setMaterials(await matRes.json());
      if (ordRes && ordRes.ok) setOrders(await ordRes.json());
      if (dreRes && dreRes.ok) setDre(await dreRes.json());
      if (cfRes && cfRes.ok) setCashflow(await cfRes.json());

      // AI Service FastAPI
      const mlRes = await fetch('http://127.0.0.1:8001/api/ai/ml/projections').catch(() => null);
      if (mlRes && mlRes.ok) {
        const mlData = await mlRes.json();
        setForecast(mlData.forecast);
      }
    } catch (e) {
      console.error('Error fetching data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col selection:bg-red-500 selection:text-white">
      {/* Top Banner & Header com 3D Kite Canvas Interativo */}
      <header className="relative border-b border-slate-800 bg-slate-900/60 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo e Identidade Visual 5D */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#E63946] via-[#F4A261] to-[#E9C46A] p-[2px] shadow-lg shadow-red-500/20">
                <div className="w-full h-full bg-slate-950 rounded-2xl flex items-center justify-center">
                  <Wind className="w-6 h-6 text-amber-400" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-extrabold tracking-tight gradient-text">
                    TF PIPAS SYSTEM
                  </h1>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-800">
                    5D ERP
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">Tradição & Alta Performance Fabril • SEFAZ-RJ</p>
              </div>
            </div>

            {/* Canvas 3D em Miniatura Integrado ao Cabeçalho */}
            <div className="hidden md:flex items-center gap-2 w-48 h-16">
              <Kite3DCanvas compact={true} />
            </div>

            {/* Status do Sistema e SEFAZ-RJ */}
            <div className="hidden sm:flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-slate-300 font-mono text-[11px]">SEFAZ-RJ: ONLINE</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/60 border border-purple-800/80 text-purple-300">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span className="font-mono text-[11px]">QWEN 3.5 ACTIVE</span>
              </div>
            </div>
          </div>

          {/* Navegação por Abas Principais */}
          <nav className="flex space-x-1 sm:space-x-2 pb-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('pos')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'pos'
                  ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white shadow-lg shadow-red-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              Frente de Loja (PDV)
            </button>

            <button
              onClick={() => setActiveTab('factory')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'factory'
                  ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white shadow-lg shadow-red-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Factory className="w-4 h-4" />
              Estoque & Fábrica (BOM)
            </button>

            <button
              onClick={() => setActiveTab('financial')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'financial'
                  ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white shadow-lg shadow-red-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Financeiro & DRE & ML
            </button>

            <button
              onClick={() => setActiveTab('ai')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'ai'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Bot className="w-4 h-4 text-purple-300" />
              Central Hermes IA & MCP
            </button>

            <button
              onClick={() => setActiveTab('3d')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === '3d'
                  ? 'bg-gradient-to-r from-amber-600 to-yellow-600 text-white shadow-lg shadow-amber-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Box className="w-4 h-4" />
              Ambiente 5D Pipa TF
            </button>
          </nav>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {/* Vista Especial do Ambiente 3D 5D da Pipa */}
        {activeTab === '3d' && (
          <div className="flex flex-col gap-6">
            <div className="glass-panel p-6 rounded-3xl border-t-4 border-t-amber-500 shadow-2xl">
              <div className="text-center max-w-2xl mx-auto mb-4">
                <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
                  Experiência Imersiva Tridimensional
                </span>
                <h2 className="text-2xl font-black text-white mt-1">
                  Pipa Raia Carioca TF Pipas em Ambiente 5D
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Mova o cursor para inclinar em pitch/yaw com resposta aerodinâmica em tempo real, cauda com dinâmica senoidal de vento e partículas luminescentes.
                </p>
              </div>

              <div className="h-[420px] rounded-2xl bg-gradient-to-b from-slate-950 via-[#0F172A] to-slate-950 p-4 border border-slate-800 relative">
                <Kite3DCanvas compact={false} />
                <div className="absolute bottom-4 left-6 text-[11px] text-slate-400 font-mono bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
                  Render: Three.js WebGL • Geometria: Raia Losango 40cm • Cores TF: #E63946, #F4A261, #E9C46A
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Módulo PDV */}
        {activeTab === 'pos' && (
          <PosView products={products} onSaleComplete={fetchData} />
        )}

        {/* Módulo Estoque & Fábrica */}
        {activeTab === 'factory' && (
          <FactoryView
            materials={materials}
            products={products}
            orders={orders}
            onOrderCreated={fetchData}
          />
        )}

        {/* Módulo Financeiro & DRE */}
        {activeTab === 'financial' && (
          <FinancialView
            dre={dre}
            cashflow={cashflow}
            forecast={forecast}
          />
        )}

        {/* Módulo Hermes IA & MCPs */}
        {activeTab === 'ai' && (
          <AiAgentsView />
        )}
      </main>

      {/* Footer Profissional */}
      <footer className="border-t border-slate-800 bg-slate-950/80 py-4 text-center text-xs text-slate-500">
        <p>TF Pipas System ERP &copy; {new Date().getFullYear()} • Monorepo Laravel + React PWA + FastAPI AI • Rio de Janeiro, Brasil</p>
      </footer>
    </div>
  );
}

export default App;
