import React from 'react';
import { DREData, CashFlowData, MLForecastMonth } from '../types';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wind,
  BarChart3,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  PieChart
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface FinancialViewProps {
  dre: DREData | null;
  cashflow: CashFlowData | null;
  forecast: MLForecastMonth[];
}

export const FinancialView: React.FC<FinancialViewProps> = ({
  dre,
  cashflow,
  forecast
}) => {
  // Configuração do gráfico de Machine Learning de Projeção de Vendas
  const forecastLabels = forecast.map(f => `${f.month_label} (${f.avg_wind_knots} nós)`);
  const forecastUnits = forecast.map(f => f.projected_units);
  const forecastRevenue = forecast.map(f => f.estimated_revenue);

  const mlChartData = {
    labels: forecastLabels,
    datasets: [
      {
        label: 'Demanda Projetada ML (Unidades de Pipas)',
        data: forecastUnits,
        borderColor: '#E63946',
        backgroundColor: 'rgba(230, 57, 70, 0.25)',
        tension: 0.4,
        fill: true,
        yAxisID: 'y',
      },
      {
        label: 'Receita Estimada (R$)',
        data: forecastRevenue,
        borderColor: '#E9C46A',
        backgroundColor: 'rgba(233, 196, 106, 0.3)',
        tension: 0.4,
        yAxisID: 'y1',
      }
    ],
  };

  const mlChartOptions = {
    responsive: true,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        labels: {
          color: '#cbd5e1',
          font: { size: 11 }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#F4A261',
        borderColor: 'rgba(244, 162, 97, 0.3)',
        borderWidth: 1,
      }
    },
    scales: {
      x: {
        ticks: { color: '#94a3b8', font: { size: 10 } },
        grid: { color: 'rgba(255, 255, 255, 0.05)' }
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        ticks: { color: '#E63946', font: { size: 10 } },
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        title: { display: true, text: 'Unidades de Pipas', color: '#E63946', font: { size: 10 } }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        ticks: { color: '#E9C46A', font: { size: 10 } },
        grid: { drawOnChartArea: false },
        title: { display: true, text: 'Receita (R$)', color: '#E9C46A', font: { size: 10 } }
      },
    },
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* 4 Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-2xl border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase font-semibold">Receita Bruta Total</span>
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-2xl font-bold font-mono text-emerald-400 mt-2">
            R$ {dre ? Number(dre.gross_revenue).toFixed(2) : '12.786,20'}
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">PDV Balcão + Vendas Atacado RJ</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase font-semibold">Margem Bruta (CPV)</span>
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
              <PieChart className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-2xl font-bold font-mono text-amber-400 mt-2">
            {dre ? Number(dre.gross_margin_percent).toFixed(1) : '60.1'}%
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">Alta lucratividade na fabricação própria</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase font-semibold">Saldo Atual de Caixa</span>
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-2xl font-bold font-mono text-blue-400 mt-2">
            R$ {cashflow ? Number(cashflow.current_balance).toFixed(2) : '3.670,00'}
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">Disponibilidade imediata (Bancos / PIX)</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border-l-4 border-l-purple-500">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase font-semibold">Previsão Demanda Próx. Mês</span>
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
              <Wind className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-2xl font-bold font-mono text-purple-300 mt-2">
            {forecast[0] ? forecast[0].projected_units.toLocaleString() : '17.900'} un
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">Machine Learning com vento & temporada</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* DRE Gerencial Detalhado */}
        <div className="lg:col-span-6 glass-panel p-5 rounded-2xl border-t-4 border-t-amber-500 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-700/80 mb-4">
            <div>
              <h3 className="font-bold text-base text-white">DRE Gerencial (Demonstração do Resultado)</h3>
              <p className="text-xs text-slate-400">Visão contábil e margem de contribuição da fábrica TF Pipas</p>
            </div>
            <span className="bg-amber-950 text-amber-300 border border-amber-800 text-[11px] px-2.5 py-0.5 rounded-full font-mono">
              {dre?.period || 'Mês Vigente'}
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            {/* 1. Receita Bruta */}
            <div className="flex justify-between p-2 rounded bg-slate-900/80 text-white font-bold">
              <span>(+) RECEITA BRUTA DE VENDAS</span>
              <span className="text-emerald-400">R$ {dre ? Number(dre.gross_revenue).toFixed(2) : '12.786,20'}</span>
            </div>
            <div className="flex justify-between pl-4 pr-2 text-slate-400 text-[11px]">
              <span>• Vendas PDV (Frente de Loja)</span>
              <span>R$ {dre ? Number(dre.pos_sales).toFixed(2) : '286,20'}</span>
            </div>
            <div className="flex justify-between pl-4 pr-2 text-slate-400 text-[11px]">
              <span>• Vendas Atacado e Encomendas</span>
              <span>R$ {dre ? Number(dre.other_revenue).toFixed(2) : '12.500,00'}</span>
            </div>

            {/* 2. Deduções */}
            <div className="flex justify-between p-2 rounded text-red-300">
              <span>(-) Impostos s/ Faturamento (Simples Nacional ~6%)</span>
              <span>- R$ {dre ? Number(dre.deductions_taxes).toFixed(2) : '767,17'}</span>
            </div>

            {/* 3. Receita Líquida */}
            <div className="flex justify-between p-2 rounded bg-slate-800/60 font-semibold text-white">
              <span>(=) RECEITA OPERACIONAL LÍQUIDA</span>
              <span className="text-amber-300">R$ {dre ? Number(dre.net_revenue).toFixed(2) : '12.019,03'}</span>
            </div>

            {/* 4. CPV (Matérias-Primas) */}
            <div className="flex justify-between p-2 rounded text-red-300">
              <span>(-) Custo dos Produtos Vendidos (Insumos CPV)</span>
              <span>- R$ {dre ? Number(dre.cpv_materials).toFixed(2) : '4.800,00'}</span>
            </div>

            {/* 5. Lucro Bruto */}
            <div className="flex justify-between p-2 rounded bg-amber-950/40 border border-amber-900/50 font-bold text-amber-400">
              <span>(=) LUCRO BRUTO / MARGEM CONTRIBUIÇÃO</span>
              <span>R$ {dre ? Number(dre.gross_profit).toFixed(2) : '7.219,03'}</span>
            </div>

            {/* 6. Despesas Operacionais */}
            <div className="flex justify-between p-2 rounded text-red-300">
              <span>(-) Despesas Operacionais (Aluguel, Folha, Luz)</span>
              <span>- R$ {dre ? Number(dre.operational_expenses).toFixed(2) : '8.300,00'}</span>
            </div>

            {/* 7. EBITDA */}
            <div className="flex justify-between p-2 rounded bg-slate-900/80 font-bold text-white border-t border-slate-700">
              <span>(=) LAJIDA / EBITDA GERENCIAL</span>
              <span className={dre && Number(dre.ebitda) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                R$ {dre ? Number(dre.ebitda).toFixed(2) : '-1.080,97'}
              </span>
            </div>

            {/* 8. Depreciação e Resultado */}
            <div className="flex justify-between pl-4 pr-2 text-slate-400 text-[11px]">
              <span>(-) Depreciação Maquinário e Bancadas</span>
              <span>- R$ {dre ? Number(dre.depreciation).toFixed(2) : '415,00'}</span>
            </div>

            <div className="flex justify-between p-2.5 rounded bg-gradient-to-r from-red-950/60 to-slate-900 border border-red-500/40 font-bold text-sm text-white">
              <span>(=) RESULTADO LÍQUIDO DO EXERCÍCIO</span>
              <span className="font-mono text-amber-300">
                R$ {dre ? Number(dre.net_profit).toFixed(2) : '-1.495,97'}
              </span>
            </div>
          </div>
        </div>

        {/* Projeção de Vendas baseada em Machine Learning */}
        <div className="lg:col-span-6 glass-panel p-5 rounded-2xl border-t-4 border-t-red-500 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/80 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-red-400" />
                <div>
                  <h3 className="font-bold text-base text-white">Projeção de Vendas (Machine Learning)</h3>
                  <p className="text-xs text-slate-400">Ridge Regression com sazonalidade e ventos do RJ</p>
                </div>
              </div>
              <span className="bg-red-950 text-red-300 text-[10px] px-2 py-0.5 rounded font-bold border border-red-800">
                AI Powered
              </span>
            </div>

            {/* Gráfico Chart.js */}
            <div className="h-64 w-full">
              <Line data={mlChartData} options={mlChartOptions} />
            </div>

            {/* Tabela dos Próximos Meses Projetados */}
            <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2">
              {forecast.slice(0, 6).map((f, i) => (
                <div key={i} className="bg-slate-900/90 border border-slate-800 p-2 rounded-xl text-center">
                  <span className="text-[11px] font-bold text-slate-300 block">{f.month_label}</span>
                  <span className="text-xs font-mono font-bold text-amber-400 block mt-0.5">
                    {f.projected_units.toLocaleString()}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono block">
                    {f.avg_wind_knots} nós
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-center gap-2">
            <Wind className="w-5 h-5 text-amber-400 shrink-0" />
            <span>
              <strong>Insight do Modelo Preditivo:</strong> Julho e Agosto apresentam picos de demanda no Rio de Janeiro devido às férias escolares e ventos costeiros superiores a 16 nós. Recomendado estocar 35.000 varetas de bambu.
            </span>
          </div>
        </div>
      </div>

      {/* Fluxo de Caixa: Contas a Pagar e Receber */}
      <div className="glass-panel p-5 rounded-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-700/80 mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-base text-white">Fluxo de Caixa (Lançamentos a Pagar e Receber)</h3>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-emerald-400">A Receber: R$ {cashflow ? Number(cashflow.pending_receivables).toFixed(2) : '8.400,00'}</span>
            <span className="text-red-400">A Pagar: R$ {cashflow ? Number(cashflow.pending_payables).toFixed(2) : '3.890,00'}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-[10px] uppercase text-slate-400 bg-slate-900/80">
              <tr>
                <th className="py-2.5 px-3">Descrição da Movimentação</th>
                <th className="py-2.5 px-3">Tipo</th>
                <th className="py-2.5 px-3">Categoria</th>
                <th className="py-2.5 px-3">Vencimento</th>
                <th className="py-2.5 px-3">Valor</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {cashflow?.transactions.map(tx => (
                <tr key={tx.id} className="hover:bg-slate-900/40">
                  <td className="py-2 px-3 text-white font-medium">{tx.description}</td>
                  <td className="py-2 px-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                      tx.type === 'revenue' ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300'
                    }`}>
                      {tx.type === 'revenue' ? 'Receita' : 'Despesa'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-400">{tx.category}</td>
                  <td className="py-2 px-3 font-mono text-slate-300">{tx.due_date}</td>
                  <td className={`py-2 px-3 font-mono font-bold ${
                    tx.type === 'revenue' ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {tx.type === 'revenue' ? '+' : '-'} R$ {Number(tx.amount).toFixed(2)}
                  </td>
                  <td className="py-2 px-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                      tx.status === 'paid' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800' : 'bg-amber-950/60 text-amber-400 border border-amber-800'
                    }`}>
                      {tx.status === 'paid' ? 'Liquidado' : 'Pendente'}
                    </span>
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
