# Interface do TF Pipas

React + TypeScript + Vite + Tailwind. Não acessa a internet: tudo (fontes, imagens,
ícones) vai dentro do programa.

- `npm run dev` — interface em http://localhost:5173 (precisa do servidor rodando:
  `cd ../backend && bun run dev`).
- `npm run build` — gera `dist/`, que o `backend/scripts/build.ts` embute no executável.

Regras da interface:
- Nenhum número inventado: o que não vem do banco aparece como "—" com o motivo.
- Dinheiro sempre em centavos inteiros; a tela só formata.
- Frente de caixa sem animação pesada: a capa animada só roda enquanto está na tela.
