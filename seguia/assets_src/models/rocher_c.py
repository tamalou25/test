"""rocher_c — deux blocs de grès penchés l'un contre l'autre (0,55 de haut), forme en coin."""
import _boot  # noqa: F401

from lib import Model, finalize
from _communs_accessoires import bloc_gres

NAME = "rocher_c"
FOOTPRINT = None
BUDGET = 200


def build():
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    bloc_gres(m, -0.1, -0.08, 0.2, 0.55, seg=5, sx=0.8, sz=1.2, yaw=35, tilt=14, taper=0.55,
              jit=0.14).clamp_floor()
    bloc_gres(m, 0.2, 0.05, 0.22, 0.34, seg=6, sx=1.2, sz=0.9, yaw=-20, taper=0.7,
              jit=0.14).clamp_floor()
    bloc_gres(m, 0.04, 0.3, 0.12, 0.16, seg=5, yaw=0, taper=0.8).clamp_floor()
    bloc_gres(m, -0.3, 0.2, 0.07, 0.08, seg=5, yaw=0, taper=0.8, strata=False).clamp_floor()
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.3, strength=0.75, height_grad=(0.9, 1.0)))
