import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

def test_mcp_tools():
    res = client.get("/api/ai/mcp/tools")
    assert res.status_code == 200
    data = res.json()
    assert "tools" in data
    assert len(data["tools"]) >= 4

def test_mcp_execute():
    res = client.post("/api/ai/mcp/execute", json={
        "tool_name": "check_raw_material_stock",
        "arguments": {}
    })
    assert res.status_code == 200
    data = res.json()
    assert "bambu_50cm" in data["result"]

def test_ml_sales_projections():
    res = client.get("/api/ai/ml/projections?start_month=11&count=6")
    assert res.status_code == 200
    data = res.json()
    assert len(data["forecast"]) == 6
    assert data["forecast"][0]["projected_units"] > 0
    assert data["forecast"][0]["estimated_revenue"] > 0

def test_agent_chat():
    for agent in ["commercial", "stock", "finance"]:
        res = client.post("/api/ai/chat", json={
            "agent_type": agent,
            "message": "Qual é a situação atual para planejamento de pipas?"
        })
        assert res.status_code == 200
        data = res.json()
        assert data["agent"] == agent
        assert "reply" in data
        assert len(data["rag_sources"]) > 0
