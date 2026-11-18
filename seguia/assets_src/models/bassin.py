"""bassin — abreuvoir des caravanes (emprise 3x2).

Bassin rectangulaire à murets bas de pierre, marches côté +Z, 4 poteaux d'attache
avec anneaux de cuivre, auge à l'extrémité +X, sol boueux piétiné autour.
Nœuds : `bassin` (racine) et `eau` (bassin + auge ; origine au niveau de l'eau).
Le fond descend à y = -0,10 (autorisé jusqu'à -0,12).
"""
import _boot  # noqa: F401

from lib import Model, finalize
from lib import archi
from lib.palette import mix_srgb

NAME = "bassin"
FOOTPRINT = (3, 2)
BUDGET = 1500

PARAMS = dict(hx=1.16, hz=0.60, wall_t=0.10, wall_h=0.22, floor_y=-0.10, water_y=0.13)


def bassin(m, P):
    hx, hz, t, h, fy = P["hx"], P["hz"], P["wall_t"], P["wall_h"], P["floor_y"]
    wl = P["water_y"]
    walls = [(-hx, -hz, hx, -hz + t), (-hx, hz - t, hx, hz),
             (-hx, -hz + t, -hx + t, hz - t), (hx - t, -hz + t, hx, hz - t)]
    for (x0, z0, x1, z1) in walls:
        w = m.boxmm((x0, fy, z0), (x1, h, z1), cell=0.35, bottom=False, top=False)
        def wet(f):
            c = f.calc_center_median()
            inward = f.normal.x * c.x + f.normal.z * c.z < 0  # paroi intérieure
            return ("pierre_sombre", 0.85) if inward and c.y < wl else ("pierre", 1.0)

        w.color_fn(wet, var=0.03)
        # margelle (chaperon) débordante
        cp = m.boxmm((x0 - 0.02, h, z0 - 0.02), (x1 + 0.02, h + 0.04, z1 + 0.02), bevel=0.01, cell=0.5)
        cp.color("pierre", var=0.03, face_var=0.05, shade=1.06)
    fl = m.boxmm((-hx + t, fy, -hz + t), (hx - t, fy, hz - t), skip=("+x", "-x", "+z", "-z", "-y"))
    fl.color("boue_sombre", var=0.02)
    archi.water(m, [(-hx + t, -hz + t), (hx - t, -hz + t), (hx - t, hz - t), (-hx + t, hz - t)], wl)


def marches(m, P):
    hz = P["hz"]
    for i, (dz, y) in enumerate(((0.20, 0.08), (0.11, 0.16))):
        st = m.boxmm((-0.24 + i * 0.03, 0, hz), (0.24 - i * 0.03, y, hz + dz), bevel=0.01, bottom=False)
        st.color("pierre", var=0.04, face_var=0.04)


def poteaux(m, P):
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (P["hx"] + 0.16), sz * (P["hz"] + 0.20)
            post = m.tube([(x, 0, z), (x + 0.01 * sx, 0.46, z)], [0.032, 0.026], 6,
                          cap=(False, True), smooth=70)
            post.color("bois", var=0.05)
            top = m.cone(0.03, 0.03, 6, (x + 0.01 * sx, 0.46, z))
            top.color("bois_sombre", var=0.04)
            ring = m.lathe([(0.03, -0.006), (0.042, 0.0), (0.03, 0.006)], 6, (0, 0, 0), cap=False,
                           smooth=70)
            ring.rotate("X", 90).translate(x, 0.36, z - sz * 0.03)
            ring.color("cuivre", var=0.04)


def auge(m, P):
    x0 = P["hx"] + 0.03
    t = 0.04
    a = m.boxmm((x0, 0, -0.30), (x0 + 0.20, 0.15, 0.30), bevel=0.012, bottom=False, top=False)
    a.color("pierre", var=0.03)
    inner = [(x0 + t, -0.30 + t), (x0 + 0.20 - t, -0.30 + t), (x0 + 0.20 - t, 0.30 - t), (x0 + t, 0.30 - t)]
    rim = m.add([(x0, 0.15, -0.30), (x0 + 0.20, 0.15, -0.30), (x0 + 0.20, 0.15, 0.30), (x0, 0.15, 0.30)]
                + [(x, 0.15, z) for x, z in inner],
                [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]])
    for f in rim.faces:
        if f.normal.y < 0:
            f.normal_flip()
    rim.color("pierre", var=0.03, shade=1.06)
    inside = m.prism(inner, 0.05, 0.15, top=False)
    for f in inside.faces:
        f.normal_flip()  # parois vues de l'intérieur
    inside.color("pierre_sombre", var=0.02, shade=0.85)
    bot = m.add([(x, 0.05, z) for x, z in inner], [[0, 1, 2, 3]])
    for f in bot.faces:
        if f.normal.y < 0:
            f.normal_flip()
    bot.color("boue_sombre", var=0.0)
    archi.water(m, inner, 0.12)


def abords(m, P):
    """Sol boueux piétiné autour du bassin, seau, fourrage."""
    rnd = m.rnd
    pts = []
    import math
    n = 18
    n = 28
    for i in range(n):
        a = 2 * math.pi * (i + 0.5) / n
        rx, rz = P["hx"] + 0.24, P["hz"] + 0.26
        k = rnd.uniform(0.95, 1.03)
        # super-ellipse (rectangle arrondi) : la boue déborde tout autour du bassin
        cx_, sz_ = math.cos(a), math.sin(a)
        x = math.copysign(abs(cx_) ** 0.35, cx_) * rx * k
        z = math.copysign(abs(sz_) ** 0.35, sz_) * rz * k
        pts.append((max(-1.42, min(1.42, x)), max(-0.92, min(0.92, z))))
    mud = m.add([(x, 0.003, z) for x, z in pts], [list(range(n))])
    for f in mud.faces:
        if f.normal.y < 0:
            f.normal_flip()
    mud.color(mix_srgb("boue", "#E3B98C", 0.45), var=0.02).no_cast()
    bucket = m.lathe([(0.04, 0), (0.05, 0.07)], 7, (-1.30, 0, 0.55), cap=False)
    bucket.color("bois", var=0.05)
    m.jar(0.18, 0.065, 8, (-1.33, 0, -0.45)).color("pise_sombre", var=0.05)
    hay = m.lathe([(0.10, 0), (0.12, 0.05), (0.08, 0.09), (0.0, 0.10)], 7, (1.25, 0, 0.60), smooth=50)
    hay.color(mix_srgb("safran", "ecru", 0.45), var=0.05, face_var=0.08)


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    abords(m, P)
    bassin(m, P)
    marches(m, P)
    poteaux(m, P)
    auge(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), min_y=-0.12, ao=dict(samples=40, max_dist=0.35, strength=0.75))
