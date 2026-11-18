"""maison_c — maison basse en L autour d'une courette : aile du fond (+ haute) et aile gauche
(+ basse), murets de clôture avec porte de cour, auvent `tissu` safran, tapis, banc, jarres.

Emprise 2x2, façade (porte de cour) vers +Z, origine au centre de l'emprise au sol.
Budget 1 500 triangles. Silhouette : plan en L ouvert vers le +X/+Z, très bas.
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize
from lib import archi
from lib.palette import mix_srgb
from _communs_accessoires import plane, petit_panier, bloc, muret, corne

NAME = "maison_c"
FOOTPRINT = (2, 2)
BUDGET = 1500

PARAMS = dict(
    # aile du fond
    bx0=-0.84, bx1=0.84, bz0=-0.80, bz1=-0.14, bh=0.64,
    # aile gauche
    lx0=-0.84, lx1=-0.22, lz0=-0.14, lz1=0.72, lh=0.50,
    t=0.055, ph=0.09,
    # courette : murets
    cw_h=0.20, cw_t=0.07, cx1=0.84, cz1=0.84, gate0=0.12, gate1=0.46,
    # auvent
    aw_x0=0.04, aw_x1=0.80, aw_z=0.46, aw_yb=0.56, aw_yf=0.43,
)
SAFRAN_CLAIR = mix_srgb("safran", "ecru", 0.28)


def ailes(m, P):
    t, ph = P["t"], P["ph"]
    # aile du fond : volume + soubassement + acrotère
    bloc(m, P["bx0"], P["bz0"], P["bx1"], P["bz1"], 0.0, P["bh"], "pise", t)
    pl = m.boxmm((P["bx0"] - 0.02, 0, P["bz0"] - 0.02), (P["bx1"] + 0.02, 0.10, P["bz1"] + 0.02),
                 bevel=0.014, bottom=False, cell=0.9)
    pl.color("pise_sombre", var=0.02)
    for (a0, b0, a1, b1) in ((P["bx0"], P["bz1"] - t, P["bx1"], P["bz1"]), (P["bx0"], P["bz0"], P["bx1"], P["bz0"] + t),
                             (P["bx0"], P["bz0"] + t, P["bx0"] + t, P["bz1"] - t),
                             (P["bx1"] - t, P["bz0"] + t, P["bx1"], P["bz1"] - t)):
        muret(m, a0, b0, a1, b1, P["bh"], ph, bevel=0.0, cell=1.0)
    for hx in (P["bx0"] + 0.04, P["bx1"] - 0.04):
        for hz in (P["bz0"] + 0.04, P["bz1"] - 0.04):
            corne(m, hx, hz, P["bh"] + ph - 0.01, t, horn=0.06)
    # aile gauche, plus basse
    bloc(m, P["lx0"], P["lz0"], P["lx1"], P["lz1"], 0.0, P["lh"], "pise_clair", t)
    pl = m.boxmm((P["lx0"] - 0.02, 0, P["lz0"]), (P["lx1"] + 0.02, 0.09, P["lz1"] + 0.02),
                 bevel=0.014, bottom=False, cell=0.9, skip=("-z",))
    pl.color("pise_sombre", var=0.02)
    for (a0, b0, a1, b1) in ((P["lx0"], P["lz1"] - t, P["lx1"], P["lz1"]),
                             (P["lx0"], P["lz0"], P["lx0"] + t, P["lz1"] - t),
                             (P["lx1"] - t, P["lz0"], P["lx1"], P["lz1"] - t)):
        muret(m, a0, b0, a1, b1, P["lh"], ph - 0.01, bevel=0.0, cell=1.0, color="pise_clair",
              horn_color="chaux_ombre")
    for hx, hz in ((P["lx0"] + 0.04, P["lz1"] - 0.04), (P["lx1"] - 0.04, P["lz1"] - 0.04)):
        corne(m, hx, hz, P["lh"] + ph - 0.02, t, horn=0.055, color="chaux_ombre")


def courette(m, P):
    """Sol de terre battue, murets bas, porte de cour entre deux piliers."""
    x0, z0 = P["lx1"], P["bz1"]
    x1, z1 = P["cx1"], P["cz1"]
    fl = m.box((x1 - x0, 0.0, z1 - z0), ((x0 + x1) / 2, 0.006, (z0 + z1) / 2), cell=0.35,
               skip=("+x", "-x", "+z", "-z", "-y"))
    fl.color("pise_clair", var=0.025, face_var=0.02)
    t, h = P["cw_t"], P["cw_h"]
    g0, g1 = P["gate0"], P["gate1"]
    # muret de droite (+X) et muret de façade (de part et d'autre de la porte)
    muret(m, x1 - t, z0, x1, z1, 0.0, h, bevel=0.01, cell=1.0, color="pise", horn_color="pise_clair")
    muret(m, x0, z1 - t, g0, z1, 0.0, h, bevel=0.01, cell=1.0, color="pise", horn_color="pise_clair")
    muret(m, g1, z1 - t, x1 - t, z1, 0.0, h, bevel=0.01, cell=1.0, color="pise", horn_color="pise_clair")
    # piliers de la porte, coiffés d'une corne
    for gx in (g0 - 0.025, g1 + 0.025):
        pi = m.boxmm((gx - 0.04, 0, z1 - 0.09), (gx + 0.04, 0.30, z1 + 0.0), bevel=0.01, bottom=False)
        pi.color_fn(lambda f: ("pise_clair", 1.0) if f.normal.y > 0.9 else ("pise", 1.0), var=0.03)
        corne(m, gx, z1 - 0.045, 0.29, 0.054, horn=0.05)
    # banc de terre le long de l'aile du fond (sous l'auvent)
    b = m.boxmm((0.10, 0, P["bz1"]), (0.78, 0.11, P["bz1"] + 0.13), bevel=0.012, bottom=False, skip=("-z",))
    b.color("pise_clair", var=0.03)


def ouvertures(m, P):
    # porte de l'aile du fond, donnant sur la courette (sous l'auvent)
    archi.door(m, (0.50, 0, P["bz1"]), 0, width=0.28, height=0.46, step=False, knocker=False)
    archi.window(m, (-0.42, 0, P["bz1"]), 0, y=0.40, width=0.14, height=0.16)
    # porte de l'aile gauche, vers la courette (flanc +X)
    archi.door(m, (P["lx1"], 0, 0.30), 90, width=0.24, height=0.38, step=False, knocker=False, lintel=False)
    # fenêtre de façade de l'aile gauche
    archi.window(m, (-0.55, 0, P["lz1"]), 0, y=0.34, width=0.13, height=0.15, grille=False)


def poutres(m, P):
    archi.beam_ends(m, (0, 0, P["bz1"]), 0, 1.68, P["bh"] - 0.09, spacing=0.34, margin=0.2)
    archi.beam_ends(m, (P["lx0"], 0, 0.29), 270, 0.80, P["lh"] - 0.09, spacing=0.42)


def auvent(m, P):
    x0, x1, z0, z1 = P["aw_x0"], P["aw_x1"], P["bz1"], P["aw_z"]
    yb, yf = P["aw_yb"], P["aw_yf"]
    n = 6
    cl = m.cloth((x0, yb, z0), (x1, yb, z0), (x1, yf, z1), (x0, yf, z1), nu=n, nv=2, sag=0.025)
    cl.color_fn(lambda f: ("safran", 1.0) if int((f.calc_center_median().x - x0) / (x1 - x0) * n) % 2 == 0
                else (SAFRAN_CLAIR, 1.0), var=0.025)
    bav = m.cloth((x0, yf, z1), (x1, yf, z1), (x1, yf - 0.06, z1), (x0, yf - 0.06, z1), nu=n, nv=1,
                  sag=0.0, up=(0, 0, 1))
    bav.color_fn(lambda f: ("garance", 1.0) if int((f.calc_center_median().x - x0) / (x1 - x0) * n) % 2 == 0
                 else ("ecru", 1.0), var=0.02)
    for x in (x0 + 0.02, x1 - 0.02):
        po = m.tube([(x, 0, z1 - 0.02), (x, yf + 0.02, z1 - 0.02)], 0.014, 4, cap=(False, True), smooth=60)
        po.color("bois", var=0.05)


def tapis(m, P):
    """Deux tapis de la courette : rectangle rayé + petit tapis en travers."""
    archi.rug(m, 0.40, 0.15, 0.44, 0.40, y=0.012, rot_y=0, stripes=5)
    sl = m.boxmm((0.50, 0.0, 0.50), (0.74, 0.012, 0.74), skip=("+y", "-y"))
    sl.color("garance", var=0.02, shade=0.8)
    for i, c in enumerate(("indigo", "safran", "indigo")):
        z0 = 0.50 + i * 0.24 / 3
        q = plane(m, [(0.50, 0.0125, z0), (0.74, 0.0125, z0), (0.74, 0.0125, z0 + 0.08), (0.50, 0.0125, z0 + 0.08)])
        q.color(c, var=0.03)


def details(m, P):
    m.jar(0.22, 0.08, 6, (-0.12, 0, 0.12)).color("pise_sombre", var=0.05)
    m.jar(0.17, 0.06, 6, (-0.16, 0, 0.30)).color("pise", var=0.06)
    petit_panier(m, 0.62, 0.60, 0.012, r=0.085, h=0.06, seg=5, fill="datte", fill2="datte_claire")
    # sur le toit de l'aile gauche : jarre et panier qui sèchent
    m.jar(0.16, 0.06, 6, (-0.62, P["lh"], 0.40)).color("pise_clair", var=0.05)
    # échelle vers le toit de l'aile gauche (flanc +X)
    top = P["lh"] + P["ph"] + 0.10
    lad = m.ladder((0, 0.013, 0), top, width=0.16, lean=5, rungs=4, r=0.012, rot_y=90)
    lad.translate(P["lx1"] + top * math.tan(math.radians(5)) + 0.004, 0, 0.05)
    lad.color("bois", var=0.06)


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    ailes(m, P)
    courette(m, P)
    ouvertures(m, P)
    poutres(m, P)
    auvent(m, P)
    tapis(m, P)
    details(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=48, max_dist=0.4, strength=0.8))
