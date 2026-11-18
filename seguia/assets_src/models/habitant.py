"""habitant — figurine de 0,50 : robe longue BLANCHE (teintée par le moteur) et chèche.

Nœuds : `habitant` (racine : mains et sandales, couleurs fixes),
`robe` (robe + manches, couleur de sommet blanche ombrée d'occlusion),
`tete` (visage + chèche ; origine au cou pour un éventuel hochement).
Regarde vers +Z. Budget 220 triangles.
"""
import _boot  # noqa: F401

from lib import Model, finalize

NAME = "habitant"
FOOTPRINT = None
BUDGET = 220

PARAMS = dict(
    height=0.50, neck_y=0.385, robe_seg=7, depth=0.78,  # depth : aplatissement avant/arrière
    cheche="indigo", skin="peau",
)


def robe(m, P):
    d = P["depth"]
    with m.using(node="robe"):
        body = m.lathe([(0.098, 0.0), (0.082, 0.12), (0.072, 0.23), (0.080, 0.345),
                        (0.030, P["neck_y"] + 0.005)], P["robe_seg"],
                       smooth=60, sz=d)
        body.color("blanc", var=0.0, face_var=0.0)
        for sx in (-1, 1):
            arm = m.tube([(sx * 0.072, 0.355, 0.0), (sx * 0.098, 0.28, 0.012),
                          (sx * 0.088, 0.205, 0.045)], [0.026, 0.028, 0.03], 5,
                         cap=(False, True), smooth=75)
            arm.color("blanc", var=0.0, face_var=0.0)


def mains_pieds(m, P):
    for sx in (-1, 1):
        hand = m.sphere(0.021, 4, 2, (sx * 0.086, 0.19, 0.055), sy=1.3)
        hand.color(P["skin"], var=0.03)
        foot = m.box((0.03, 0.016, 0.045), (sx * 0.034, 0.0, 0.075), skip=("-z", "-y"))
        foot.color("bois_sombre", var=0.04)


def tete(m, P):
    ny = P["neck_y"]
    m.node("tete", (0, ny, 0))
    with m.using(node="tete"):
        # bande de visage visible entre voile et turban (fente des yeux)
        face = m.cylinder(0.043, 0.032, 6, (0, ny + 0.042, 0), cap=False, smooth=70)
        face.color(P["skin"], var=0.04)
        # voile (litham) : bas du visage et cou
        veil = m.lathe([(0.036, ny - 0.008), (0.050, ny + 0.02), (0.046, ny + 0.046)], 6,
                       smooth=60, cap=False)
        veil.color(P["cheche"], var=0.03)
        # turban : enroulement bombé
        turban = m.lathe([(0.050, ny + 0.072), (0.058, ny + 0.095), (0.046, ny + 0.125),
                          (0.0, ny + 0.132)], 6, smooth=60, cap=True, rot0=30)
        turban.color(P["cheche"], var=0.03, shade=1.08)
        # pan du chèche retombant dans le dos
        tail = m.box((0.04, 0.07, 0.012), (0, ny + 0.01, -0.052), skip=("+z", "-y"))
        tail.rotate("X", -12, pivot=(0, ny + 0.08, -0.05)).color(P["cheche"], var=0.03, shade=0.9)


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    m.node("robe", (0, 0, 0))
    robe(m, P)
    mains_pieds(m, P)
    tete(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.12, strength=0.55, height_grad=(0.9, 1.0)))
