import React, { useState } from 'react';
import { MaterialItem, Product, ProductionOrder } from '../types';
import {
  Factory,
  Layers,
  Package,
  AlertTriangle,
  Hammer,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  RefreshCw
} from 'lucide-react';

interface FactoryViewProps {
  materials: MaterialItem[];
  products: Product[];
  orders: ProductionOrder[];
  onOrderCreated: () => void;
}

export const FactoryView: React.FC<FactoryViewProps> = ({
  materials,
  products,
  orders,
  onOrderCreated
}) => {
  const [selectedProductId, setSelectedProductId] = useState<number>(products[0]?.id || 1);
  const [productionQty, setProductionQty] = useState<number>(50);
  const [orderNotes, setOrderNotes] = useState<string>('Lote de reposição para temporada de ventos RJ');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const selectedProduct = products.find(p => p.id === selectedProductId) || products[0];

  // Cálculo da BOM estimada para o produto selecionado
  // (Pipa Raia consome 1 bambu, 1 fibra, 1 seda; Combate consome 1 bambu, 2 fibras, 1.5 seda)
  const getRequiredMaterials = (product: Product, qty: number) => {
    const isCombate = product.category.toLowerCase().includes('combate');
    const bambuReq = qty * 1.0;
    const fibraReq = qty * (isCombate ? 2.0 : 1.0);
    const sedaReq = qty * (isCombate ? 1.5 : 1.0);
    const colaReq = qty * 0.005;

    const bambuMat = materials.find(m => m.code.includes('BAMBU'));
    const fibraMat = materials.find(m => m.code.includes('FIBRA'));
    const sedaMat = materials.find(m => m.code.includes('SEDA'));
    const colaMat = materials.find(m => m.code.includes('COLA'));

    return [
      {
        name: 'Vareta de Bambu Central 50cm',
        required: bambuReq,
        available: bambuMat ? Number(bambuMat.stock_qty) : 0,
        unit: 'un',
        sufficient: bambuMat ? Number(bambuMat.stock_qty) >= bambuReq : false,
      },
      {
        name: 'Vareta de Fibra de Vidro 1.8mm (Arco)',
        required: fibraReq,
        available: fibraMat ? Number(fibraMat.stock_qty) : 0,
        unit: 'un',
        sufficient: fibraMat ? Number(fibraMat.stock_qty) >= fibraReq : false,
      },
      {
        name: 'Papel de Seda Estampado TF Carmim/Laranja',
        required: Math.ceil(sedaReq),
        available: sedaMat ? Number(sedaMat.stock_qty) : 0,
        unit: 'folha',
        sufficient: sedaMat ? Number(sedaMat.stock_qty) >= Math.ceil(sedaReq) : false,
      },
      {
        name: 'Cola Especial PVA para Pipas TF',
        required: parseFloat(colaReq.toFixed(3)),
        available: colaMat ? Number(colaMat.stock_qty) : 0,
        unit: 'litro',
        sufficient: colaMat ? Number(colaMat.stock_qty) >= colaReq : false,
      }
    ];
  };

  const currentBOM = selectedProduct ? getRequiredMaterials(selectedProduct, productionQty) : [];
  const hasInsufficientMaterial = currentBOM.some(m => !m.sufficient);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await fetch('http://127.0.0.1:8000/api/production-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProduct.id,
          quantity: productionQty,
          notes: orderNotes
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Erro ao emitir ordem de transformação');
      }

      setSuccessMessage(data.message);
      onOrderCreated();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro de conexão com o módulo de produção');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Cards de Métricas do Chão de Fábrica */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-4 rounded-2xl flex items-center justify-between border-l-4 border-l-red-500">
          <div>
            <span className="text-xs text-slate-400 uppercase font-semibold">Total Matérias-Primas</span>
            <h3 className="text-2xl font-bold font-mono text-white mt-1">
              {materials.reduce((acc, m) => acc + Number(m.stock_qty), 0).toLocaleString()} un/kg
            </h3>
            <span className="text-[11px] text-emerald-400">5 tipos de insumos cadastrados</span>
          </div>
          <div className="p-3 bg-red-500/10 rounded-xl text-red-400">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl flex items-center justify-between border-l-4 border-l-amber-500">
          <div>
            <span className="text-xs text-slate-400 uppercase font-semibold">Estoque Pipas Acabadas</span>
            <h3 className="text-2xl font-bold font-mono text-amber-400 mt-1">
              {products.reduce((acc, p) => acc + Number(p.stock_qty), 0).toLocaleString()} unidades
            </h3>
            <span className="text-[11px] text-amber-300">Prontas para expedição e PDV</span>
          </div>
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400">
            <Package className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl flex items-center justify-between border-l-4 border-l-yellow-500">
          <div>
            <span className="text-xs text-slate-400 uppercase font-semibold">Ordens Executadas (OP)</span>
            <h3 className="text-2xl font-bold font-mono text-yellow-400 mt-1">
              {orders.length} lotes
            </h3>
            <span className="text-[11px] text-emerald-400">Transformação 100% automatizada</span>
          </div>
          <div className="p-3 bg-yellow-500/10 rounded-xl text-yellow-400">
            <Factory className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Painel de Transformação Industrial / Emissão de OP */}
        <div className="lg:col-span-7 glass-panel p-5 rounded-2xl border-t-4 border-t-red-500 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-700/80 mb-4">
              <Hammer className="w-5 h-5 text-red-500" />
              <div>
                <h3 className="font-bold text-base text-white">Ordem de Produção & Transformação de Insumos</h3>
                <p className="text-xs text-slate-400">Baixa atômica de bambu, fibra e papel transformados em estoque final</p>
              </div>
            </div>

            {successMessage && (
              <div className="mb-4 bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 p-3 rounded-xl flex items-center gap-2 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="mb-4 bg-red-950/80 border border-red-500/50 text-red-200 p-3 rounded-xl flex items-center gap-2 text-xs">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">
                    Pipa a Fabricar:
                  </label>
                  <select
                    value={selectedProductId}
                    onChange={e => setSelectedProductId(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-red-500"
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Atual: {p.stock_qty} un)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">
                    Quantidade do Lote:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={productionQty}
                    onChange={e => setProductionQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold block mb-1">
                  Observações da Linha de Montagem:
                </label>
                <input
                  type="text"
                  value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              {/* Tabela do Bill of Materials (BOM) Dinâmico */}
              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Consumo Estimado de Insumos (BOM)
                  </span>
                  {hasInsufficientMaterial ? (
                    <span className="bg-red-950 text-red-300 text-[10px] px-2 py-0.5 rounded font-bold border border-red-800">
                      Ruptura de Estoque!
                    </span>
                  ) : (
                    <span className="bg-emerald-950 text-emerald-300 text-[10px] px-2 py-0.5 rounded font-bold border border-emerald-800">
                      Insumos Disponíveis
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {currentBOM.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-none"
                    >
                      <span className="text-slate-300">{item.name}</span>
                      <div className="flex items-center gap-3 font-mono">
                        <span className="text-slate-400">
                          Nec: <strong className="text-white">{item.required}</strong> {item.unit}
                        </span>
                        <span className={item.sufficient ? 'text-emerald-400' : 'text-red-400 font-bold'}>
                          Disp: {item.available} {item.unit}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center">
                <div className="text-xs text-slate-400">
                  <span>Custo fabril estimado: </span>
                  <span className="font-mono font-bold text-amber-400">
                    R$ {(productionQty * (selectedProduct?.cost_price || 0.85)).toFixed(2)}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || hasInsufficientMaterial}
                  className="bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg transition-all flex items-center gap-2 text-xs disabled:opacity-40"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Factory className="w-4 h-4" />
                      Executar Transformação Industrial
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Tabela de Insumos e Ruptura de Estoque */}
        <div className="lg:col-span-5 glass-panel p-5 rounded-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/80 mb-3">
              <h3 className="font-bold text-sm text-white">Almoxarifado de Matérias-Primas</h3>
              <span className="text-[11px] text-slate-400">Ponto de Pedido TF</span>
            </div>

            <div className="space-y-2.5 overflow-y-auto max-h-[420px] pr-1">
              {materials.map(mat => {
                const isCritical = Number(mat.stock_qty) <= Number(mat.min_stock);
                return (
                  <div
                    key={mat.id}
                    className={`p-3 rounded-xl border flex items-center justify-between ${
                      isCritical
                        ? 'bg-red-950/30 border-red-600/50'
                        : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{mat.name}</span>
                        {isCritical && (
                          <span className="bg-red-900 text-red-200 text-[9px] px-1.5 py-0.2 rounded font-bold">
                            ALERTA CRÍTICO
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {mat.code} • Custo Unit: R$ {Number(mat.cost_unit).toFixed(2)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className={`font-mono text-sm font-bold ${isCritical ? 'text-red-400' : 'text-emerald-400'}`}>
                        {Number(mat.stock_qty).toLocaleString()} {mat.unit}
                      </span>
                      <p className="text-[9px] text-slate-500">Mín: {mat.min_stock} {mat.unit}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Histórico Recente de Ordens de Produção Executadas */}
      <div className="glass-panel p-5 rounded-2xl">
        <h3 className="font-bold text-sm text-white mb-3 flex items-center gap-2">
          <Factory className="w-4 h-4 text-amber-400" />
          Histórico de Transformações & Lotes Fabricados
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-[10px] uppercase text-slate-400 bg-slate-900/80">
              <tr>
                <th className="py-2 px-3">Número da OP</th>
                <th className="py-2 px-3">Produto Final</th>
                <th className="py-2 px-3">Qtd. Fabricada</th>
                <th className="py-2 px-3">Custo Insumos</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {orders.slice(0, 6).map(order => (
                <tr key={order.id} className="hover:bg-slate-900/40">
                  <td className="py-2 px-3 font-mono font-bold text-amber-400">{order.order_number}</td>
                  <td className="py-2 px-3 text-white">{order.product?.name || `Produto #${order.product_id}`}</td>
                  <td className="py-2 px-3 font-mono font-semibold text-emerald-400">{order.produced_quantity} un</td>
                  <td className="py-2 px-3 font-mono">R$ {Number(order.total_cost).toFixed(2)}</td>
                  <td className="py-2 px-3">
                    <span className="bg-emerald-950 text-emerald-300 text-[10px] px-2 py-0.5 rounded border border-emerald-800 uppercase font-semibold">
                      {order.status}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                    {new Date(order.created_at).toLocaleString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
