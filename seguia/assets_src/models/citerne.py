"""citerne — citerne maçonnée à demi couverte d'une voûte en berceau (emprise 2x2).

Cuve de pierre surélevée, voûte blanchie à la chaux sur la moitié arrière (-Z),
escalier extérieur côté +Z, vanne de bois sur une rigole de sortie (côté -X avant).
Nœuds : `citerne` (racine) et `eau` (cuve + rigole ; origine au niveau de l'eau).
"""
import _boot  # noqa: F401

from lib import Model, finalize
from lib import archi

NAME = "citerne"
FOOTPRINT = (2, 2)
BUDGET = 1500

PARAMS = dict(hx=0.60, hz=0.78, t=0.10, wall_h=0.34, water_y=0.24, vault_hfac=0.75, vault_end=-0.02)


def cuve(m, P):
    hx, hz, t, h = P["hx"], P["hz"], P["t"], P["wall_h"]
    walls = [(-hx, -hz, hx, -hz + t), (-hx, hz - t, hx, hz),
             (-hx, -hz + t, -hx + t, hz - t), (hx - t, -hz + t, hx, hz - t)]
    for (x0, z0, x1, z1) in walls:
        w = m.boxmm((x0, 0, z0), (x1, h, z1), cell=0.35, bottom=False, bevel=0.012)

        def col(f):
            c = f.calc_center_median()
            inward = f.normal.x * c.x + f.normal.z * c.z < 0
            if inward and c.y < P["water_y"]:
                return ("pierre_sombre", 0.85)
            if f.normal.y > 0.9:
                return ("pierre", 1.08)
            return ("pierre", 1.0)

        w.color_fn(col, var=0.03, )
    pl = m.boxmm((-hx - 0.03, 0, -hz - 0.03), (hx + 0.03, 0.07, hz + 0.03), bevel=0.012, bottom=False)
    pl.color("pierre_sombre", var=0.03)
    fl = m.boxmm((-hx + t, 0.07, -hz + t), (hx - t, 0.07, hz - t), skip=("+x", "-x", "+z", "-z", "-y"))
    fl.color("boue_sombre", var=0.02)
    archi.water(m, [(-hx + t, -hz + t), (hx - t, -hz + t), (hx - t, hz - t), (-hx + t, hz - t)],
                P["water_y"])


def voute(m, P):
    hx, hz, t, h = P["hx"], P["hz"], P["t"], P["wall_h"]
    archi.barrel_vault(m, hx, t, -hz, P["vault_end"], h, hfac=P["vault_hfac"], n=10)
    # bandeau de chaux au sommet des murs sous la voûte + petit lanterneau d'aération
    vy = h + hx * P["vault_hfac"]
    vent = m.box((0.12, 0.10, 0.12), (0, vy - 0.03, -hz / 2), bevel=0.01, bottom=False)
    vent.color("chaux", var=0.02)
    cap = m.box((0.17, 0.03, 0.17), (0, vy + 0.07, -hz / 2), bevel=0.008)
    cap.color("pierre", var=0.03)


def escalier(m, P):
    hz, h = P["hz"], P["wall_h"]
    n = 3
    for i in range(n):
        y = h * (i + 1) / (n + 0.4)
        d = 0.14 * (n - i) / n
        st = m.boxmm((0.06 + i * 0.015, 0, hz), (0.40 - i * 0.015, y, hz + d), bevel=0.01, bottom=False)
        st.color("pierre", var=0.04, face_var=0.04)


def vanne(m, P):
    hx, hz, t, h = P["hx"], P["hz"], P["t"], P["wall_h"]
    x = -0.28
    z0 = hz
    # rigole de sortie vers le bord de l'emprise
    for sx in (-1, 1):
        bank = m.boxmm((x + sx * 0.07 - 0.025, 0, z0), (x + sx * 0.07 + 0.025, 0.07, 0.94), bevel=0.012,
                       bottom=False)
        bank.color("pierre", var=0.04)
    bed = m.add([(x - 0.045, 0.004, z0), (x + 0.045, 0.004, z0), (x + 0.045, 0.004, 0.94),
                 (x - 0.045, 0.004, 0.94)], [[0, 1, 2, 3]])
    for f in bed.faces:
        if f.normal.y < 0:
            f.normal_flip()
    bed.color("boue_sombre").no_cast()
    archi.water(m, [(x - 0.045, z0), (x + 0.045, z0), (x + 0.045, 0.94), (x - 0.045, 0.94)], 0.035)
    # cadre de vanne : deux montants, traverse, pelle levée, manivelle
    zf = z0 + 0.05
    for sx in (-1, 1):
        post = m.box((0.035, 0.36, 0.035), (x + sx * 0.075, 0, zf), skip=("-y",))
        post.color("bois", var=0.05)
    bar = m.box((0.20, 0.035, 0.04), (x, 0.36, zf), bevel=0.006)
    bar.color("bois_sombre", var=0.04)
    board = m.box((0.11, 0.16, 0.022), (x, 0.13, zf), bevel=0.004)
    board.color_fn(lambda f: ("bois", 1.0 + 0.1 * ((int(f.calc_center_median().y * 60)) % 2)), var=0.03)
    rod = m.tube([(x, 0.29, zf), (x, 0.44, zf)], 0.008, 4, cap=(False, True))
    rod.color("cuivre", var=0.03)
    handle = m.beam((x - 0.06, 0.44, zf), (x + 0.06, 0.44, zf), w=0.015, h=0.015)
    handle.color("bois_sombre", var=0.03)


def details(m, P):
    hx, hz, h = P["hx"], P["hz"], P["wall_h"]
    bucket = m.lathe([(0.035, 0), (0.045, 0.06)], 7, (0.55, h, 0.45), cap=False)
    bucket.color("cuivre", var=0.04)
    m.jar(0.20, 0.07, 8, (0.78, 0.0, 0.62)).color("pise_sombre", var=0.05)
    m.jar(0.14, 0.05, 8, (0.80, 0.0, 0.40)).color("pise", var=0.05)


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    cuve(m, P)
    voute(m, P)
    escalier(m, P)
    vanne(m, P)
    details(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.35, strength=0.75))
