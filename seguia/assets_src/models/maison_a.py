"""maison_a — maison de pisé à un étage (GABARIT de référence pour maison_b, maison_c...).

Emprise 2x2, façade (porte) vers +Z, origine au centre de l'emprise au sol.
Contenu (CONVENTIONS.md) : toit-terrasse à acrotères, poutres, porte en bois,
2 fenêtres `lumiere`, échelle, jarres. Budget 1 500 triangles.

Pour décliner : copier ce fichier, modifier PARAMS, puis les fonctions de
« composition » (details_facade, details_toit...). Les fonctions d'éléments
(porte, fenêtre, poutres, acrotère...) sont dans lib/archi.py.
Lancer : assets_src/.venv/bin/python assets_src/models/maison_a.py
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize
from lib import archi

NAME = "maison_a"
FOOTPRINT = (2, 2)
BUDGET = 1500

PARAMS = dict(
    # bloc principal (centre, largeur X, profondeur Z, hauteur du toit)
    cx=0.0, cz=-0.16, w=1.56, d=1.30, h=0.92,
    # acrotère
    parapet_h=0.13, parapet_t=0.065, horn=0.08,
    # porte (décalage le long de la façade, vers +X) et fenêtres
    door_offset=-0.30, door_w=0.30, door_h=0.50,
    window_front_offset=0.36, window_side_offset=0.25, window_y=0.56,
    # poutres
    beam_y=0.80, beam_spacing=0.30,
)


def corps(m, P):
    """Volume de pisé + toit-terrasse avec acrotère."""
    archi.earth_block(m, P["cx"], P["cz"], P["w"], P["d"], P["h"], parapet_t=P["parapet_t"])
    x0, x1 = P["cx"] - P["w"] / 2, P["cx"] + P["w"] / 2
    z0, z1 = P["cz"] - P["d"] / 2, P["cz"] + P["d"] / 2
    archi.roof(m, x0, z0, x1, z1, P["h"], h=P["parapet_h"], t=P["parapet_t"], horn=P["horn"])


def ouvertures(m, P):
    """Porte en façade, une fenêtre en façade, une fenêtre sur le côté +X."""
    cx, cz, w, d = P["cx"], P["cz"], P["w"], P["d"]
    archi.door(m, archi.facade_point(cx, cz, w, d, 0, P["door_offset"]), 0,
               width=P["door_w"], height=P["door_h"])
    archi.window(m, archi.facade_point(cx, cz, w, d, 0, P["window_front_offset"]), 0,
                 y=P["window_y"])
    archi.window(m, archi.facade_point(cx, cz, w, d, 90, P["window_side_offset"]), 90,
                 y=P["window_y"] + 0.04, width=0.12, height=0.14)


def poutres(m, P):
    """Bouts de poutres de palmier sous l'acrotère, en façade et sur les côtés."""
    cx, cz, w, d = P["cx"], P["cz"], P["w"], P["d"]
    archi.beam_ends(m, archi.facade_point(cx, cz, w, d, 0), 0, w, P["beam_y"],
                    spacing=P["beam_spacing"])
    archi.beam_ends(m, archi.facade_point(cx, cz, w, d, 90), 90, d, P["beam_y"],
                    spacing=P["beam_spacing"])
    archi.beam_ends(m, archi.facade_point(cx, cz, w, d, 270), 270, d, P["beam_y"],
                    spacing=P["beam_spacing"])
    archi.spout(m, archi.facade_point(cx, cz, w, d, 270, 0.3), 270, P["h"] + 0.05)


def details_facade(m, P):
    """Banquette, jarres, panier de dattes devant la maison ; échelle sur le côté +X."""
    zf = P["cz"] + P["d"] / 2  # plan de façade
    # banquette de terre le long de la façade, à droite de la porte
    b = m.boxmm((0.02, 0, zf), (0.62, 0.12, zf + 0.15), bevel=0.02, bottom=False)
    b.color("pise_clair", var=0.03)
    # jarres
    m.jar(0.24, 0.085, 10, (-0.62, 0, zf + 0.16)).color("pise_sombre", var=0.05)
    m.jar(0.18, 0.065, 10, (-0.70, 0, zf + 0.36)).color("pise", var=0.06)
    archi.basket(m, 0.45, zf + 0.30, r=0.075, h=0.065)
    # échelle appuyée sur le mur +X, montant jusqu'au-dessus de l'acrotère
    x_wall = P["cx"] + P["w"] / 2
    top = P["h"] + P["parapet_h"] + 0.12
    lean = 5.0
    lad = m.ladder((0, 0.013, 0), top, width=0.17, lean=lean, rungs=5, r=0.013, rot_y=90)
    off = top * math.tan(math.radians(lean))
    lad.translate(x_wall + off + 0.004, 0, P["cz"] + 0.30)
    lad.color("bois", var=0.06)


def details_toit(m, P):
    """Tapis et panier de dattes sur la terrasse."""
    y = P["h"]
    archi.rug(m, P["cx"] - 0.22, P["cz"] - 0.12, 0.42, 0.62, y=y, rot_y=8, stripes=5)
    archi.basket(m, P["cx"] + 0.35, P["cz"] - 0.32, r=0.08, h=0.06, y=y)
    m.jar(0.16, 0.06, 7, (P["cx"] + 0.52, y, P["cz"] + 0.22)).color("pise_sombre", var=0.05)


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    corps(m, P)
    ouvertures(m, P)
    poutres(m, P)
    details_facade(m, P)
    details_toit(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=48, max_dist=0.45, strength=0.8))
