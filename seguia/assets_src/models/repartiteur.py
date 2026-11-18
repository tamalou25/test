"""repartiteur — peigne répartiteur (kesria) : petit bassin de pierre bas, peigne à dents
sur ses 4 côtés axiaux, rigoles (séguias) partant vers les 4 bords de la case. Emprise 1x1,
hauteur ≤ 0,18. Nœuds : `repartiteur` (racine) et `eau` (bassin + rigoles).
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize
from lib import archi

NAME = "repartiteur"
FOOTPRINT = (1, 1)
BUDGET = 1000

PARAMS = dict(apothem=0.20, wall_t=0.055, wall_h=0.13, water_y=0.085, teeth=4, chan_w=0.11)


def octo_side(a, i):
    """Centre, angle (degrés) et longueur du côté i d'un octogone d'apothème a (i pair = axial)."""
    ang = 45.0 * i
    s = 2 * a * math.tan(math.radians(22.5))
    r = math.radians(ang)
    return (a * math.sin(r), a * math.cos(r)), ang, s


def bassin(m, P):
    a, t, h = P["apothem"], P["wall_t"], P["wall_h"]
    for i in range(8):
        (cx, cz), ang, s = octo_side(a + t / 2, i)
        if i % 2 == 1:
            w = m.box((s + 0.035, h, t), (0, 0, 0), bevel=0.01, bottom=False)
            w.color("pierre", var=0.03, face_var=0.04)
            w.rotate_y(ang).translate(cx, 0, cz)
        else:
            # peigne : dents de pierre séparées par des fentes
            n = P["teeth"]
            sw = s + 0.03
            tw = sw / (2 * n - 1)
            for k in range(n):
                x0 = -sw / 2 + 2 * k * tw
                tooth = m.boxmm((x0, 0, -t / 2), (x0 + tw, h * 0.92, t / 2), bevel=0.006, bottom=False)
                tooth.color("pierre", var=0.04, shade=1.05)
                tooth.rotate_y(ang).translate(cx, 0, cz)
            sill = m.boxmm((-sw / 2, 0, -t / 2), (sw / 2, 0.035, t / 2), bottom=False)
            sill.color("pierre_sombre", var=0.03).rotate_y(ang).translate(cx, 0, cz)
    floor = m.add([(x, 0.02, z) for x, z in archi.regular_poly(a / math.cos(math.radians(22.5)), 8, 22.5)],
                  [list(range(8))])
    for f in floor.faces:
        if f.normal.y < 0:
            f.normal_flip()
    floor.color("boue_sombre", var=0.0)
    archi.water(m, archi.regular_poly((a + 0.01) / math.cos(math.radians(22.5)), 8, 22.5),
                P["water_y"])


def rigoles(m, P):
    a, t, cw = P["apothem"], P["wall_t"], P["chan_w"]
    r0, r1 = a + t, 0.44  # marge de 0,06 imposée par les conventions
    for i in range(0, 8, 2):
        ang = 45.0 * i
        parts = []
        for sx in (-1, 1):
            x0 = sx * cw / 2
            bank = m.boxmm((min(x0, x0 + sx * 0.05), 0, r0 - 0.01), (max(x0, x0 + sx * 0.05), 0.05, r1),
                           bevel=0.016, bottom=False)
            bank.color("pise", var=0.03, face_var=0.04)
            parts.append(bank)
        bed = m.add([(-cw / 2, 0.006, r0), (cw / 2, 0.006, r0), (cw / 2, 0.006, r1), (-cw / 2, 0.006, r1)],
                    [[0, 1, 2, 3]])
        for f in bed.faces:
            if f.normal.y < 0:
                f.normal_flip()
        bed.color("boue_sombre", var=0.02).no_cast()
        for p in parts + [bed]:
            p.rotate_y(ang)
        # filet d'eau dans la rigole (même nœud `eau`, un peu plus bas que le bassin)
        c, s_ = math.cos(math.radians(ang)), math.sin(math.radians(ang))

        def rot(x, z):
            return (x * c + z * s_, -x * s_ + z * c)

        poly = [rot(-cw / 2 + 0.01, r0 - 0.01), rot(cw / 2 - 0.01, r0 - 0.01),
                rot(cw / 2 - 0.01, r1), rot(-cw / 2 + 0.01, r1)]
        archi.water(m, poly, P["water_y"] - 0.045)


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    bassin(m, P)
    rigoles(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.15, strength=0.75))
