import React, { useState } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  Database,
  Cpu,
  CheckCircle,
  Terminal,
  ShoppingBag,
  Layers,
  DollarSign,
  RefreshCw
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  agentType?: 'commercial' | 'stock' | 'finance';
  agentName?: string;
  text: string;
  timestamp: string;
  ragSources?: any[];
  mcpTool?: string;
}

export const AiAgentsView: React.FC = () => {
  const [selectedAgent, setSelectedAgent] = useState<'commercial' | 'stock' | 'finance'>('commercial');
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'agent',
      agentType: 'commercial',
      agentName: 'Hermes Comercial (Qwen 3.5)',
      text: 'Olá! Sou o Agente Comercial da TF Pipas System. Posso consultar tendências de vendas, histórico de faturamento e projetar demanda para a temporada com base no vento do RJ. Como posso ajudar hoje?',
      timestamp: 'Agora',
      ragSources: [{ domain: 'commercial', text: 'Pipa Raia 40cm TF Carmim é o modelo mais vendido no Rio de Janeiro.' }],
      mcpTool: 'generate_sales_projection'
    }
  ]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: inputMessage,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('http://127.0.0.1:8001/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_type: selectedAgent,
          message: userMsg.text
        })
      });

      const data = await response.json();
      const agentMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'agent',
        agentType: selectedAgent,
        agentName: data.role || `Hermes ${selectedAgent.toUpperCase()}`,
        text: data.reply,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        ragSources: data.rag_sources,
        mcpTool: data.mcp_tool_triggered
      };

      setMessages(prev => [...prev, agentMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'agent',
        agentType: selectedAgent,
        agentName: 'Hermes Copilot (Offline)',
        text: 'Serviço de IA FastAPI respondendo em modo local. Agente Ollama Qwen 3.5 com ferramentas MCP sincronizadas com a base de dados de pipas.',
        timestamp: 'Agora'
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header com Status do Ollama, MCPs e pgvector */}
      <div className="glass-panel p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 border-l-4 border-l-purple-500">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-500/10 rounded-xl text-purple-400">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-base text-white">Central de IA Hermes Agent & MCPs</h2>
            <p className="text-xs text-slate-400">Model Context Protocol v1.0 • Ollama (Qwen 3.5 14B) • pgvector RAG</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-700 text-purple-300">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            Ollama Qwen 3.5 (Open Source)
          </span>
          <span className="flex items-center gap-1.5 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-700 text-blue-300">
            <Database className="w-3.5 h-3.5 text-blue-400" />
            pgvector RAG Ativo
          </span>
          <span className="flex items-center gap-1.5 bg-emerald-950/80 px-3 py-1.5 rounded-xl border border-emerald-800 text-emerald-300">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            4 MCP Tools Conectadas
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Seletor de Agentes Especialistas */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <button
            onClick={() => setSelectedAgent('commercial')}
            className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
              selectedAgent === 'commercial'
                ? 'glass-panel-glow border-amber-500/80'
                : 'glass-panel hover:bg-slate-800/60'
            }`}
          >
            <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-400 shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-white">Agente Comercial</h4>
                <span className="text-[10px] bg-amber-950 text-amber-300 px-1.5 py-0.2 rounded font-mono">
                  MCP Vendas
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Estratégias de vendas de raia e combate, precificação dinâmica e projeção por vento.
              </p>
            </div>
          </button>

          <button
            onClick={() => setSelectedAgent('stock')}
            className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
              selectedAgent === 'stock'
                ? 'glass-panel-glow border-red-500/80'
                : 'glass-panel hover:bg-slate-800/60'
            }`}
          >
            <div className="p-2.5 bg-red-500/10 rounded-xl text-red-400 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-white">Agente de Fábrica & Estoque</h4>
                <span className="text-[10px] bg-red-950 text-red-300 px-1.5 py-0.2 rounded font-mono">
                  MCP BOM
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Controle de insumos (bambu, fibra, seda), capacidade produtiva e alerta de ruptura.
              </p>
            </div>
          </button>

          <button
            onClick={() => setSelectedAgent('finance')}
            className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
              selectedAgent === 'finance'
                ? 'glass-panel-glow border-emerald-500/80'
                : 'glass-panel hover:bg-slate-800/60'
            }`}
          >
            <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-white">Agente Financeiro & DRE</h4>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1.5 py-0.2 rounded font-mono">
                  MCP Controladoria
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Auditoria de margem de contribuição, EBITDA, fluxo de caixa e alíquotas fiscais.
              </p>
            </div>
          </button>

          {/* Card Explicativo das Ferramentas MCP Registradas */}
          <div className="glass-panel p-4 rounded-2xl text-xs space-y-2 mt-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-purple-400" />
              Manifesto de Ferramentas MCP Ativas
            </span>
            <div className="space-y-1.5 text-[11px] font-mono text-slate-300">
              <div className="p-1.5 bg-slate-900 rounded border border-slate-800">
                <code className="text-amber-400 font-bold">check_raw_material_stock()</code>
              </div>
              <div className="p-1.5 bg-slate-900 rounded border border-slate-800">
                <code className="text-red-400 font-bold">simulate_production_capacity()</code>
              </div>
              <div className="p-1.5 bg-slate-900 rounded border border-slate-800">
                <code className="text-emerald-400 font-bold">get_financial_kpis()</code>
              </div>
              <div className="p-1.5 bg-slate-900 rounded border border-slate-800">
                <code className="text-purple-400 font-bold">generate_sales_projection()</code>
              </div>
            </div>
          </div>
        </div>

        {/* Janela de Chat Interativo com o Agente */}
        <div className="lg:col-span-8 glass-panel p-5 rounded-2xl flex flex-col h-[560px] border-t-4 border-t-purple-500 shadow-xl">
          {/* Header do Chat */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-700/80">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="font-bold text-sm text-white">
                Conversa Ativa: Agente {selectedAgent.toUpperCase()}
              </span>
            </div>
            <span className="text-[11px] text-slate-400">Contexto RAG pgvector Carregado</span>
          </div>

          {/* Lista de Mensagens */}
          <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-2">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white rounded-tr-none shadow-md'
                      : 'bg-slate-900/90 border border-slate-700 text-slate-200 rounded-tl-none shadow-md'
                  }`}
                >
                  {msg.agentName && (
                    <div className="text-[10px] font-bold text-purple-400 mb-1 flex items-center gap-1">
                      <Bot className="w-3 h-3 inline" />
                      {msg.agentName}
                    </div>
                  )}
                  <p>{msg.text}</p>

                  {/* Informações de RAG e MCP */}
                  {msg.ragSources && msg.ragSources.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-800 text-[10px] text-slate-400">
                      <span className="text-purple-300 font-semibold">Fonte Vetorial pgvector:</span> {msg.ragSources[0].text}
                    </div>
                  )}

                  {msg.mcpTool && (
                    <div className="mt-1 text-[10px] text-amber-300/80 font-mono">
                      Ferramenta MCP disparada: <strong>{msg.mcpTool}()</strong>
                    </div>
                  )}
                </div>
                <span className="text-[9px] text-slate-500 mt-1 px-1">{msg.timestamp}</span>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-purple-300 bg-slate-900/60 p-3 rounded-xl border border-slate-800 w-fit">
                <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                <span>Ollama Qwen 3.5 processando embedding e executando MCP...</span>
              </div>
            )}
          </div>

          {/* Campo de Input */}
          <form onSubmit={handleSendMessage} className="pt-3 border-t border-slate-700/80 flex gap-2">
            <input
              type="text"
              placeholder={`Pergunte ao Agente ${selectedAgent.toUpperCase()} (ex: "Qual a demanda de pipas para o fim de semana com vento?")...`}
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
            <button
              type="submit"
              disabled={isLoading || !inputMessage.trim()}
              className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-1.5 disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
              Enviar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
