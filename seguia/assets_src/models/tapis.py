"""tapis — tapis plat rayé indigo / garance / safran, à franges et losange central."""
import _boot  # noqa: F401

from lib import Model, finalize
from _communs_accessoires import plane, join

NAME = "tapis"
FOOTPRINT = None
BUDGET = 200
W, D, T = 0.50, 0.78, 0.0125

BANDES = [("garance", .07), ("ecru", .02), ("indigo", .15), ("ecru", .02), ("safran", .24),
          ("ecru", .02), ("indigo", .15), ("ecru", .02), ("garance", .07)]


def build():
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    sl = m.boxmm((-W / 2, 0, -D / 2), (W / 2, T, D / 2), skip=("+y", "-y"))
    sl.color("garance", var=0.02, shade=0.8)
    tot = sum(b[1] for b in BANDES)
    z = -D / 2
    cz = 0.0
    parts = []
    for c, w in BANDES:
        z1 = z + D * w / tot
        q = plane(m, [(-W / 2, T + 0.0005, z), (W / 2, T + 0.0005, z), (W / 2, T + 0.0005, z1),
                      (-W / 2, T + 0.0005, z1)])
        q.color(c, var=0.03, face_var=0.02)
        z = z1
    # liserés le long des grands côtés
    for sx in (-1, 1):
        lis = plane(m, [(sx * (W / 2 - 0.03), T + 0.0015, -D / 2), (sx * W / 2, T + 0.0015, -D / 2),
                        (sx * W / 2, T + 0.0015, D / 2), (sx * (W / 2 - 0.03), T + 0.0015, D / 2)])
        lis.color("garance", var=0.02, shade=0.85)
    # losange central
    L = 0.115
    lo = plane(m, [(0, T + 0.0025, -0.16), (0.085, T + 0.0025, 0), (0, T + 0.0025, 0.16),
                   (-0.085, T + 0.0025, 0)])
    lo.color("garance", var=0.02)
    lo2 = plane(m, [(0, T + 0.0035, -0.07), (0.04, T + 0.0035, 0), (0, T + 0.0035, 0.07),
                    (-0.04, T + 0.0035, 0)])
    lo2.color("indigo", var=0.02)
    # franges
    for sz in (-1, 1):
        for i in range(7):
            x = -W / 2 + 0.035 + i * (W - 0.07) / 6
            fr = plane(m, [(x - 0.012, 0.002, sz * D / 2), (x + 0.012, 0.002, sz * D / 2),
                           (x + 0.012, 0.002, sz * (D / 2 + 0.05)), (x - 0.012, 0.002, sz * (D / 2 + 0.05))])
            fr.color("ecru", var=0.03)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=24, max_dist=0.1, strength=0.4, height_grad=(1.0, 1.0)))
