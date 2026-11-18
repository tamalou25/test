"""roseaux — touffe de roseaux (0,35 de haut) : lames arquées, quelques massettes brunes.

Les lames fines sont doublées géométriquement (le matériau `vc` est simple face).
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize
from lib.palette import mix_srgb

NAME = "roseaux"
FOOTPRINT = None
BUDGET = 200


def lame(m, x, z, h, yaw, lean, w, two=True):
    """Lame effilée penchée vers `yaw` ; 2 segments (arquée) ou 1 triangle, doublée."""
    a = math.radians(yaw)
    dx, dz = math.sin(a), math.cos(a)
    nx, nz = math.cos(a), -math.sin(a)
    if two:
        mid = (x + dx * lean * h * 0.25, h * 0.58, z + dz * lean * h * 0.25)
        tip = (x + dx * lean * h * 0.95, h, z + dz * lean * h * 0.95)
        w2 = w * 0.75
        verts = [(x - nx * w, 0, z - nz * w), (x + nx * w, 0, z + nz * w),
                 (mid[0] + nx * w2, mid[1], mid[2] + nz * w2), (mid[0] - nx * w2, mid[1], mid[2] - nz * w2), tip]
        fr = [[0, 1, 2, 3], [3, 2, 4]]
    else:
        tip = (x + dx * lean * h * 0.8, h, z + dz * lean * h * 0.8)
        verts = [(x - nx * w, 0, z - nz * w), (x + nx * w, 0, z + nz * w), tip]
        fr = [[0, 1, 2]]
    f1 = m.add(verts, fr)
    f2 = m.add(verts, [list(reversed(f)) for f in fr])
    p = f1 + f2
    p.color_vertex_fn(lambda q, f, h=h: mix_srgb("palme_sombre", "palme_jeune", min(1.0, q.y / h) ** 0.8))
    return p.no_cast()


def build():
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    rnd = m.rnd
    n_long, n_short = 13, 20
    for i in range(n_long):
        a = 360 * i / n_long + rnd.uniform(-12, 12)
        r = rnd.uniform(0.01, 0.07)
        lame(m, math.sin(math.radians(a)) * r, math.cos(math.radians(a)) * r,
             rnd.uniform(0.27, 0.35), a + rnd.uniform(-25, 25), rnd.uniform(0.35, 0.7), 0.012)
    for i in range(n_short):
        a = 360 * i / n_short + rnd.uniform(-10, 10)
        r = rnd.uniform(0.02, 0.1)
        lame(m, math.sin(math.radians(a)) * r, math.cos(math.radians(a)) * r,
             rnd.uniform(0.12, 0.22), a + rnd.uniform(-20, 20), rnd.uniform(0.4, 0.9), 0.011, two=False)
    # massettes : hampe fine + épi brun
    for a, r, hh in ((30, 0.03, 0.34), (160, 0.04, 0.3), (250, 0.02, 0.33), (320, 0.05, 0.27)):
        x, z = math.sin(math.radians(a)) * r, math.cos(math.radians(a)) * r
        ha = m.tube([(x, 0, z), (x + 0.012 * math.sin(math.radians(a)), hh * 0.8, z + 0.012 * math.cos(math.radians(a)))],
                    0.005, 3, cap=(False, False), smooth=90)
        ha.color("palme", var=0.05)
        ha.clamp_floor()
        ep = m.lathe([(0.013, 0), (0.014, 0.03), (0.0, 0.07)], 4,
                     (x + 0.012 * math.sin(math.radians(a)), hh * 0.8, z + 0.012 * math.cos(math.radians(a))),
                     smooth=80, cap=False)
        ep.color("boue", var=0.05)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=24, max_dist=0.15, strength=0.6, height_grad=(0.8, 1.0)))
