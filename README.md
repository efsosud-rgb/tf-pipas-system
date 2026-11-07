# TF Pipas System 🪁 (5D ERP Industrial & Varejo)

Sistema ERP completo e inteligente desenvolvido sob medida para a **TF Pipas**, integrando frente de loja (PDV), chão de fábrica com engenharia reversa de materiais (BOM), gestão financeira contábil/gerencial com DRE e microsserviço de Inteligência Artificial preditiva e agentes autônomos (Hermes Agent / Ollama Qwen 3.5 / MCP).

---

## 1. Identidade Visual 5D & Brand Design

- **Paleta Oficial TF Pipas**:
  - Vermelho Carmim: `#E63946`
  - Laranja Pôr do Sol: `#F4A261`
  - Amarelo Dourado: `#E9C46A`
  - Dark Glassmorphism: `#0F172A` (com transparência `rgba(15, 23, 42, 0.75)`, backdrop blur e bordas refinadas `white/10`)
- **Componente 3D/5D Interativo (Three.js)**:
  - Localizado no cabeçalho e na aba dedicada "Ambiente 5D Pipa TF" (`Kite3DCanvas.tsx`).
  - Renderiza o formato icônico da **Pipa Raia Carioca** em malhas 3D com curvatura real da vara de fibra e espinha de bambu.
  - Variação aerodinâmica em tempo real baseada na movimentação do cursor do mouse (Euler pitch/yaw/roll suave com interpolação `lerp`).
  - Cauda dinâmica articulada com múltiplos segmentos oscilando em ondas senoidais simulando vento real.
  - Nuvem de partículas flutuantes translúcidas representando o fluxo aerodinâmico atmosférico.

---

## 2. Arquitetura do Sistema (Monorepo)

```
.
├── backend/            # API RESTful Laravel (PHP 8.3 / SQLite / MySQL)
│   ├── app/
│   │   ├── Http/Controllers/Api/  # PosController, ProductionOrderController, FinancialController
│   │   └── Models/                # Material, Product, BomItem, ProductionOrder, Sale, FinancialTransaction
│   ├── database/migrations/       # Esquema relacional com integridade referencial
│   └── routes/api.php             # Endpoints RESTful completos
├── frontend/           # Interface PWA React 19 + TypeScript + Vite + Tailwind CSS + Three.js
│   ├── src/
│   │   ├── components/
│   │   │   ├── Kite3DCanvas.tsx       # Renderizador Three.js 5D da Pipa Raia
│   │   │   ├── PosView.tsx            # PDV com leitor de código de barras e atalhos F2/F4/F8/F9/F12
│   │   │   ├── NfceThermalReceipt.tsx # Cupom fiscal térmico 80mm SEFAZ-RJ com QR Code
│   │   │   ├── FactoryView.tsx        # Controle de insumos, estoque e Ordem de Produção BOM
│   │   │   ├── FinancialView.tsx      # DRE gerencial, Fluxo de Caixa e ML de vendas
│   │   │   └── AiAgentsView.tsx       # Central Hermes Agent com MCPs e RAG
│   │   └── App.tsx                    # Shell com navegação e status SEFAZ/Qwen
└── ai-service/         # Microsserviço Python FastAPI (Ollama Qwen 3.5, pgvector RAG & MCPs)
    ├── app/
    │   ├── main.py            # Endpoints RAG, MCP Registry e Projeção de Demanda
    │   ├── ml_forecasting.py  # Modelo Machine Learning (Ridge) com vento RJ e férias escolares
    │   ├── mcp_tools.py       # Definição e execução de MCPs (Model Context Protocol)
    │   └── vector_store.py    # Memória vetorial com embeddings semânticos pgvector
    └── requirements.txt
```

---

## 3. Módulos do ERP

### 3.1 Frente de Loja (PDV Balcão)
- **Leitor de Código de Barras**: Entrada via leitor USB / teclado com autofocus permanente e detecção de `Enter`.
- **Atalhos Operacionais de Alta Velocidade**:
  - `F2`: Finalizar Venda / Abrir Checkout
  - `F4`: Cancelar / Limpar Venda Atual
  - `F8`: Aplicar Desconto Promocional
  - `F9`: Focar Leitor de Código de Barras
  - `F12`: Emitir NFC-e Imediata
- **Formas de Pagamento**: PIX dinâmico com geração de QR Code Copia e Cola, Cartão de Crédito/Débito e Dinheiro com cálculo automático de troco.
- **Emissão Simulada de NFC-e (SEFAZ-RJ)**:
  - Gera chave de acesso oficial de 44 dígitos no formato `33.26.11.12.345.678/0001-90.65.001.000000001.1.XXXXXXXX.X`.
  - Número de protocolo de autorização e link de consulta com QR Code oficial SEFAZ-RJ.
  - Impressão térmica padronizada para bobina de 80mm com estilização `@media print`.

### 3.2 Estoque e Chão de Fábrica (Engenharia de Produção - BOM)
- Gestão de Matérias-Primas:
  - Varetas de Bambu Taquara 50cm / 60cm
  - Varetas de Fibra de Vidro (1.8mm a 2.2mm)
  - Papel de Seda 40x40cm em diversas estampas
  - Tubos de Linha 10 Corrente e Linha de Poliuretano
  - Cola Branca PVA para colagem de bainha
- **Ordens de Produção (OP)**:
  - Consumo automatizado de insumos por produto via Bill of Materials (BOM).
  - Bloqueio automático de produção em caso de insumos insuficientes.
  - Registro atômico de transação: baixa física nos insumos e entrada física imediata no estoque de produtos acabados.

### 3.3 Financeiro e Gestão Estratégica
- **DRE Gerencial Completo**:
  - Receita Bruta de Vendas (PDV e Atacado)
  - Deduções e Impostos sobre Faturamento (Simples Nacional)
  - Receita Operacional Líquida
  - Custo dos Produtos Vendidos (CPV - Insumos)
  - Margem de Contribuição / Lucro Bruto
  - Despesas Operacionais (Aluguel, Folha, Energia, Logística)
  - LAJIDA / EBITDA Gerencial
  - Resultado Líquido do Exercício
- **Fluxo de Caixa**: Contas a Pagar e Contas a Receber com filtros por status e liquidação em tempo real.
- **Projeção de Vendas baseada em Machine Learning**:
  - Modelo treinado via regressão ponderada correlacionando histórico sazonal com velocidade média de vento costeiro no RJ (nós) e períodos de férias escolares cariocas.

---

## 4. Camada de Inteligência Artificial (Open Source)

- **Ollama com Qwen 3.5**: Raciocínio local open-source para atendimento comercial, auditoria de estoque e conferência contábil.
- **pgvector para RAG (Retrieval-Augmented Generation)**: Indexação semântica de catálogos técnicos, regras de tributação SEFAZ-RJ e manuais de fabricação com similaridade de cosseno.
- **Hermes Agent & MCPs (Model Context Protocol v1.0)**:
  - `check_raw_material_stock`: Inspeção de estoque de insumos críticos e alerta de reposição.
  - `simulate_production_capacity`: Simulação de capacidade de montagem baseada nos insumos disponíveis.
  - `get_financial_kpis`: Extração analítica de EBITDA, Margem Bruta e Ponto de Equilíbrio.
  - `generate_sales_projection`: Previsão quantitativa de demanda integrando dados climáticos.

---

## 5. Como Executar a Aplicação Localmente

### Pré-requisitos
- PHP 8.2+ e Composer
- Node.js 18+ e npm
- Python 3.10+ e pip

### Inicialização Rápida

1. **Backend (Laravel)**:
   ```bash
   cd backend
   composer install
   php artisan migrate --seed
   php artisan serve --port=8000
   ```

2. **Microsserviço de IA (Python FastAPI)**:
   ```bash
   cd ai-service
   pip install -r requirements.txt
   uvicorn app.main:app --host 0.0.0.0 --port 8001
   ```

3. **Frontend (React PWA)**:
   ```bash
   cd frontend
   npm install
   npm run dev -- --host 0.0.0.0 --port 3000
   ```

Acesse a interface através do navegador em `http://localhost:3000`.
