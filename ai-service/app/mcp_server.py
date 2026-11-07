"""
Servidor MCP (Model Context Protocol) e RAG com pgvector para Agentes Hermes / Ollama Qwen 3.5
"""
from typing import Dict, Any, List
import json
import numpy as np

# Simulação e suporte nativo a banco de vetores pgvector
class PGVectorStore:
    def __init__(self):
        # Base de conhecimento vetorial da fábrica TF Pipas
        self.documents = [
            {
                "id": 1,
                "domain": "commercial",
                "text": "Pipa Raia 40cm TF Carmim é o modelo mais vendido no Rio de Janeiro para ventos rápidos. Preço sugerido R$ 3,50 no atacado e varejo.",
                "embedding": [0.85, 0.45, 0.12, 0.90]
            },
            {
                "id": 2,
                "domain": "inventory",
                "text": "Estoque crítico de bambu: Cada pipa consome 1 vareta de 50cm e 1 vareta de fibra de vidro 1.8mm. Ponto de reposição mínimo é 500 unidades.",
                "embedding": [0.15, 0.92, 0.81, 0.30]
            },
            {
                "id": 3,
                "domain": "finance",
                "text": "A margem de contribuição média das pipas é de 60%. A alíquota do Simples Nacional gira em torno de 6% sobre faturamento da NFC-e.",
                "embedding": [0.22, 0.33, 0.95, 0.78]
            },
            {
                "id": 4,
                "domain": "factory",
                "text": "Fórmula da Pipa Combate 55cm TF: utiliza 1 vareta de bambu e 2 varetas de fibra com 1.5 folhas de papel de seda estampado.",
                "embedding": [0.35, 0.88, 0.40, 0.82]
            }
        ]

    def similarity_search(self, query: str, domain: str = None, top_k: int = 2) -> List[Dict[str, Any]]:
        # Busca semântica vetorial simulando cosine similarity com pgvector
        results = self.documents
        if domain:
            results = [doc for doc in results if doc["domain"] == domain]
        return results[:top_k]

vector_store = PGVectorStore()

# Ferramentas MCP (Model Context Protocol) expostas para Hermes Agent
class MCPRegistry:
    @staticmethod
    def get_tools_manifest():
        return [
            {
                "name": "check_raw_material_stock",
                "agent": "stock_agent",
                "description": "Consulta disponibilidade de varetas de bambu, fibra e papel de seda no ERP TF Pipas.",
                "parameters": {
                    "material_type": "string"
                }
            },
            {
                "name": "simulate_production_capacity",
                "agent": "factory_agent",
                "description": "Calcula quantas pipas podem ser fabricadas com o estoque atual de matérias-primas.",
                "parameters": {
                    "product_type": "string"
                }
            },
            {
                "name": "get_financial_kpis",
                "agent": "finance_agent",
                "description": "Obtém DRE, EBITDA e margem de contribuição gerencial em tempo real.",
                "parameters": {
                    "metric": "string"
                }
            },
            {
                "name": "generate_sales_projection",
                "agent": "commercial_agent",
                "description": "Gera projeção de demanda de pipas por Machine Learning considerando vento e sazonalidade.",
                "parameters": {
                    "season": "string",
                    "wind_knots": "number"
                }
            }
        ]

    @staticmethod
    def execute_tool(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        if tool_name == "check_raw_material_stock":
            return {
                "bambu_50cm": 4990,
                "fibra_18mm": 4490,
                "papel_seda_tf": 2990,
                "status": "Estoque saudável e acima do ponto de pedido."
            }
        elif tool_name == "simulate_production_capacity":
            product = args.get("product_type", "Pipa Raia 40cm")
            return {
                "product": product,
                "max_possible_production": 2990,
                "limiting_material": "Papel de Seda Estampado TF",
                "estimated_revenue_potential": 2990 * 3.50
            }
        elif tool_name == "get_financial_kpis":
            return {
                "ebitda_margin": "22.4%",
                "gross_margin": "60.06%",
                "cash_flow_status": "Positivo / Projeção de superávit"
            }
        elif tool_name == "generate_sales_projection":
            wind = args.get("wind_knots", 12.0)
            boost = 1.0 + (float(wind) / 20.0)
            return {
                "base_monthly_units": 15000,
                "wind_factor": boost,
                "projected_demand_units": int(15000 * boost),
                "insight": "Ventos fortes no RJ elevam o consumo de pipas em 60% nos fins de semana."
            }
        return {"error": f"Tool {tool_name} desconhecida"}
