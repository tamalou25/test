"""maison_b — maison de pisé à étage PARTIEL : un cube chaulé au fond à gauche, escalier extérieur
de terre sur le flanc +X qui monte à la terrasse du rez-de-chaussée, linge qui sèche.

Emprise 2x2, façade vers +Z, origine au centre de l'emprise au sol. Budget 1 500 triangles.
Silhouette : en « L » étagé (volume bas + tour chaulée à l'arrière gauche) et escalier en rampe.
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize
from lib import archi
from _communs_accessoires import plane, join, petit_panier, bloc, muret, corne

NAME = "maison_b"
FOOTPRINT = (2, 2)
BUDGET = 1500

PARAMS = dict(
    # rez-de-chaussée
    cx=-0.04, cz=-0.10, w=1.52, d=1.40, h=0.72, parapet_h=0.12, t=0.06,
    # étage partiel (cube chaulé au fond à gauche) : x0, x1, z0, z1, hauteur
    ux0=-0.80, ux1=0.12, uz0=-0.80, uz1=-0.10, uh=0.66,
    # escalier (flanc +X) : marches de 0.10 de profondeur, début en façade
    stair_x0=0.73, stair_x1=0.91, stair_z0=0.60, steps=6, tread=0.10,
    door_offset=-0.30, window_front_offset=0.32,
)


def corps(m, P):
    cx, cz, w, d, h, t = P["cx"], P["cz"], P["w"], P["d"], P["h"], P["t"]
    archi.earth_block(m, cx, cz, w, d, h, parapet_t=t)
    x0, x1, z0, z1 = cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2
    ph = P["parapet_h"]
    # acrotère du rez-de-chaussée : façade, flanc gauche, fond (côté libre), flanc droit percé
    muret(m, x0, z1 - t, x1, z1, h, ph)
    muret(m, x0, z0 + t, x0 + t, z1 - t, h, ph)
    muret(m, P["ux1"], z0, x1, z0 + t, h, ph)
    zg0, zg1 = -0.14, 0.14          # passage de l'escalier dans l'acrotère droit
    muret(m, x1 - t, z0 + t, x1, zg0, h, ph)
    muret(m, x1 - t, zg1, x1, z1 - t, h, ph)
    for (hx, hz) in ((x0 + 0.045, z1 - 0.045), (x1 - 0.045, z1 - 0.045), (x1 - 0.045, z0 + 0.045),
                     (x1 - 0.045, zg0 - 0.0), (x1 - 0.045, zg1 + 0.0)):
        corne(m, hx, hz, h + ph - 0.01, t)
    # étage partiel chaulé
    ux0, ux1, uz0, uz1, uh = P["ux0"], P["ux1"], P["uz0"], P["uz1"], P["uh"]
    bloc(m, ux0, uz0, ux1, uz1, h, uh, "chaux", t)
    yt = h + uh
    for (a0, b0, a1, b1) in ((ux0, uz1 - t, ux1, uz1), (ux0, uz0, ux1, uz0 + t),
                             (ux0, uz0 + t, ux0 + t, uz1 - t), (ux1 - t, uz0 + t, ux1, uz1 - t)):
        muret(m, a0, b0, a1, b1, yt, ph, color="chaux_ombre", horn_color="chaux", bevel=0.0, cell=1.0)
    for (hx, hz) in ((ux0 + 0.045, uz0 + 0.045), (ux1 - 0.045, uz0 + 0.045),
                     (ux0 + 0.045, uz1 - 0.045), (ux1 - 0.045, uz1 - 0.045)):
        corne(m, hx, hz, yt + ph - 0.01, t, color="chaux")


def escalier(m, P):
    """Rampe d'escalier de terre massive le long du flanc +X, du sol à la terrasse."""
    x0, x1, z0, n, td = P["stair_x0"], P["stair_x1"], P["stair_z0"], P["steps"], P["tread"]
    rise = P["h"] / n
    parts = []
    for i in range(n):
        zf = z0 - i * td            # arête avant de la marche i
        zb = zf - td
        yb, yt = i * rise, (i + 1) * rise
        if i == n - 1:
            zb = zf - td - 0.12     # palier
        tread = plane(m, [(x0, yt, zf), (x1, yt, zf), (x1, yt, zb), (x0, yt, zb)])
        tread.color("pise_clair", var=0.03)
        parts.append(tread)
        riser = plane(m, [(x0, yb, zf), (x1, yb, zf), (x1, yt, zf), (x0, yt, zf)], up=False)
        for f in riser.faces:
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
        riser.color("pise_sombre", var=0.03, shade=1.05)
        side = plane(m, [(x1, 0, zf), (x1, 0, zb), (x1, yt, zb), (x1, yt, zf)], up=False)
        for f in side.faces:
            f.normal_update()
            if f.normal.x < 0:
                f.normal_flip()
        side.color_fn(lambda f: ("pise", 1.0), var=0.03)
    # fond du palier (vu de l'arrière)
    zb = z0 - (n - 1) * td - td - 0.12
    back = plane(m, [(x0, 0, zb), (x0, P["h"], zb), (x1, P["h"], zb), (x1, 0, zb)], up=False)
    for f in back.faces:
        f.normal_update()
        if f.normal.z > 0:
            f.normal_flip()
    back.color("pise", var=0.03, shade=0.9)


def ouvertures(m, P):
    cx, cz, w, d = P["cx"], P["cz"], P["w"], P["d"]
    h = P["h"]
    archi.door(m, archi.facade_point(cx, cz, w, d, 0, P["door_offset"]), 0, width=0.30, height=0.48)
    archi.window(m, archi.facade_point(cx, cz, w, d, 0, P["window_front_offset"]), 0, y=0.50)
    # étage : porte donnant sur la terrasse, fenêtres sur la façade et le flanc gauche
    ux0, ux1, uz0, uz1 = P["ux0"], P["ux1"], P["uz0"], P["uz1"]
    archi.door(m, (ux1 - 0.28, h, uz1), 0, width=0.24, height=0.42, step=False, knocker=False, lintel=False)
    archi.window(m, (ux0 + 0.28, h, uz1), 0, y=0.34, width=0.13, height=0.15, grille=False)
    archi.window(m, (ux0, h, uz1 - 0.28), 270, y=0.34, width=0.12, height=0.14, grille=False, sill=False)


def poutres(m, P):
    cx, cz, w, d, h = P["cx"], P["cz"], P["w"], P["d"], P["h"]
    archi.beam_ends(m, archi.facade_point(cx, cz, w, d, 0), 0, w, h - 0.10, spacing=0.42)
    archi.beam_ends(m, archi.facade_point(cx, cz, w, d, 270), 270, d, h - 0.10, spacing=0.55)
    ux0, uz0 = P["ux0"], P["uz0"]
    archi.beam_ends(m, (ux0, 0, (uz0 + P["uz1"]) / 2), 270, P["uz1"] - uz0, h + P["uh"] - 0.10, spacing=0.38)
    archi.spout(m, (P["ux1"], 0, -0.50), 90, h + P["uh"] + 0.05)


def linge(m, P):
    """Corde à linge entre deux perches sur la terrasse, 5 pièces de tissu."""
    h = P["h"]
    zc = 0.30
    xa, xb, yl = -0.66, 0.50, h + 0.40
    for x in (xa, xb):
        pl = m.tube([(x, h, zc), (x, yl + 0.03, zc)], 0.014, 4, cap=(False, True), smooth=60)
        pl.color("bois", var=0.05)
    ln = m.tube([(xa, yl, zc), (xa + 0.58, yl - 0.035, zc), (xb, yl, zc)], 0.005, 3, cap=(False, False), smooth=90)
    ln.color("bois_sombre", var=0.03)
    pieces = [(-0.58, 0.15, 0.20, "safran"), (-0.40, 0.12, 0.15, "indigo"), (-0.24, 0.14, 0.24, "ecru"),
              (0.24, 0.13, 0.17, "garance"), (0.40, 0.12, 0.22, "turquoise")]
    for (x, wd, hd, c) in pieces:
        y_top = yl - 0.035 * (1 - abs((x - (xa + 0.58)) / 0.58)) if False else yl - 0.03
        cl = m.cloth((x - wd / 2, y_top, zc), (x + wd / 2, y_top, zc), (x + wd / 2, y_top - hd, zc + 0.012),
                     (x - wd / 2, y_top - hd, zc + 0.012), nu=1, nv=1, sag=0.0, up=(0, 0, 1))
        cl.color(c, var=0.03)


def details(m, P):
    zf = P["cz"] + P["d"] / 2
    m.jar(0.22, 0.08, 6, (-0.62, 0, zf + 0.12)).color("pise_sombre", var=0.05)
    m.jar(0.16, 0.06, 6, (-0.70, 0, zf + 0.26)).color("pise", var=0.06)
    petit_panier(m, 0.30, zf + 0.16, 0, r=0.09, h=0.07, seg=5, fill="datte", fill2="datte_claire")
    # petit four-tabouna sur la terrasse
    ov = m.dome(0.10, 6, 2, (0.40, P["h"], 0.42), height=0.09, smooth=40)
    ov.color("pise_sombre", var=0.04)


def echelle(m, P):
    """Échelle de bois appuyée sur le flanc +X du cube chaulé, de la terrasse à son toit."""
    top = P["uh"] + P["parapet_h"] + 0.10
    lean = 5.0
    lad = m.ladder((0, P["h"] + 0.013, 0), top, width=0.16, lean=lean, rungs=5, r=0.012, rot_y=90)
    lad.translate(P["ux1"] + top * math.tan(math.radians(lean)) + 0.004, 0, -0.42)
    lad.color("bois", var=0.06)


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    corps(m, P)
    escalier(m, P)
    ouvertures(m, P)
    poutres(m, P)
    echelle(m, P)
    linge(m, P)
    details(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=48, max_dist=0.45, strength=0.8))
