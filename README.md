# TF Pipas · Gestão da loja

Sistema da loja TF Pipas para rodar **num computador da loja, sem internet**:
frente de caixa (PDV) com várias formas de pagamento na mesma venda, desconto e
preço por quantidade (atacado), produtos e estoque com aviso de "acabando",
sugestão e registro de produção, controle de caixa, vendas, usuários com
permissões, financeiro (lançamento de despesas, contas a pagar e a receber,
fluxo de caixa dia a dia, DRE com lucro líquido e mês a mês) e relatórios
(rentabilidade por produto, curva ABC, categoria, forma de pagamento e vendedor).

A capa do sistema usa a foto da praia e a logomarca da TF Pipas, com a pipa e o
mar em movimento (vento, ondas, espuma e paralaxe com o cursor).

## Instalação no PC da loja

1. Baixe `Instalar-TF-Pipas-<versão>.exe` e dê dois cliques.
   - O Windows pode mostrar "O Windows protegeu o computador" (o instalador não
     tem assinatura digital): clique em **Mais informações › Executar assim mesmo**.
2. Avance as telas. Não pede senha de administrador: instala em
   `%LOCALAPPDATA%\Programs\TF Pipas` e cria o atalho **TF Pipas** na área de trabalho.
3. Abra pelo atalho. O sistema abre numa janela própria do Microsoft Edge.
4. **Primeiro acesso**: crie o administrador (nome e senha) e guarde o **código
   de recuperação** que aparece em seguida (anote ou imprima). Ele é a única forma
   de criar uma senha nova se o administrador esquecer a dele. Depois cadastre os
   funcionários em Configurações › Usuários.

Atualizando da 1.0: instale a 1.1 por cima. Produtos, vendas, caixa e financeiro
ficam; o banco é migrado na primeira abertura (com backup antes) e o sistema pede
para criar o administrador.

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
  testes/      bun test (vendas, caixa, financeiro, estoque, produção, preços por quantidade, usuários, relatórios, API, backup, migração)
  scripts/build.ts   gera a interface e compila tudo num único executável
frontend/    interface React + TypeScript + Vite + Tailwind (sem nada da internet)
  src/capa/    cena WebGL da capa (pipa, mar, linha, vento)
  src/telas/   Capa/entrada, Início, Frente de caixa, Produtos, Produção, Caixa, Vendas, Financeiro, Relatórios, Configurações
instalador/  instalador NSIS (montar.sh gera o .exe)
ferramentas/capa/  scripts que prepararam as imagens da capa a partir da foto original
testes-e2e/  testes de ponta a ponta pela interface (Playwright + Chrome)
```

- O programa é um único `TFPipas.exe`: liga o servidor em `http://127.0.0.1:4747`
  (só o próprio computador acessa; pedidos de outros sites são recusados) e abre
  a interface no Edge em modo aplicativo. Abrir de novo só reabre a janela.
- Nenhum número é inventado: o que não tem base no banco aparece como "—" (ex.:
  sugestão de produção de produto sem venda no período, mês antes de usar o sistema).
- Entrada com usuário e senha (argon2id). A sessão fica num cookie HttpOnly que
  vence após 14 h sem uso; o servidor confere a permissão de cada pedido e só
  manda custo e lucro para quem pode ver. Perfis: administrador (tudo) e
  funcionário (vende e cuida do caixa; desconto, cancelamento, produtos e
  financeiro são liberados por pessoa).

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
- **Preço por quantidade misturando modelos**: a faixa de atacado vale por produto
  (10 pipas iguais); 10 pipas de modelos diferentes não somam para a faixa.
