"""brise_vent — segment de clôture de palmes sèches (afreg), alignée sur X (hauteur 0,55).

Traverse la case de bord à bord (x de -0,5 à +0,5) SANS marge sur X pour se raccorder
aux cases voisines : le contrôleur d'emprise (marge 0,06 sur X) la signale donc, c'est voulu.
Nervures de palmes dressées de part et d'autre de 3 piquets, 2 ligatures par face.
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize
from lib.palette import mix_srgb

NAME = "brise_vent"
FOOTPRINT = (1, 1)
BUDGET = 200

PAILLE = mix_srgb("safran", "chaux_ombre", 0.55)
PAILLE_BRUNE = mix_srgb(PAILLE, "bois", 0.35)
N = 12
HALF = 0.5


def nervure(m, i, side):
    """Palme sèche large à pointe fourchue, un peu penchée ; doublée (vc = simple face)."""
    rnd = m.rnd
    w = 1.0 / N
    x = -HALF + w * (i + 0.5)
    z = side * 0.014
    h1 = rnd.uniform(0.38, 0.44)
    ht = rnd.uniform(0.50, 0.55)
    tilt = rnd.uniform(-0.05, 0.05)
    lim = HALF - 0.004
    wb, wm = w * 0.5, w * 0.62

    def X(px, y):
        return max(-lim, min(lim, px + tilt * y))

    verts = [(X(x - wb, 0), 0, z), (X(x + wb, 0), 0, z),
             (X(x + wm, h1), h1, z), (X(x - wm, h1), h1, z),
             (X(x, h1 + 0.035), h1 + 0.035, z),
             (X(x - wm * 0.9, ht), ht, z), (X(x + wm * 0.9, ht - rnd.uniform(0.0, 0.05)), ht, z)]
    fr = [[0, 1, 2, 3], [3, 2, 4], [3, 4, 5], [4, 2, 6]]
    a = m.add(verts, fr)
    b = m.add(verts, [list(reversed(f)) for f in fr])
    p = a + b
    top = PAILLE_BRUNE if rnd.random() < 0.45 else PAILLE
    p.color_vertex_fn(lambda q, f, top=top: mix_srgb("bois", top, min(1.0, q.y / 0.42) ** 0.8))
    return p.no_cast()


def build():
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    for i in range(N):
        nervure(m, i, 1 if i % 2 == 0 else -1)
    for x in (-0.333, 0.0, 0.333):
        st = m.boxmm((x - 0.022, 0, -0.024), (x + 0.022, 0.46, 0.024), bottom=False)
        st.color("bois_sombre", var=0.05)
    for y in (0.15, 0.33):
        for z in (-0.034, 0.034):
            r = m.boxmm((-HALF, y - 0.009, z - 0.008), (HALF, y + 0.009, z + 0.008),
                        skip=("+x", "-x", "-y"))
            r.color("bois_sombre", var=0.05, shade=1.2)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=24, max_dist=0.12, strength=0.6, height_grad=(0.85, 1.0)),
             strict=False)
