import numpy as np, cv2
from PIL import Image
im = np.array(Image.open('foto.png').convert('RGB')).astype(np.float32)
gray = im.mean(-1)
# thin bright line detection: pixel brighter than horizontal neighbors at distance 3
pts = []
for y in range(300, 600):
    row = gray[y]
    for x in range(300, 600):
        c = row[x]
        if c - max(row[x-3], row[x+3]) > 8 and c - min(row[x-3], row[x+3]) > 4:
            pts.append((x, y))
pts = np.array(pts, float)
# expected line through (345,593) and (550,330): keep points within 6px
p0 = np.array([345., 593.]); p1 = np.array([550., 330.])
d = p1 - p0; d /= np.linalg.norm(d); nrm = np.array([-d[1], d[0]])
dist = np.abs((pts - p0) @ nrm)
sel = pts[dist < 6]
print('candidates', len(pts), 'selected', len(sel))
# fit line x = a*y + b
A = np.vstack([sel[:,1], np.ones(len(sel))]).T
a, b = np.linalg.lstsq(A, sel[:,0], rcond=None)[0]
print('x = %.5f*y + %.3f' % (a, b))
print('y range', sel[:,1].min(), sel[:,1].max())
res = sel[:,0] - (a*sel[:,1]+b); print('resid std', res.std())
# kite polygon edge left->bottom: (441,283)->(752,464); intersection with line
P = np.array([441.,283.]); Q = np.array([752.,464.])
# solve P + s(Q-P) = (a*y+b, y)
# x = 441 + s*311, y = 283 + s*181 ; x = a*y+b
s = (a*283 + b - 441) / (311 - a*181)
E = P + s*(Q-P); print('entry point on kite edge', E)
for y in (593, 560, 535, 500, 450, 400, 350):
    print(y, a*y+b)
