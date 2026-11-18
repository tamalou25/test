"""palmier — palmier-dattier adulte (hauteur 3,0), budget 350 triangles.

Nœuds : `palmier` (racine vide) > `tronc` (origine au pied) et `palmes`
(origine au sommet du stipe : le moteur fait osciller ce nœud autour de ce point).
Régimes de dattes rattachés aux palmes.
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize, V
from lib.palette import mix_srgb

NAME = "palmier"
FOOTPRINT = None
BUDGET = 350

PARAMS = dict(
    height=3.0,            # sommet des palmes dressées
    crown=(0.16, 2.62, 0.04),  # sommet du stipe (léger penché vers +X)
    r_base=0.13, r_top=0.095, trunk_sides=5, trunk_rings=7,
    frond_len=(1.45, 1.75), frond_w=0.34,
)


def tronc(m, P):
    cx, cy, cz = P["crown"]
    n = P["trunk_rings"]
    pts, radii = [], []
    for i in range(n + 1):
        t = i / n
        # courbe douce : penché croissant vers le haut
        pts.append((cx * t ** 1.6, cy * t, cz * t ** 1.6))
        r = P["r_base"] + (P["r_top"] - P["r_base"]) * t ** 0.6
        if i == 0:
            r *= 1.25  # empattement
        elif i % 2 == 1:
            r *= 1.10  # anneaux (cicatrices des anciennes palmes)
        radii.append(r)
    with m.using(node="tronc"):
        tr = m.tube(pts, radii, P["trunk_sides"], cap=(False, False), smooth=70)
        tr.clamp_floor()
        sides = P["trunk_sides"]

        def ring_col(f):
            # damier décalé : évoque les écailles (bases des anciennes palmes)
            c = f.calc_center_median()
            k = int(c.y / cy * n)
            a = int(((math.atan2(c.x - cx * (c.y / cy) ** 1.6, c.z) / (2 * math.pi)) % 1) * sides)
            return ("bois", 1.05) if (k + a) % 2 == 0 else ("bois", 0.84)

        tr.color_fn(ring_col, var=0.04)
        # « bourre » de bases de palmes sous la couronne
        boot = m.lathe([(P["r_top"] * 1.05, 0), (P["r_top"] * 1.75, 0.20), (0.0, 0.26)], 6,
                       (cx, cy - 0.22, cz), smooth=50, rot0=30)
        boot.color("bois", var=0.04, face_var=0.08)


def palmes(m, P):
    cx, cy, cz = P["crown"]
    crown = V(cx, cy, cz)
    golden = 137.5
    rnd = m.rnd
    with m.using(node="palmes"):
        # étages : (nombre, élévation initiale, retombée, longueur relative, couleur)
        tiers = [(3, 64, 0.55, 0.75, "palme_jeune"),
                 (4, 36, 0.78, 1.0, "palme"),
                 (4, 14, 0.80, 0.95, "palme_sombre")]
        n = sum(t[0] for t in tiers)
        k = 0
        for count, pitch, droop, lr, col in tiers:
            for j in range(count):
                yaw = (k * golden + rnd.uniform(-8, 8)) % 360
                L = (P["frond_len"][0] + (P["frond_len"][1] - P["frond_len"][0]) * rnd.random()) * lr
                fr = m.frond(crown + V(0, -0.02 * k / n, 0), yaw, pitch + rnd.uniform(-6, 6), L,
                             P["frond_w"] * (0.85 if col == "palme_jeune" else 1.0),
                             droop=droop + rnd.uniform(-0.06, 0.06), segs=5, fold=0.45,
                             serrate=0.5)
                base_col = col
                dark = "palme_sombre"

                def grad(p, f, base_col=base_col, dark=dark, L=L):
                    t = min(1.0, (p - crown).length / L)
                    c = mix_srgb(dark, base_col, min(1.0, t * 1.6))
                    if t > 0.75 and base_col != "palme_sombre":
                        c = mix_srgb(c, "palme_jeune", (t - 0.75) * 1.2)
                    return c

                fr.color_vertex_fn(grad)
                k += 1
        # régimes de dattes pendants
        for yaw in (40, 200):
            a = math.radians(yaw)
            p = crown + V(math.sin(a) * 0.14, -0.10, math.cos(a) * 0.14)
            stem = m.tube([p, p + V(math.sin(a) * 0.10, -0.12, math.cos(a) * 0.10)], 0.014, 3,
                          cap=(False, False), smooth=80)
            stem.color("datte_claire", var=0.05)
            c = p + V(math.sin(a) * 0.12, -0.14, math.cos(a) * 0.12)
            bunch = m.lathe([(0.0, -0.20), (0.075, -0.07), (0.0, 0.03)], 5, c,
                            smooth=75, rot0=yaw)
            bunch.color_fn(lambda f: ("datte", 0.9) if f.calc_center_median().y < c.y - 0.06
                           else ("datte_claire", 0.85), var=0.1)


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    m.node("tronc", (0, 0, 0))
    m.node("palmes", P["crown"])
    tronc(m, P)
    palmes(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.6, strength=0.7, height_grad=(0.85, 1.0)))
