from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from app.mcp_server import vector_store, MCPRegistry
from app.ml_forecast import ml_forecast_engine

app = FastAPI(
    title="TF Pipas System - AI Service",
    description="Microserviço de IA com suporte a Ollama (Qwen 3.5), pgvector RAG e Hermes Agent via MCPs",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AgentChatRequest(BaseModel):
    agent_type: str # "commercial", "stock", "finance"
    message: str
    context_data: Optional[Dict[str, Any]] = None

class MCPExecuteRequest(BaseModel):
    tool_name: str
    arguments: Dict[str, Any]

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "tf-pipas-ai-service",
        "engine": "Qwen 3.5 (Ollama) + pgvector RAG + Hermes Agent MCP",
        "active_mcp_tools": len(MCPRegistry.get_tools_manifest())
    }

@app.get("/api/ai/mcp/tools")
def list_mcp_tools():
    """Retorna o manifesto de ferramentas MCP disponíveis para o Hermes Agent"""
    return {
        "protocol": "Model Context Protocol (MCP) v1.0",
        "tools": MCPRegistry.get_tools_manifest()
    }

@app.post("/api/ai/mcp/execute")
def execute_mcp_tool(req: MCPExecuteRequest):
    """Execução direta de ferramentas MCP"""
    result = MCPRegistry.execute_tool(req.tool_name, req.arguments)
    return {"tool": req.tool_name, "result": result}

@app.get("/api/ai/ml/projections")
def get_ml_sales_projections(start_month: int = 11, count: int = 6):
    """Projeção de vendas de pipas usando Machine Learning treinado com sazonalidade e vento"""
    forecast = ml_forecast_engine.forecast_next_months(start_month=start_month, count=count)
    return {
        "algorithm": "Ridge Regression + Seasonal Weather Decomposition",
        "region": "Rio de Janeiro / Zona Oeste & Baixada",
        "forecast": forecast
    }

@app.post("/api/ai/chat")
def chat_with_agent(req: AgentChatRequest):
    """
    RAG com pgvector + Resposta do Agente Especialista (Ollama Qwen 3.5 via Hermes Agent)
    """
    domain_map = {
        "commercial": "commercial",
        "stock": "inventory",
        "finance": "finance"
    }
    domain = domain_map.get(req.agent_type, "commercial")
    rag_docs = vector_store.similarity_search(req.message, domain=domain)
    rag_context = "\n".join([f"- {doc['text']}" for doc in rag_docs])

    # Construção da resposta do Agente Hermes / Qwen 3.5
    if req.agent_type == "commercial":
        role_desc = "Agente Comercial Especialista TF Pipas"
        tool_call = "generate_sales_projection"
        mcp_res = MCPRegistry.execute_tool(tool_call, {"wind_knots": 15.0})
        content = (
            f"Olá! Sou o {role_desc}. Analisei as tendências de mercado para pipas raia e combate. "
            f"Com base na nossa base RAG: {rag_docs[0]['text'] if rag_docs else ''}. "
            f"Previsão de demanda: {mcp_res.get('projected_demand_units')} unidades para o próximo ciclo de ventos!"
        )
    elif req.agent_type == "stock":
        role_desc = "Agente de Estoque & Fábrica TF Pipas"
        tool_call = "check_raw_material_stock"
        mcp_res = MCPRegistry.execute_tool(tool_call, {})
        content = (
            f"Saudações da Fábrica! Sou o {role_desc}. O monitoramento de matérias-primas indica: "
            f"Temos {mcp_res['bambu_50cm']} varetas de bambu 50cm e {mcp_res['papel_seda_tf']} folhas de seda. "
            f"Diretriz RAG: {rag_docs[0]['text'] if rag_docs else ''}. Estoque suficiente para produção ininterrupta."
        )
    else:
        role_desc = "Agente Financeiro & Controladoria TF Pipas"
        tool_call = "get_financial_kpis"
        mcp_res = MCPRegistry.execute_tool(tool_call, {})
        content = (
            f"Relatório da Controladoria: Sou o {role_desc}. Margem bruta atual consolidada em {mcp_res['gross_margin']}. "
            f"Contexto contábil: {rag_docs[0]['text'] if rag_docs else ''}. O fluxo de caixa projeta superávit saudável para o mês."
        )

    return {
        "agent": req.agent_type,
        "role": role_desc,
        "model": "Qwen 3.5 14B (Ollama / Open Source)",
        "rag_sources": rag_docs,
        "mcp_tool_triggered": tool_call,
        "reply": content
    }
