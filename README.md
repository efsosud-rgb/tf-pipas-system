# TF Pipas · Gestão da loja

Sistema da loja TF Pipas para rodar **num computador da loja, sem internet**:
frente de caixa (PDV), produtos e estoque, controle de caixa, vendas, financeiro
(contas a pagar e a receber, fluxo de caixa e DRE gerencial) e relatórios.

A capa do sistema usa a foto da praia e a logomarca da TF Pipas, com a pipa e o
mar em movimento (vento, ondas, espuma e paralaxe com o cursor).

## Instalação no PC da loja

1. Baixe `Instalar-TF-Pipas-<versão>.exe` e dê dois cliques.
   - O Windows pode mostrar "O Windows protegeu o computador" (o instalador não
     tem assinatura digital): clique em **Mais informações › Executar assim mesmo**.
2. Avance as telas. Não pede senha de administrador: instala em
   `%LOCALAPPDATA%\Programs\TF Pipas` e cria o atalho **TF Pipas** na área de trabalho.
3. Abra pelo atalho. O sistema abre numa janela própria do Microsoft Edge.

Requisitos: Windows 10 (1809+) ou 11, 64 bits. Funciona também em processadores
sem AVX2 (o executável usa a variante *baseline* do Bun).

**Dados**: `…\TF Pipas\dados\tfpipas.db` (SQLite). Backup automático todo dia,
no fechamento do caixa e ao desligar (`dados\backups`, guarda os 90 mais
recentes). Desinstalar **não** apaga a pasta `dados`. Copie um backup para fora
do computador toda semana (Configurações › Cópias de segurança › Baixar).

## Como é feito

```
backend/     servidor local em TypeScript (Bun + SQLite), regras e testes
  src/         dinheiro em centavos, quantidades em milésimos, datas no fuso da loja
  testes/      bun test (63 testes: vendas, caixa, financeiro, estoque, relatórios, API, backup)
  scripts/build.ts   gera a interface e compila tudo num único executável
frontend/    interface React + TypeScript + Vite + Tailwind (sem nada da internet)
  src/capa/    cena WebGL da capa (pipa, mar, linha, vento)
  src/telas/   Início, Frente de caixa, Produtos, Caixa, Vendas, Financeiro, Relatórios, Configurações
instalador/  instalador NSIS (montar.sh gera o .exe)
ferramentas/capa/  scripts que prepararam as imagens da capa a partir da foto original
testes-e2e/  testes de ponta a ponta pela interface (Playwright + Chrome)
```

- O programa é um único `TFPipas.exe`: liga o servidor em `http://127.0.0.1:4747`
  (só o próprio computador acessa; pedidos de outros sites são recusados) e abre
  a interface no Edge em modo aplicativo. Abrir de novo só reabre a janela.
- Nenhum número é inventado: o que não tem base no banco aparece como "—".

### Desenvolvimento

```bash
cd backend && bun install && bun run dev        # API em http://127.0.0.1:4747
cd frontend && npm ci && npm run dev            # interface em http://localhost:5173
cd backend && bun test && bunx tsc --noEmit     # testes e tipos do servidor
cd frontend && npx tsc -b && npm run lint       # tipos e lint da interface
```

### Gerar o instalador

```bash
./instalador/montar.sh     # precisa de bun, node e makensis (NSIS 3)
# → instalador/saida/Instalar-TF-Pipas-<versão>.exe
```

## O que ainda não faz

- **NFC-e**: o comprovante impresso diz "não é documento fiscal". Emitir NFC-e
  exige certificado digital A1, CSC da SEFAZ-RJ e um serviço de emissão.
- **TEF**: a maquininha não conversa com o sistema; o valor do cartão é digitado.
- **Mais de um computador**: os dados ficam num PC só (sem rede/nuvem).
- **Usuários e senhas**: não há login; o operador é informado na abertura do caixa.
