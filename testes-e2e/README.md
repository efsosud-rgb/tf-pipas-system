# Testes de ponta a ponta (interface)

Usam o programa de verdade (servidor + interface) num Chrome sem janela.

```bash
pip install playwright
cd backend && bun run scripts/build.ts linux
TFPIPAS_DADOS=/tmp/tfpipas-e2e TFPIPAS_ABRIR_NAVEGADOR=0 ./dist/tfpipas &
python3 testes-e2e/fluxo_principal.py http://127.0.0.1:4747 /tmp/fotos
python3 testes-e2e/fluxos_complementares.py http://127.0.0.1:4747 /tmp/fotos
```

`CHROME=/caminho/do/chrome` troca o navegador. Os testes criam produtos e vendas
de teste: use sempre uma pasta de dados vazia (`TFPIPAS_DADOS`), nunca a da loja.
