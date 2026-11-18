"""puits — puits à margelle de pierre avec chadouf (emprise 1x1).

Margelle ronde de pierre sur un dallage, fourche de palmier plantée à l'arrière (-Z),
balancier qui passe entre les deux dents de la fourche : seau de cuir au bout avant
(au-dessus du puits), contrepoids de pierres ficelées au bout arrière. Auge de pierre
et rigole vers +X, jarres, corde, seau posé.

Nœuds : `puits` (racine) et `bras` (balancier + seau + contrepoids). L'ORIGINE de
`bras` est le pivot (cheville de la fourche) ; le moteur le fait osciller autour de
son axe X local (= X du modèle, pas de rotation de nœud).
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize, V
from _communs_batiments import merge, stone_ring, disc, rope_coil, flip_up

NAME = "puits"
FOOTPRINT = (1, 1)
BUDGET = 900

PARAMS = dict(
    well=(0.04, 0.13), r_out=0.175, r_in=0.115, rim_h=0.21,
    pivot=(0.04, 0.60, -0.15), front=0.37, back=0.22, tilt=20.0,
)


def margelle(m, P):
    wx, wz = P["well"]
    # dallage irrégulier autour du puits
    slab = m.lathe([(0.26, 0.0), (0.25, 0.025), (0.18, 0.03)], 9, (wx, 0, wz), smooth=20, cap=False,
                   rot0=12)
    slab.jitter(0.008).clamp_floor()
    slab.color_fn(lambda f: ("pierre_sombre", 1.0) if f.normal.y < 0.8 else ("pierre", 0.96), var=0.04)
    ring = stone_ring(m, (wx, 0.0, wz), P["r_out"], P["r_in"], P["rim_h"], n=10, lip=0.012,
                      inner_depth=0.05, courses=3)
    # assises de pierre : bande plus sombre à mi-hauteur
    # fond du puits : noir profond
    hole = disc(m, (wx, 0.05, wz), P["r_in"] + 0.002, n=10)
    hole.color("#140d08", var=0.0).no_ao()
    # deux pierres plates posées sur la margelle (appui du seau)
    st = m.box((0.07, 0.025, 0.05), (wx + 0.14, P["rim_h"], wz - 0.03), bevel=0.006, rot_y=30, bottom=False)
    st.color("pierre", var=0.05, shade=1.06)


def fourche(m, P):
    px, py, pz = P["pivot"]
    # tronc de palmier, légèrement de biais, plus épais en bas
    trunk = m.tube([(px, 0.0, pz - 0.01), (px + 0.005, 0.25, pz), (px, 0.44, pz)], [0.034, 0.03, 0.028], 6,
                   cap=(False, False), smooth=60)
    trunk.clamp_floor()
    trunk.color_fn(lambda f: ("bois", 0.9 + 0.12 * (int(f.calc_center_median().y * 28) % 2)), var=0.02)
    # deux dents
    for s in (-1, 1):
        prong = m.tube([(px, 0.42, pz), (px + s * 0.035, 0.52, pz), (px + s * 0.042, py + 0.06, pz)],
                       [0.022, 0.019, 0.016], 5, cap=(False, True), smooth=60)
        prong.color("bois", var=0.05)
    # cheville du pivot (axe X)
    pin = m.tube([(px - 0.07, py, pz), (px + 0.07, py, pz)], 0.009, 4, smooth=60)
    pin.color("bois_sombre", var=0.03)
    # butte de terre tassée au pied, cales de pierre
    mound = m.lathe([(0.10, 0.0), (0.07, 0.05), (0.035, 0.07)], 7, (px, 0, pz), smooth=40, cap=False)
    mound.color("pise_sombre", var=0.04)
    for a in (20, 150, 260):
        r = math.radians(a)
        s = m.box((0.05, 0.035, 0.04), (px + 0.09 * math.cos(r), 0.0, pz + 0.09 * math.sin(r)),
                  bevel=0.006, rot_y=a, bottom=False)
        s.color("pierre", var=0.06)


def balancier(m, P):
    px, py, pz = P["pivot"]
    m.node("bras", (px, py, pz))
    t = math.radians(P["tilt"])
    d = V(0, math.sin(t), math.cos(t))           # vers l'avant (+Z) et vers le haut
    piv = V(px, py, pz)
    tip = piv + d * P["front"]
    tail = piv - d * P["back"]
    with m.using(node="bras"):
        pole = m.tube([tail, piv, tip], [0.022, 0.02, 0.014], 6, smooth=60)
        pole.color_fn(lambda f: ("bois", 0.95 + 0.1 * (int(f.calc_center_median().z * 30) % 2)), var=0.02)
        # contrepoids : pierres ficelées dans un filet, sous le bout arrière
        cw = m.sphere(1.0, 7, 4).scale(0.06, 0.05, 0.055).translate(tail.x, tail.y - 0.06, tail.z + 0.01)
        cw.jitter(0.006)
        cw.color_fn(lambda f: ("roche_sombre", 1.0) if f.normal.y < -0.2 else ("roche", 1.0), var=0.06)
        lash = m.tube([tail + V(0, 0.01, 0), V(tail.x, tail.y - 0.03, tail.z + 0.01)], 0.006, 3,
                      cap=(False, False))
        lash.color("ecru", var=0.03, shade=0.85)
        band = m.lathe([(0.061, 0), (0.061, 0.012)], 7, (tail.x, tail.y - 0.07, tail.z + 0.01), cap=False)
        band.color("ecru", var=0.03, shade=0.8)
        # corde du seau
        b_top = V(tip.x, tip.y - 0.30, tip.z)
        rope = m.tube([tip, b_top + V(0, 0.07, 0)], 0.005, 3, cap=(False, False))
        rope.color("ecru", var=0.03, shade=0.82)
        # anse
        for s in (-1, 1):
            h = m.tube([b_top + V(0, 0.07, 0), b_top + V(s * 0.045, 0.0, 0)], 0.004, 3, cap=(False, False))
            h.color("bois_sombre", var=0.02)
        # seau de cuir (outre rigide) : évasé, cerclé
        bucket = m.lathe([(0.03, -0.085), (0.046, -0.06), (0.05, -0.01), (0.044, 0.0), (0.04, -0.012),
                          (0.0, -0.06)], 8, b_top, smooth=50, cap=False)
        bucket.color_fn(lambda f: ("boue_sombre", 0.7) if f.normal.y > 0.3 else
                        ("datte", 1.0 if f.calc_center_median().y > b_top.y - 0.03 else 0.85), var=0.03)
        # gouttes d'eau au fond du seau (filet)
        drip = m.tube([b_top + V(0, -0.085, 0), b_top + V(0, -0.13, 0)], [0.006, 0.002], 3, cap=(False, False))
        drip.color("eau", var=0.0, shade=1.15).no_ao().no_cast()


def abords(m, P):
    wx, wz = P["well"]
    # auge de pierre à droite (+X) : reçoit l'eau du seau
    ax, az = 0.30, 0.02
    tr = m.lathe([(0.075, 0.0), (0.075, 0.09), (0.055, 0.09), (0.055, 0.03)], 6, (ax, 0, az), cap=True,
                 smooth=20, rot0=30, sz=1.9)
    tr.color_fn(lambda f: ("pierre_sombre", 0.85) if f.normal.y > 0.5 and f.calc_center_median().y < 0.05
                else ("pierre", 1.04 if f.normal.y > 0.5 else 0.95), var=0.03)
    w = disc(m, (ax, 0.075, az), 0.052, n=6, rot0=30)
    for v in w.verts():
        v.co.z = az + (v.co.z - az) * 1.9
    w.color("eau", var=0.0, shade=0.85).no_ao().no_cast()
    # rigole vers l'avant (+Z) : terre mouillée + filet d'eau
    pts = [(ax - 0.035, 0.12), (ax + 0.035, 0.12), (ax + 0.05, 0.43), (ax - 0.02, 0.43)]
    wet = m.add([(x, 0.004, z) for x, z in pts], [[0, 1, 2, 3]])
    flip_up(wet).color("boue", var=0.02)
    wet.no_cast()
    run = m.add([(ax - 0.012, 0.007, 0.12), (ax + 0.012, 0.007, 0.12), (ax + 0.024, 0.007, 0.43),
                 (ax + 0.002, 0.007, 0.43)], [[0, 1, 2, 3]])
    flip_up(run).color("eau", var=0.0, shade=0.8).no_ao().no_cast()
    # flaque sombre au pied de la margelle, côté auge
    pud = disc(m, (wx + 0.19, 0.003, wz + 0.10), 0.07, n=7)
    pud.color("boue_sombre", var=0.02).no_cast()
    # jarres
    m.jar(0.20, 0.065, 8, (-0.30, 0.0, 0.30)).color("pise_sombre", var=0.05)
    m.jar(0.14, 0.05, 8, (-0.36, 0.0, 0.16)).color("pise", var=0.05)
    # seau de rechange renversé et corde enroulée
    b2 = m.lathe([(0.04, 0.0), (0.03, 0.06), (0.0, 0.06)], 7, (-0.27, 0, -0.10), cap=False)
    b2.color("datte", var=0.04, shade=0.9)
    rope_coil(m, -0.14, 0.36, r=0.05, turns=1)


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    margelle(m, P)
    fourche(m, P)
    balancier(m, P)
    abords(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=48, max_dist=0.3, strength=0.75))
