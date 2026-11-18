"""source — bouche de foggara (emprise 2x2).

Affleurement de grès à l'arrière, ouverture voûtée maçonnée et sombre côté +Z d'où
sort l'eau, courte rigole dallée, petite vasque ronde, touffes de roseaux.
Nœuds : `source` (racine) et `eau` (vasque + rigole ; origine au niveau de la vasque).
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize
from lib import archi, nature

NAME = "source"
FOOTPRINT = (2, 2)
BUDGET = 1500

PARAMS = dict(mouth_z=-0.06, arch_w=0.48, arch_h=0.40, open_w=0.24, spring=0.13,
              basin_c=(0.0, 0.56), basin_r=0.27, water_y=0.11)


def affleurement(m, P):
    rocks = [  # centre (x, z), demi-tailles (sx, sy, sz)
        ((0.0, -0.42), (0.60, 0.50, 0.40)),
        ((-0.46, -0.06), (0.26, 0.32, 0.30)),
        ((0.47, -0.08), (0.28, 0.36, 0.30)),
        ((-0.30, -0.66), (0.40, 0.26, 0.24)),
        ((0.40, -0.62), (0.36, 0.30, 0.28)),
        ((-0.72, 0.30), (0.16, 0.10, 0.14)),
        ((0.70, 0.36), (0.14, 0.12, 0.16)),
        ((0.30, 0.86), (0.08, 0.06, 0.07)),
    ]
    for (x, z), size in rocks:
        nature.rock(m, (x, 0, z), size, seg=7, rings=4, jitter=0.15)
    # quelques pierres plates du dallage
    for (x, z) in ((-0.26, 0.30), (0.26, 0.24), (-0.38, 0.62), (0.40, 0.70)):
        nature.rock(m, (x, 0, z), (0.07, 0.025, 0.06), seg=5, rings=2, jitter=0.12,
                    colors=("pierre", "pierre_sombre"), top_color="pierre")


def bouche(m, P):
    z = P["mouth_z"]
    t = 0.18
    a = m.arch_wall(P["arch_w"], P["arch_h"], t, P["open_w"], P["spring"], horse_deg=20, n=10)
    a.translate(0, 0, z)
    a.color_fn(lambda f: ("pierre_sombre", 0.9) if abs(f.normal.z) < 0.5 and f.normal.y < 0.99
               and abs(f.calc_center_median().x) < P["open_w"] / 2 + 0.02 else ("pierre", 1.0), var=0.03)
    # fond noir de la galerie
    pts, top = m.horseshoe(P["open_w"], P["spring"], 20, 10)
    back = m.add([(x, y, z - t / 2 + 0.002) for x, y in pts], [list(range(len(pts)))])
    for f in back.faces:
        if f.normal.z < 0:
            f.normal_flip()
    back.color("#1a120c", var=0.0).no_ao()
    # linteau de palmier au-dessus de l'arc
    lin = m.beam((-0.20, top + 0.05, z + t / 2 + 0.01), (0.20, top + 0.05, z + t / 2 + 0.01), w=0.045,
                 h=0.04)
    lin.color("bois", var=0.05)


def rigole_vasque(m, P):
    z0 = P["mouth_z"] + 0.09
    bx, bz = P["basin_c"]
    R = P["basin_r"]
    zb = bz - R + 0.04
    cw = 0.10
    for sx in (-1, 1):
        bank = m.boxmm((sx * cw / 2 - 0.03 if sx > 0 else -cw / 2 - 0.03, 0, z0 - 0.08),
                       (cw / 2 + 0.03 if sx > 0 else -cw / 2, 0.06, zb + 0.02), bevel=0.012, bottom=False)
        if sx > 0:
            bank.translate(0.0, 0, 0)
        bank.color("pierre", var=0.04)
    bed = m.add([(-cw / 2, 0.004, z0 - 0.08), (cw / 2, 0.004, z0 - 0.08), (cw / 2, 0.004, zb),
                 (-cw / 2, 0.004, zb)], [[0, 1, 2, 3]])
    for f in bed.faces:
        if f.normal.y < 0:
            f.normal_flip()
    bed.color("boue_sombre").no_cast()
    # vasque ronde de pierre
    v = m.lathe([(R, 0), (R, 0.13), (R + 0.02, 0.15), (R - 0.06, 0.15), (R - 0.06, 0.03), (0.0, 0.03)],
                12, (bx, 0, bz), smooth=40, cap=False)

    def col(f):
        c = f.calc_center_median()
        rr = math.hypot(c.x - bx, c.z - bz)
        if c.y > 0.14:
            return ("pierre", 1.06)
        return ("pierre_sombre", 0.85) if rr < R - 0.03 else ("pierre", 1.0)

    v.color_fn(col, var=0.03)
    archi.water(m, archi.regular_poly(R - 0.055, 12, 0, bx, bz), P["water_y"])
    archi.water(m, [(-cw / 2, z0 - 0.08), (cw / 2, z0 - 0.08), (cw / 2, zb + 0.02), (-cw / 2, zb + 0.02)],
                0.045)


def vegetation(m, P):
    for (x, z, h) in ((-0.40, 0.42, 0.22), (0.38, 0.46, 0.18), (-0.22, 0.84, 0.14), (0.62, 0.10, 0.20),
                      (-0.64, 0.12, 0.16)):
        nature.tuft(m, (x, 0, z), h=h, n=5, color="palme_sombre")


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    affleurement(m, P)
    bouche(m, P)
    rigole_vasque(m, P)
    vegetation(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.35, strength=0.75))
