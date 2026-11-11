import json
import numpy as np, cv2
from PIL import Image

foto = np.array(Image.open('foto.png').convert('RGB'))
H, W, _ = foto.shape  # 1016 x 1001
imf = foto.astype(np.float32)
r, g, b = imf[..., 0], imf[..., 1], imf[..., 2]

# ---------- 1. pipa: máscara ----------
filled = np.load('kite_filled.npy')
mk = cv2.dilate(filled, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))  # ~2px
# ---------- 2. ajuste do céu e remoção da pipa (Poisson) ----------
big = cv2.dilate(mk, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (91, 91)))
small = cv2.dilate(mk, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
ring = (big > 0) & (small == 0)
skyish = (b - r > 55)
sel = ring & skyish
ys, xs = np.where(sel)
X = xs / W; Y = ys / H
A = np.stack([np.ones_like(X), X, Y, X * X, X * Y, Y * Y, Y**3, X*X*Y, X*Y*Y, X**3], 1)
coef = [np.linalg.lstsq(A, imf[ys, xs, c], rcond=None)[0] for c in range(3)]
gy, gx = np.mgrid[0:H, 0:W]
GX = gx / W; GY = gy / H
AA = np.stack([np.ones_like(GX), GX, GY, GX * GX, GX * GY, GY * GY, GY**3, GX*GX*GY, GX*GY*GY, GX**3], -1)
ceu = np.stack([AA @ coef[c] for c in range(3)], -1)
resid = np.stack([imf[ys, xs, c] - (A @ coef[c]) for c in range(3)], -1)
print('ajuste do céu: desvio dos resíduos', resid.std(0).round(2))
rng = np.random.default_rng(7)
ruido = cv2.GaussianBlur(rng.normal(0, 1.6, (H, W, 3)).astype(np.float32), (0, 0), 0.7)
patch = np.clip(ceu + ruido, 0, 255).astype(np.uint8)
clone_mask = cv2.dilate(mk, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))
yy, xx = np.where(clone_mask > 0)
cx, cy = (xx.min() + xx.max()) // 2, (yy.min() + yy.max()) // 2
# Clonagem de Poisson própria (o seamlessClone do OpenCV 5 deu resultado instável aqui):
# resultado = céu ajustado + interpolação harmônica da diferença na borda.
import scipy.sparse as sp, scipy.sparse.linalg as spl
dentro = clone_mask > 0
idx = -np.ones((H, W), np.int64); pts = np.argwhere(dentro); idx[dentro] = np.arange(len(pts))
diff = foto.astype(np.float64) - patch.astype(np.float64)
rows, cols, vals = [], [], []
rhs = np.zeros((len(pts), 3))
for n_, (y_, x_) in enumerate(pts):
    rows.append(n_); cols.append(n_); vals.append(4.0)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        yn, xn = y_ + dy, x_ + dx
        if dentro[yn, xn]:
            rows.append(n_); cols.append(idx[yn, xn]); vals.append(-1.0)
        else:
            rhs[n_] += diff[yn, xn]
Amat = sp.csr_matrix((vals, (rows, cols)), shape=(len(pts), len(pts)))
sol = np.stack([spl.spsolve(Amat, rhs[:, c]) for c in range(3)], -1)
corr = np.zeros((H, W, 3)); corr[dentro] = sol
base = np.clip(patch.astype(np.float64) + corr, 0, 255).astype(np.uint8)
print('remoção da pipa: diferença média na área da pipa', np.abs(base.astype(int) - foto.astype(int))[filled > 0].mean().round(1))
# fora da região clonada mantém o original exato
cm = (clone_mask > 0)[..., None]
base = np.where(cm, base, foto)

# ---------- 3. remove a linha (fora da pipa) ----------
a_lin, b_lin = -0.77427, 804.561
S = np.array([345.5, 594.0])       # sai de trás do ombro
E = np.array([540.57, 340.95])     # encontra a borda da pipa
lm = np.zeros((H, W), np.uint8)
cv2.line(lm, tuple(np.round(S + (S - E) / np.linalg.norm(S - E) * -2).astype(int)), tuple(np.round(E).astype(int)), 255, 5, cv2.LINE_AA)
lm = (lm > 40).astype(np.uint8) * 255
lm[mk > 0] = 0
base = cv2.inpaint(base, lm, 4, cv2.INPAINT_TELEA)

# ---------- 4. menino (proteção) — contorno traçado à mão (cabeça, ombros e braço) ----------
poli = np.array([(255,560),(254,530),(262,515),(278,507),(296,505),(312,511),(322,521),(328,540),(329,560),(323,575),(319,585),
                 (335,589),(352,591),(363,599),(372,610),(382,611),(393,609),(403,611),(410,621),(411,640),(405,653),(391,656),
                 (384,662),(380,1016),(225,1016),(231,620),(236,598),(250,589),(270,585),(276,578),(266,572),(258,566)], np.int32)
menino = np.zeros((H, W), np.uint8)
cv2.fillPoly(menino, [poli], 255)
# pessoas ao fundo (retângulos conferidos na imagem)
pessoas = np.zeros((H, W), np.uint8)
for (x0, y0, x1, y1) in [(628, 553, 654, 608), (826, 546, 846, 585), (946, 543, 964, 570), (964, 543, 985, 588), (985, 541, 1001, 588)]:
    cv2.ellipse(pessoas, ((x0 + x1) // 2, (y0 + y1) // 2), ((x1 - x0) // 2 + 1, (y1 - y0) // 2 + 2), 0, 0, 360, 255, -1)
protege = cv2.dilate(menino | pessoas, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
protege_suave = cv2.GaussianBlur(protege.astype(np.float32) / 255, (0, 0), 4)
protege_suave = np.clip(np.maximum(protege_suave, protege / 255.0), 0, 1)

# ---------- 5. horizonte e linha da praia ----------
bf = base.astype(np.float32)
br, bg_, bb = bf[..., 0], bf[..., 1], bf[..., 2]
lum = bf.mean(-1)
hx, hy = [], []
for x in range(0, W, 3):
    if 225 <= x <= 335:
        continue
    col = lum[518:548, x]
    d = np.diff(col)
    hx.append(x); hy.append(518 + int(np.argmin(d)) + 1)
hx = np.array(hx); hy = np.array(hy)
cf = np.polyfit(hx, hy, 1)
for _ in range(2):
    res = hy - np.polyval(cf, hx); ok_ = np.abs(res) < 3
    cf = np.polyfit(hx[ok_], hy[ok_], 1)
horiz_s = np.polyval(cf, np.arange(W))
h_med = int(round(float(np.median(horiz_s))))
print('horizonte: y = %.4f*x + %.2f' % (cf[0], cf[1]))
areia = ((br - bb) > 38) & (br > 150)
praia = []
for x in range(W):
        # primeiro trecho de areia com pelo menos 12 px seguidos
    yv = None
    run = 0
    for yy_ in range(h_med + 15, H):
        if areia[yy_, x]:
            run += 1
            if run >= 12:
                yv = yy_ - 11; break
        else:
            run = 0
    praia.append(yv if yv is not None else H)
praia = np.array(praia, float)
# suaviza ignorando colunas do menino/pessoas
ok = np.ones(W, bool); ok[218:420] = False
xs_ok = np.arange(W)[ok]
coefp = np.polyfit(xs_ok, praia[ok], 3)
praia_s = np.polyval(coefp, np.arange(W))
print('linha da praia em x=0,300,600,1000:', [round(float(np.polyval(coefp, v)), 1) for v in (0, 300, 600, 1000)])

# ---------- 6. máscaras ----------
yy_, xx_ = np.mgrid[0:H, 0:W]
mar = ((yy_ >= horiz_s[None, :] + 0.5) & (yy_ <= praia_s[None, :] + 6)).astype(np.float32)
mar = cv2.GaussianBlur(mar, (0, 0), 2.0)
mar *= (1 - protege_suave)
# perto do horizonte o mar mexe menos (distância), perto da praia mais
prof = np.clip((yy_ - horiz_s[None, :]) / np.maximum(praia_s[None, :] - horiz_s[None, :], 1), 0, 1)
ceu = (yy_ < horiz_s[None, :] - 3).astype(np.float32)
ceu = cv2.GaussianBlur(ceu, (0, 0), 3) * (1 - protege_suave)
molhada = np.exp(-((yy_ - (praia_s[None, :] + 4)) / 7.0) ** 2) * (1 - protege_suave)
# R = mar, G = céu, B = areia molhada (brilho), A = profundidade do mar (0 horizonte .. 1 praia)
# some aos poucos na borda esquerda da foto (lá ela se mistura com o fundo desfocado)
rampa = np.clip(np.arange(W) / 150.0, 0, 1)[None, :]
mar *= rampa; molhada *= rampa
masc = np.stack([mar, ceu, molhada], -1)
masc = np.clip(masc * 255, 0, 255).astype(np.uint8)

# ---------- 7. recorte da pipa (RGBA) ----------
alpha = cv2.GaussianBlur(mk.astype(np.float32) / 255, (0, 0), 0.6)
alpha = np.clip(alpha * 1.15, 0, 1)
ky, kx = np.where(mk > 0)
pad = 6
x0, x1 = kx.min() - pad, kx.max() + pad + 1
y0, y1 = max(ky.min() - pad, 0), ky.max() + pad + 1
pipa = np.dstack([foto[y0:y1, x0:x1], (alpha[y0:y1, x0:x1] * 255).astype(np.uint8)])
Image.fromarray(pipa, 'RGBA').save('saida/capa-pipa.png', optimize=True)
print('pipa bbox', x0, y0, x1, y1)

# ---------- 8. extensão desfocada à esquerda ----------
# Perfil vertical (mediana por linha das colunas à esquerda do menino) = continuação
# "fora de foco" do céu, mar e areia, sem repetir nuvens nem sombras.
EXT = 1000
perfil = np.median(base[:, 0:215].astype(np.float32), axis=1)          # (H, 3)
perfil = cv2.GaussianBlur(perfil.reshape(H, 1, 3), (1, 0), sigmaX=0.1, sigmaY=6).reshape(H, 3)
plano = np.repeat(perfil[:, None, :], EXT, axis=1)
# perto da foto, mistura com o espelho desfocado para a transição seguir a imagem
P = 205
cols = []
for j in range(EXT):
    d = EXT - j
    k = (d - 1) % (2 * P)
    cols.append(k if k < P else 2 * P - 1 - k)
espelho = base[:, cols].astype(np.float32)
larga_esp = np.concatenate([espelho, base.astype(np.float32)], 1)
desf_esp = cv2.GaussianBlur(larga_esp, (0, 0), 22)[:, :EXT]
dist = (EXT - np.arange(EXT)).astype(np.float32)          # distância até a foto
w_esp = np.clip(1 - dist / 260.0, 0, 1) ** 1.5
ext = plano * (1 - w_esp[None, :, None]) + desf_esp * w_esp[None, :, None]
larga = np.concatenate([ext, base.astype(np.float32)], 1)
desf = cv2.GaussianBlur(larga, (0, 0), 18)
FEATHER = 150
peso = np.zeros(larga.shape[1], np.float32)
xx1 = np.arange(larga.shape[1]) - EXT
peso[xx1 >= 0] = np.clip(xx1[xx1 >= 0] / FEATHER, 0, 1)
peso = (peso ** 1.6)[None, :, None]
fundo = desf * (1 - peso) + larga * peso
# grão leve na extensão para não parecer "plástico"
fundo += rng.normal(0, 1.2, fundo.shape).astype(np.float32) * (1 - peso)
fundo = np.clip(fundo, 0, 255).astype(np.uint8)
Image.fromarray(fundo).save('saida/capa-fundo.jpg', quality=86, optimize=True, progressive=True)
masc_larga = np.concatenate([np.zeros((H, EXT, 3), np.uint8), masc], 1)
# máscara em meia resolução (é suave)
masc_meia = cv2.resize(masc_larga, (masc_larga.shape[1] // 2, H // 2), interpolation=cv2.INTER_AREA)
Image.fromarray(masc_meia, 'RGB').save('saida/capa-mascaras.png', optimize=True)

meta = {
    'foto': {'largura': W, 'altura': H},
    'extensao': EXT,
    'fundo': {'largura': int(larga.shape[1]), 'altura': H},
    'pipa': {'x': int(x0), 'y': int(y0), 'largura': int(x1 - x0), 'altura': int(y1 - y0)},
    'pivo': [602.5, 255.0],
    'linha': {'inicio': S.tolist(), 'fim': E.tolist()},
    'horizonte': [float(cf[0]), float(cf[1])],
    'praia_norm': [float(v) for v in np.polyfit(xs_ok / 1000.0, praia[ok], 3)],
}
json.dump(meta, open('saida/capa.json', 'w'), indent=1)
print(json.dumps(meta))
# prévias
Image.fromarray(base).save('prev_base.png')
Image.fromarray(fundo).resize((fundo.shape[1] // 2, H // 2)).save('prev_fundo.png')
vis = foto.copy(); vis[..., 0] = np.clip(vis[..., 0] + masc[..., 0] * 0.5, 0, 255)
vis[protege > 0] = (vis[protege > 0] * 0.5 + np.array([0, 255, 0]) * 0.5).astype(np.uint8)
Image.fromarray(vis).save('prev_masc.png')
