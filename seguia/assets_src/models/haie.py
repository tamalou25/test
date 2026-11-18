"""haie — segment de haie de tamaris touffue, alignée sur X (hauteur 0,6), verts gris.

Traverse la case de bord à bord (x de -0,5 à +0,5) ; la section aux deux bouts est
identique (relief périodique) pour que les segments se raccordent. Pas de marge sur X :
le contrôleur d'emprise la signale, c'est voulu.
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize
from lib.palette import mix_srgb
from _communs_accessoires import plane

NAME = "haie"
FOOTPRINT = (1, 1)
BUDGET = 200

H = 0.43
HW = 0.19
STATIONS = 11
M_SEG = 8
VERT = mix_srgb("palme_sombre", "pierre_sombre", 0.40)
VERT_CLAIR = mix_srgb("palme", "pierre", 0.50)
VERT_JEUNE = mix_srgb("palme_jeune", "pierre", 0.40)
ROSE = mix_srgb("garance", "chaux", 0.62)


def build():
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    rnd = m.rnd
    ph = [rnd.uniform(0, 6.28) for _ in range(4)]

    def relief(x, th):
        # périodique en x (période 1) : bouts identiques
        return (0.11 * math.sin(2 * math.pi * x + ph[0] + 2 * th)
                + 0.11 * math.sin(4 * math.pi * x + ph[1] - th)
                + 0.08 * math.sin(6 * math.pi * x + ph[2] + 3 * th))

    jit = {}
    for j in range(M_SEG + 1):
        for s in range(STATIONS - 1):
            jit[(s, j)] = rnd.uniform(-0.10, 0.10)
    ring_pts = []
    for s in range(STATIONS):
        x = -0.5 + s / (STATIONS - 1)
        key_s = 0 if s == STATIONS - 1 else s
        row = []
        for j in range(M_SEG + 1):
            th = math.pi * j / M_SEG
            k = 1.0 + relief(x, th) + jit[(key_s, j)] * (0 if j in (0, M_SEG) else 1)
            if j in (0, M_SEG):
                k = 1.0 + 0.04 * relief(x, th)
            row.append((x, H * math.sin(th) * k if j not in (0, M_SEG) else 0.0, HW * math.cos(th) * k))
        ring_pts.append(row)
    verts, faces = [], []
    idx = {}
    for s in range(STATIONS):
        for j in range(M_SEG + 1):
            idx[(s, j)] = len(verts)
            verts.append(ring_pts[s][j])
    for s in range(STATIONS - 1):
        for j in range(M_SEG):
            faces.append([idx[(s, j)], idx[(s + 1, j)], idx[(s + 1, j + 1)], idx[(s, j + 1)]])
    p = m.add(verts, faces)
    for f in p.faces:
        c = f.calc_center_median()
        f.normal_update()
        if f.normal.dot(c - type(c)((c.x, 0.15, 0.0))) < 0:
            f.normal_flip()
    # bouchons d'extrémité (cachés quand un segment voisin est posé)
    for s, sg in ((0, -1), (STATIONS - 1, 1)):
        cap = m.add([ring_pts[s][j] for j in range(M_SEG + 1)], [list(range(M_SEG + 1))])
        for f in cap.faces:
            f.normal_update()
            if f.normal.x * sg < 0:
                f.normal_flip()
        cap.color(VERT, var=0.02, shade=0.7)

    def col(f):
        c = f.calc_center_median()
        t = min(1.0, c.y / H)
        if f.normal.y > 0.3 and t > 0.6 and rnd.random() < 0.06:
            return (ROSE, 1.0)                       # grappes de fleurs de tamaris
        base = mix_srgb(VERT, VERT_CLAIR, min(1.0, t * 1.3))
        if t > 0.8:
            base = mix_srgb(base, VERT_JEUNE, (t - 0.8) * 3)
        return (base, 0.92 + 0.22 * t + rnd.uniform(-0.09, 0.09))

    p.color_fn(col, var=0.02)
    p.flat()
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=32, max_dist=0.2, strength=0.45, height_grad=(0.9, 1.0)),
             strict=False)
