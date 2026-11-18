"""buisson — petit buisson de steppe (0,25 de haut) : boules de feuillage vert-gris, brindilles sèches."""
import math

import _boot  # noqa: F401

from lib import Model, finalize
from lib.palette import mix_srgb

NAME = "buisson"
FOOTPRINT = None
BUDGET = 200

GRIS_VERT = mix_srgb("palme_sombre", "pierre", 0.35)
GRIS_CLAIR = mix_srgb("palme", "pierre", 0.45)


def build():
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    rnd = m.rnd
    lobes = [(0.0, 0.0, 0.11, 0.115), (0.10, 0.05, 0.085, 0.09), (-0.10, 0.03, 0.09, 0.085),
             (0.03, -0.10, 0.085, 0.09), (-0.04, 0.10, 0.075, 0.07), (0.12, -0.06, 0.06, 0.06)]
    for (x, z, r, hh) in lobes:
        hh *= 1.5
        s = m.lathe([(r, 0.0), (r * 0.98, 0.5 * hh), (r * 0.42, hh)], 6, (0, 0, 0), smooth=0,
                    rot0=rnd.uniform(0, 60))
        for v in s.verts():
            k = 1.0 + rnd.uniform(-0.12, 0.12)
            v.co.x *= k
            v.co.z *= k
            if v.co.y > 0.01:
                v.co.y *= 1.0 + rnd.uniform(-0.1, 0.1)
        for f in s.faces:
            f.normal_update()
        s.translate(x, 0.0, z)
        s.color_fn(lambda f: (GRIS_CLAIR if f.normal.y > 0.45 else GRIS_VERT,
                              1.0 + rnd.uniform(-0.06, 0.06)), var=0.03)
    # brindilles sèches et tiges dressées
    for a in (20, 130, 220, 320):
        ar = math.radians(a)
        t = m.tube([(math.sin(ar) * 0.05, 0.06, math.cos(ar) * 0.05),
                    (math.sin(ar) * 0.12, 0.23, math.cos(ar) * 0.12)], 0.005, 3, cap=(False, True), smooth=90)
        t.color("bois", var=0.06, shade=1.1)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=32, max_dist=0.15, strength=0.7, height_grad=(0.8, 1.0)))
