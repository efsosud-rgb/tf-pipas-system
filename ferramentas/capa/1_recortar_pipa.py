import numpy as np, cv2
from PIL import Image
im = np.array(Image.open('foto.png').convert('RGB')).astype(np.int32)
H, W, _ = im.shape
r, g, b = im[..., 0], im[..., 1], im[..., 2]
sky = (b - r > 35) & (b > 140)
roi = np.zeros((H, W), bool); roi[0:500, 400:930] = True
nonsky = (~sky) & roi
m = nonsky.astype(np.uint8) * 255
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
n, lab, stats, cent = cv2.connectedComponentsWithStats(m, 8)
k = lab[240, 668]
comp = (lab == k).astype(np.uint8) * 255
# fill holes
ff = comp.copy(); h, w = ff.shape
mask2 = np.zeros((h + 2, w + 2), np.uint8)
cv2.floodFill(ff, mask2, (0, 0), 255)
filled = comp | cv2.bitwise_not(ff)
cnts, _ = cv2.findContours(filled, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
c = max(cnts, key=cv2.contourArea)
hull = cv2.convexHull(c)
approx = cv2.approxPolyDP(hull, 3.0, True)
print('component area', cv2.contourArea(c), 'hull pts', len(hull), 'approx', approx.reshape(-1, 2).tolist())
ys, xs = np.where(filled > 0); print('bbox', xs.min(), xs.max(), ys.min(), ys.max())
np.save('kite_filled.npy', filled)
np.save('kite_hull.npy', hull.reshape(-1, 2))
vis = np.array(Image.open('foto.png').convert('RGB'))
cv2.polylines(vis, [hull], True, (255, 0, 0), 1)
cv2.drawContours(vis, [c], -1, (0, 255, 0), 1)
Image.fromarray(vis).crop((420, 0, 920, 490)).resize((1000, 980), Image.NEAREST).save('seg_vis.png')
