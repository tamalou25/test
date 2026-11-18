"""fontaine — vasque de pierre octogonale avec bec, margelle, jarre (emprise 1x1).

Nœuds : `fontaine` (racine) et `eau` (plan d'eau ; origine au niveau de l'eau).
Le bec de cuivre sort d'une stèle à l'arrière (-Z) et verse vers le centre.
Budget accessoire-bâtiment : on vise ≤ 900 triangles (pas de plafond explicite
dans CONVENTIONS.md pour ce type ; voir README).
"""
import _boot  # noqa: F401

from lib import Model, finalize
from lib import archi

NAME = "fontaine"
FOOTPRINT = (1, 1)
BUDGET = 900

PARAMS = dict(r_out=0.34, r_in=0.27, rim_y=0.24, water_y=0.19, floor_y=0.05, seg=8)


def vasque(m, P):
    ro, ri, ry, fy, n = P["r_out"], P["r_in"], P["rim_y"], P["floor_y"], P["seg"]
    # margelle basse octogonale (dallage autour)
    step = m.lathe([(0.41, 0.0), (0.41, 0.035), (ro + 0.02, 0.045), (ro - 0.01, 0.045)], n,
                   rot0=22.5, smooth=20, cap=False)
    step.color("pierre_sombre", var=0.03, face_var=0.04)
    # cuve : extérieur, lèvre débordante, intérieur, fond
    cuve = m.lathe([(ro, 0.04), (ro, ry - 0.03), (ro + 0.025, ry - 0.01), (ro + 0.025, ry + 0.02),
                    (ri, ry + 0.02), (ri, fy), (0.0, fy)], n, rot0=22.5, smooth=20, cap=False)

    def col(f):
        c = f.calc_center_median()
        if c.y > ry - 0.02:
            return ("pierre", 1.08)       # lèvre plus claire (usée)
        if f.normal.y > 0.5 or (c.x ** 2 + c.z ** 2) < (ri + 0.005) ** 2:
            return ("pierre_sombre", 0.9)  # intérieur mouillé
        return ("pierre", 1.0)

    cuve.color_fn(col, var=0.025)
    archi.water(m, archi.regular_poly(ri / 0.9239, n, 22.5), P["water_y"])


def stele(m, P):
    z = -P["r_out"] - 0.03
    st = m.box((0.20, 0.62, 0.10), (0, 0, z), bevel=0.012, bottom=False)
    st.color_fn(lambda f: ("chaux", 1.0) if f.calc_center_median().y > 0.55 else ("pierre", 1.0),
                var=0.02)
    cap = m.box((0.26, 0.05, 0.14), (0, 0.62, z), bevel=0.01)
    cap.color("pierre_sombre", var=0.03)
    # petit arc décoratif en creux (aplat sombre) au-dessus du bec
    pts, top = m.horseshoe(0.10, 0.40, 22, 8)
    niche = m.add([(x, y, z + 0.051) for x, y in pts], [list(range(len(pts)))])
    for f in niche.faces:
        if f.normal.z < 0:
            f.normal_flip()
    niche.color("pierre_sombre", var=0.0, shade=0.8).no_ao()
    # bec de cuivre et filet d'eau
    bec = m.tube([(0, 0.36, z + 0.04), (0, 0.36, z + 0.16), (0, 0.33, z + 0.21)], 0.016, 5,
                 cap=(False, True), smooth=70)
    bec.color("cuivre", var=0.03)
    jet = m.tube([(0, 0.33, z + 0.215), (0, 0.27, z + 0.235), (0, P["water_y"], z + 0.24)],
                 [0.008, 0.009, 0.012], 4, cap=(False, False), smooth=70)
    jet.color("eau", var=0.0, face_var=0.0, shade=1.25).no_ao().no_cast()


def details(m, P):
    m.jar(0.20, 0.07, 8, (0.33, 0.0, 0.31)).color("pise_sombre", var=0.05)
    m.jar(0.13, 0.05, 8, (-0.35, 0.0, 0.30)).color("roche", var=0.05)
    bowl = m.lathe([(0.02, 0), (0.045, 0.03), (0.04, 0.03), (0.0, 0.008)], 7,
                   (0.235, P["rim_y"] + 0.02, -0.20), cap=False)
    bowl.color("cuivre", var=0.04)


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    vasque(m, P)
    stele(m, P)
    details(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=48, max_dist=0.3, strength=0.75))
