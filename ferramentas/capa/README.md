# Imagens da capa

Scripts usados para preparar a capa a partir da foto original da praia
(`foto.png` = foto original sem as bordas pretas, 1001 × 1016).
Rodar nesta ordem, na pasta onde está `foto.png` (precisa de numpy, opencv, pillow e scipy):

1. `1_recortar_pipa.py` — separa a pipa do céu (máscara `kite_filled.npy`).
2. `2_achar_linha.py` — acha a linha da pipa (reta e ponto onde encosta na pipa).
3. `3_preparar_capa.py` — gera em `saida/`:
   - `capa-fundo.jpg`: foto sem a pipa e sem a linha (céu refeito por clonagem de
     Poisson), com a continuação desfocada à esquerda para telas largas;
   - `capa-pipa.png`: a pipa recortada (com transparência);
   - `capa-mascaras.png`: R = mar, G = céu, B = areia molhada (onde a cena ondula);
   - `capa.json`: posições (pipa, ponto de giro, linha, horizonte, beira da praia).

Os arquivos gerados ficam em `frontend/src/assets/`.
