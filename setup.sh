#!/usr/bin/env bash

# ==============================================================================
# TF Pipas System 🪁 - Script de Inicialização e Setup Automatizado
# ==============================================================================
# Executa a verificação dos pré-requisitos, inicializa os serviços via Docker Compose
# e aguarda a prontidão do banco com pgvector, backend Laravel, microsserviço de IA e frontend.
# ==============================================================================

set -e

# Cores oficiais da marca TF Pipas para o terminal
CARMIM="\033[38;2;230;57;70m"
LARANJA="\033[38;2;244;162;97m"
AMARELO="\033[38;2;233;196;106m"
VERDE="\033[38;2;42;157;143m"
RESET="\033[0m"
NEGRITO="\033[1m"

echo -e "${CARMIM}${NEGRITO}"
cat << 'BANNER'
  _______ ______   _____ _____ _____            _____   ______ _____  _____
 |__   __|  ____| |  __ \_   _|  __ \   /\     / ____| |  ____|  __ \|  __ \
    | |  | |__    | |__) || | | |__) | /  \   | (___   | |__  | |__) | |__) |
    | |  |  __|   |  ___/ | | |  ___/ / /\ \   \___ \  |  __| |  _  /|  ___/
    | |  | |      | |    _| |_| |    / ____ \  ____) | | |____| | \ \| |
    |_|  |_|      |_|   |_____|_|   /_/    \_\|_____/  |______|_|  \_\_|
BANNER
echo -e "${LARANJA}  ==> SISTEMA ERP 5D INDUSTRIAL & VAREJO - TF PIPAS (RJ) <==${RESET}\n"

# 1. Verificação de pré-requisitos
echo -e "${AMARELO}[1/4] Verificando dependências do sistema...${RESET}"
if ! command -v docker &> /dev/null; then
    echo -e "${CARMIM}ERRO: Docker não está instalado no sistema.${RESET}"
    exit 1
fi

if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo -e "${CARMIM}ERRO: Docker Compose não foi encontrado.${RESET}"
    exit 1
fi
echo -e "${VERDE}✔ Docker e Docker Compose detectados com sucesso.${RESET}"

# 2. Construção das imagens e subida dos serviços
echo -e "\n${AMARELO}[2/4] Construindo imagens e iniciando os serviços do TF Pipas System...${RESET}"
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --build

# 3. Aguardar disponibilidade dos serviços
echo -e "\n${AMARELO}[3/4] Aguardando prontidão dos serviços...${RESET}"
echo "Aguardando inicialização do banco PostgreSQL com pgvector..."
sleep 5

# 4. Exibir status e links de acesso
echo -e "\n${AMARELO}[4/4] Verificando status dos contêineres:${RESET}"
docker compose ps

echo -e "\n${VERDE}${NEGRITO}========================================================================${RESET}"
echo -e "${VERDE}${NEGRITO} TF PIPAS SYSTEM INICIALIZADO COM SUCESSO! 🪁${RESET}"
echo -e "${VERDE}${NEGRITO}========================================================================${RESET}"
echo -e " Interface PDV / ERP (React PWA):    ${LARANJA}http://localhost:3000${RESET} ou ${LARANJA}http://localhost:80${RESET}"
echo -e " Backend API RESTful (Laravel):      ${LARANJA}http://localhost:8000/api${RESET}"
echo -e " Microsserviço IA (FastAPI + MCP):   ${LARANJA}http://localhost:8001/docs${RESET}"
echo -e " Banco de Dados (PostgreSQL pgvector): porta ${LARANJA}5432${RESET}"
echo -e "------------------------------------------------------------------------"
echo -e " Para acompanhar os logs em tempo real: ${AMARELO}docker compose logs -f${RESET}"
echo -e " Para encerrar os serviços:             ${AMARELO}docker compose down${RESET}"
echo -e "========================================================================\n"
