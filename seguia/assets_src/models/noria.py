"""noria — roue à godets verticale sur bâti de bois et deux piles de pierre (emprise 1x1).

La roue (diamètre 0,85) est dans le plan XY ; son axe (essieu) est selon Z et repose
sur deux piles de pierre maçonnées (avant +Z et arrière -Z) coiffées d'un bâti de
bois. Elle plonge dans un canal de pierre qui court selon X ; les godets de terre
cuite remontent l'eau et la versent dans une auge haute (côté -Z) portée par le
bâti, qui file vers l'arrière de la case.

Nœuds : `noria` (racine) et `roue` (jantes, rayons, moyeu, essieu, godets).
L'ORIGINE de `roue` est sur l'axe (centre du moyeu) ; le moteur la fait tourner
autour de son axe Z local (= Z du modèle, pas de rotation de nœud).
L'eau du canal et de l'auge est peinte (couleur de sommet `eau`, matériau `vc`) :
CONVENTIONS.md ne prévoit pas de nœud `eau` pour la noria.
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize, V
from _communs_batiments import merge, ring_xy, bar_xy, flip_up, hoe

NAME = "noria"
FOOTPRINT = (1, 1)
BUDGET = 1500

PARAMS = dict(
    cy=0.50, R=0.40, r_in=0.365, rim_z=(0.045, 0.075), pots=12, pot_r=0.399,
    water_y=0.095, canal_w=0.10, pier=(0.15, 0.34), pier_h=0.36,
)


# ------------------------------------------------------------------ roue (nœud animé)
def roue(m, P):
    C = (0.0, P["cy"], 0.0)
    m.node("roue", C)
    R, ri = P["R"], P["r_in"]
    z0, z1 = P["rim_z"]
    rnd = m.rnd
    with m.using(node="roue"):
        for s in (-1, 1):
            za, zb = (z0, z1) if s > 0 else (-z1, -z0)
            rim = ring_xy(m, C, R, ri, za, zb, n=16)
            rim.color_fn(lambda f: ("bois", 1.12 + 0.16 * rnd.random()), var=0.0)
            # rayons : 4 barres diamétrales par flasque (8 rayons), décalées d'une flasque à l'autre
            for k in range(4):
                a = 45.0 * k + (0 if s > 0 else 22.5)
                sp = bar_xy(m, C, a, -ri - 0.005, ri + 0.005, 0.026, za + 0.004, zb - 0.004)
                sp.color("bois", var=0.06, shade=0.95)
        # moyeu et essieu (l'essieu tourne avec la roue et traverse les paliers)
        hub = m.cylinder(0.055, 0.17, 8, (0, 0, 0), smooth=40).rotate("X", 90)
        hub.translate(0, P["cy"], -0.085)
        hub.color_fn(lambda f: ("bois_sombre", 0.9) if abs(f.normal.z) > 0.9 else ("bois", 0.9), var=0.03)
        axle = m.cylinder(0.022, 0.74, 6, (0, 0, 0), smooth=60).rotate("X", 90)
        axle.translate(0, P["cy"], -0.37)
        axle.color("bois_sombre", var=0.03)
        # godets de terre cuite liés entre les jantes, bouche vers le sens de rotation
        n = P["pots"]
        for i in range(n):
            a = 360.0 * (i + 0.5) / n
            ar = math.radians(a)
            pr, h = 0.033, 0.09
            pot = m.lathe([(pr * 0.5, -h / 2), (pr, -h * 0.05), (pr * 0.72, h / 2), (0.0, h * 0.34)], 5,
                          (0, 0, 0), smooth=60, cap=True, sz=1.45)
            shade = 1.0 + rnd.uniform(-0.08, 0.06)
            cpot = ("pise_sombre", "pise", "roche")[i % 3]
            pot.color_fn(lambda f, c=cpot, k=shade: ("boue_sombre", 0.75) if f.calc_center_median().y > h * 0.36
                         else (c, k), var=0.02)
            pot.rotate("Z", a)
            pot.translate(P["pot_r"] * math.cos(ar), P["cy"] + P["pot_r"] * math.sin(ar), 0)


# ------------------------------------------------------------------ partie fixe
def canal(m, P):
    w, wy = P["canal_w"], P["water_y"]
    L = 0.44
    for s in (-1, 1):
        wall = m.boxmm((-L, 0, s * w if s > 0 else -w - 0.07), (L, 0.13, w + 0.07 if s > 0 else -w),
                       bevel=0.01, cell=0.3, bottom=False)
        wall.color_fn(lambda f: ("pierre", 1.08) if f.normal.y > 0.9 else
                      ("pierre_sombre" if m.rnd.random() < 0.3 else "pierre", 1.0 + m.rnd.uniform(-0.06, 0.04)),
                      var=0.0)
    bed = m.boxmm((-L, 0.0, -w), (L, 0.02, w), skip=("+z", "-z", "-y"))
    bed.color("boue_sombre", var=0.02)
    water = m.add([(-L, wy, -w), (L, wy, -w), (L, wy, w), (-L, wy, w)], [[0, 1, 2, 3]])
    flip_up(water).color("eau", var=0.0, face_var=0.0, shade=0.85).no_ao().no_cast()
    # remous blanc là où la roue plonge
    for dx in (0.0,):
        foam = m.add([(dx - 0.04, wy + 0.003, -0.04), (dx + 0.04, wy + 0.003, -0.05),
                      (dx + 0.03, wy + 0.003, 0.05), (dx - 0.03, wy + 0.003, 0.04)], [[0, 1, 2, 3]])
        flip_up(foam).color("ecru", var=0.0, shade=0.95).no_ao().no_cast()


def piles(m, P):
    p0, p1 = P["pier"]
    h = P["pier_h"]
    for s in (-1, 1):
        za, zb = (p0, p1) if s > 0 else (-p1, -p0)
        pier = m.boxmm((-0.13, 0, za), (0.13, h, zb), cell=0.19, bottom=False)
        pier.taper(0.12, 0, (za + zb) / 2, 0, h)
        rnd = m.rnd
        pier.color_fn(lambda f: ("pierre", 1.08) if f.normal.y > 0.9 else
                      ("pierre_sombre" if rnd.random() < 0.3 else "pierre", 1.0 + rnd.uniform(-0.07, 0.04)),
                      var=0.0)
        cap = m.boxmm((-0.125, h, za - 0.005), (0.125, h + 0.03, zb + 0.005), bevel=0.008)
        cap.color("pierre", var=0.03, shade=1.1)


def bati(m, P):
    p0, p1 = P["pier"]
    h = P["pier_h"] + 0.03
    cy = P["cy"]
    zc = (p0 + p1) / 2
    for s in (-1, 1):
        z = s * zc
        # palier : semelle + chapeau autour de l'essieu
        sole = m.boxmm((-0.10, h, z - 0.06), (0.10, cy - 0.027, z + 0.06), bevel=0.006)
        sole.color("bois", var=0.05)
        capb = m.boxmm((-0.06, cy + 0.027, z - 0.05), (0.06, cy + 0.06, z + 0.05), bevel=0.006)
        capb.color("bois_sombre", var=0.04)
        # deux montants et un chapeau
        top = 0.66 if s > 0 else 0.746
        for sx in (-1, 1):
            x = sx * 0.095
            post = m.box((0.034, top - h, 0.034), (x, h, z), skip=("-y",))
            post.color("bois", var=0.06)
        beam = m.beam((-0.13, top + 0.02, z), (0.13, top + 0.02, z), w=0.04, h=0.04)
        beam.color("bois_sombre", var=0.04)
        # liens obliques (contreventement)
        br = m.beam((0.095, cy + 0.08, z), (0.02, top, z), w=0.022, h=0.022)
        br.color("bois", var=0.05)


def auge(m, P):
    """Auge haute : canal de bois en U, de la roue vers l'arrière (-Z)."""
    x, y = -0.12, 0.80
    z0, z1 = -0.095, -0.415
    w, d = 0.075, 0.05
    floor = m.boxmm((x - w / 2, y - 0.012, z1), (x + w / 2, y, z0), cell=0.12)
    floor.color("bois", var=0.04)
    for sx in (-1, 1):
        side = m.boxmm((x + sx * w / 2 - 0.007, y - 0.012, z1), (x + sx * w / 2 + 0.007, y + d, z0),
                       cell=0.12, bottom=False)
        side.color("bois", var=0.05, shade=1.05)
    endb = m.boxmm((x - w / 2, y, z0 - 0.012), (x + w / 2, y + d, z0), skip=("-y",))
    endb.color("bois_sombre", var=0.04)
    wat = m.add([(x - w / 2 + 0.007, y + 0.03, z1), (x + w / 2 - 0.007, y + 0.03, z1),
                 (x + w / 2 - 0.007, y + 0.03, z0 - 0.012), (x - w / 2 + 0.007, y + 0.03, z0 - 0.012)],
                [[0, 1, 2, 3]])
    flip_up(wat).color("eau", var=0.0, face_var=0.0).no_ao().no_cast()
    # filet d'eau qui s'échappe au bout de l'auge
    jet = m.tube([(x, y + 0.02, z1 + 0.01), (x, y - 0.02, z1 - 0.005)], 0.008, 4, cap=(False, False))
    jet.color("eau", var=0.0, shade=1.15).no_ao().no_cast()


def abords(m, P):
    # jarre et houe devant (+Z), corde enroulée au pied d'une pile
    m.jar(0.17, 0.06, 8, (0.33, 0.0, 0.33)).color("pise_sombre", var=0.05)
    m.jar(0.12, 0.045, 6, (0.22, 0.0, 0.38)).color("roche", var=0.05)
    hoe(m, (-0.30, 0.0, 0.25), yaw=60, length=0.28, lean=82)
    # terre mouillée au pied des piles
    for s in (-1, 1):
        pts = [(-0.24, s * 0.17), (0.24, s * 0.17), (0.20, s * 0.36), (-0.22, s * 0.36)]
        wet = m.add([(x, 0.003, z) for x, z in pts], [[0, 1, 2, 3]])
        flip_up(wet).color("boue", var=0.02, shade=1.08).no_cast()


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    roue(m, P)
    canal(m, P)
    piles(m, P)
    bati(m, P)
    auge(m, P)
    abords(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.3, strength=0.75))
