"""sechoir — séchoir à dattes (emprise 2x2).

Quatre poteaux de stipe de palmier portent une toile d'ombrage `tissu` rayée
(indigo / écru), tendue en pente vers l'avant et haubanée. Dessous, deux étagères
de claies sur trois niveaux couvertes de dattes. Devant, au soleil, une natte de
palmes où sèchent d'autres dattes, des couffins pleins, des sacs, une échelle et un
tabouret : la zone de tri. Un seul nœud.
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize, V
from _communs_batiments import merge, claie, date_bed, basket_full, sack, flip_up

NAME = "sechoir"
FOOTPRINT = (2, 2)
BUDGET = 2500

PARAMS = dict(
    post_x=0.80, post_z0=-0.84, post_z1=-0.02, h_back=1.12, h_front=0.94,
    racks=((-0.37, -0.40), (0.37, -0.40)), rack_w=0.62, rack_d=0.46, levels=(0.20, 0.43, 0.66),
)


def poteaux_toile(m, P):
    x, z0, z1 = P["post_x"], P["post_z0"], P["post_z1"]
    hb, hf = P["h_back"], P["h_front"]
    rnd = m.rnd
    for sx in (-1, 1):
        for (z, h) in ((z0, hb), (z1, hf)):
            lean = V(rnd.uniform(-0.015, 0.015), 0, rnd.uniform(-0.015, 0.015))
            post = m.tube([(sx * x, 0.0, z), V(sx * x, h * 0.5, z) + lean * 0.5, V(sx * x, h + 0.03, z) + lean],
                          [0.036, 0.032, 0.028], 6, cap=(False, True), smooth=60)
            post.clamp_floor()
            post.color_fn(lambda f: ("bois", 0.88 + 0.16 * (int(f.calc_center_median().y * 22) % 2)), var=0.02)
            # cale de pierres au pied
            st = m.lathe([(0.065, 0.0), (0.05, 0.04), (0.03, 0.05)], 6, (sx * x, 0, z), cap=False, smooth=30)
            st.color("pierre", var=0.05)
    # traverses hautes (avant / arrière) sous la toile
    for (z, h) in ((z0, hb), (z1, hf)):
        b = m.beam((-x - 0.04, h - 0.02, z), (x + 0.04, h - 0.02, z), w=0.04, h=0.04)
        b.color("bois_sombre", var=0.04)
    # toile rayée : de l'arrière (haut) vers l'avant (bas), débordant un peu
    c00, c10 = (-x - 0.08, hb + 0.01, z0 - 0.07), (x + 0.08, hb + 0.01, z0 - 0.07)
    c11, c01 = (x + 0.08, hf + 0.01, z1 + 0.10), (-x - 0.08, hf + 0.01, z1 + 0.10)
    stripes = 9
    with m.using(mat="tissu"):
        cl = m.cloth(c00, c10, c11, c01, nu=stripes, nv=3, sag=0.07)
        cols = ("indigo", "ecru")
        cl.color_fn(lambda f: (cols[int((f.calc_center_median().x + x + 0.08) / (2 * x + 0.16) * stripes) % 2],
                               1.0), var=0.03)
        # lambrequin (bord tombant) à l'avant, écru à franges garance
        zf = z1 + 0.10
        val = m.cloth((-x - 0.08, hf + 0.01, zf), (x + 0.08, hf + 0.01, zf), (x + 0.08, hf - 0.07, zf + 0.01),
                      (-x - 0.08, hf - 0.07, zf + 0.01), nu=7, nv=1, sag=0.0, up=(0, 0, 1))
        val.color_fn(lambda f: ("garance", 1.0) if int((f.calc_center_median().x + 1) * 3.5) % 2 else
                     ("safran", 1.0), var=0.03)
    # haubans de corde vers des piquets
    for sx in (-1, 1):
        for (z, h, dz) in ((z0, hb, -0.07), (z1, hf, 0.30)):
            a = V(sx * (x + 0.02), h, z)
            b = V(sx * 0.92, 0.0, z + dz)
            r = m.tube([a, b], 0.005, 3, cap=(False, False)).clamp_floor()
            r.color("pise_clair", var=0.02, shade=0.78).no_cast()
            peg = m.tube([b + V(0, -0.0, 0), b + V(0, 0.06, 0)], 0.01, 4, cap=(False, True))
            peg.color("bois_sombre", var=0.03)


def etageres(m, P):
    w, d = P["rack_w"], P["rack_d"]
    top = P["levels"][-1] + 0.06
    for (cx, cz) in P["racks"]:
        x0, x1, z0, z1 = cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2
        for (px, pz) in ((x0, z0), (x1, z0), (x0, z1), (x1, z1)):
            p = m.box((0.028, top, 0.028), (px, 0, pz), skip=("-y",))
            p.color("bois", var=0.06)
        for k, y in enumerate(P["levels"]):
            claie(m, x0, z0, x1, z1, y, frame_w=0.028)
            date_bed(m, x0 + 0.02, z0 + 0.02, x1 - 0.02, z1 - 0.02, y - 0.008,
                     cell=0.1 if k < 2 else 0.065, bump=0.022 if k < 2 else 0.026)
        # traverse de contreventement en X à l'arrière
        br = m.beam((x0, 0.05, z0 - 0.02), (x1, top - 0.02, z0 - 0.02), w=0.018, h=0.018)
        br.color("bois_sombre", var=0.04)


def tri(m, P):
    """Zone de tri au soleil, devant (+Z)."""
    # natte de palmes tressées + dattes étalées
    x0, x1, z0, z1 = -0.80, -0.06, 0.34, 0.84
    mat = m.boxmm((x0, 0.0, z0), (x1, 0.012, z1), cell=0.25, bottom=False)
    mat.color_fn(lambda f: ("pise_clair", 0.92 + 0.1 * (int((f.calc_center_median().x + 2) * 25) % 2)), var=0.02)
    date_bed(m, x0 + 0.05, z0 + 0.05, x1 - 0.05, z1 - 0.05, 0.012, cell=0.055, bump=0.02, light=0.3)
    # râteau de bois posé sur la natte (on retourne les dattes)
    rk = m.tube([(-0.20, 0.03, 0.30), (0.02, 0.03, 0.12)], 0.008, 4)
    rk.color("bois", var=0.04)
    head = m.beam((-0.27, 0.025, 0.26), (-0.15, 0.025, 0.36), w=0.02, h=0.02)
    head.color("bois_sombre", var=0.03)
    # claie sur tréteaux, au soleil
    tx0, tx1, tz0, tz1, ty = 0.16, 0.82, 0.30, 0.70, 0.24
    for (px, pz) in ((tx0 + 0.04, tz0 + 0.03), (tx1 - 0.04, tz0 + 0.03), (tx0 + 0.04, tz1 - 0.03),
                     (tx1 - 0.04, tz1 - 0.03)):
        leg = m.box((0.026, ty - 0.03, 0.026), (px, 0, pz), skip=("-y", "+y"))
        leg.color("bois", var=0.06)
    claie(m, tx0, tz0, tx1, tz1, ty, frame_w=0.03)
    date_bed(m, tx0 + 0.02, tz0 + 0.02, tx1 - 0.02, tz1 - 0.02, ty - 0.008, cell=0.055, bump=0.026)
    # tas de dattes non triées
    heap = m.dome(0.10, 7, 2, (0.0, 0.0, 0.18), height=0.06)
    heap.color_fn(lambda f: ("datte_claire" if m.rnd.random() < 0.5 else "datte", 1.0 + m.rnd.uniform(-0.15, 0.05)), var=0.0)
    # couffins pleins
    for (x, z, r, f) in ((0.24, 0.84, 0.075, "datte"), (0.42, 0.84, 0.065, "datte_claire"),
                         (0.10, 0.10, 0.07, "datte"), (-0.22, 0.12, 0.07, "datte"),
                         (0.66, -0.70, 0.07, "datte_claire")):
        basket_full(m, x, z, r=r, h=r * 0.95, fill=f, seg=8, handles=(x > 0.4))
    # sacs de dattes pressées
    sack(m, 0.70, 0.10, 0.08, 0.07, 0.09, color="ecru", rot=25)
    sack(m, 0.56, 0.16, 0.07, 0.06, 0.08, color="ecru", rot=-20)
    sack(m, -0.74, -0.70, 0.07, 0.06, 0.08, color="indigo", rot=10)
    # tabouret bas de tresseuse
    st = m.box((0.11, 0.07, 0.11), (0.0, 0, 0.62), bevel=0.01, bottom=False, rot_y=15)
    st.color("bois", var=0.05)
    # échelle appuyée contre la traverse avant
    lad = m.ladder((0.0, 0.0, 0.0), 0.86, width=0.16, lean=14, rungs=5, r=0.011)
    lad.translate(-0.45, 0.0, P["post_z1"] + 0.86 * math.tan(math.radians(14)) + 0.01)
    lad.clamp_floor().color("bois", var=0.06)
    # jarre d'eau
    m.jar(0.21, 0.07, 8, (-0.82, 0.0, 0.10)).color("pise_sombre", var=0.05)


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    poteaux_toile(m, P)
    etageres(m, P)
    tri(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.4, strength=0.8))
