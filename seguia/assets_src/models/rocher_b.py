"""rocher_b — dalle de grès basse et large, en table (0,30 de haut), avec deux pierres au pied."""
import _boot  # noqa: F401

from lib import Model, finalize
from _communs_accessoires import bloc_gres

NAME = "rocher_b"
FOOTPRINT = None
BUDGET = 200


def build():
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    bloc_gres(m, 0.0, 0.0, 0.40, 0.30, seg=7, sx=1.35, sz=0.9, yaw=-15, taper=0.92, jit=0.05).clamp_floor()
    bloc_gres(m, 0.12, 0.02, 0.26, 0.14, seg=6, sx=1.2, sz=0.9, y=0.25, yaw=25, taper=0.9,
              jit=0.08, strata=False)
    bloc_gres(m, 0.52, 0.28, 0.1, 0.12, seg=5, yaw=10, taper=0.85).clamp_floor()
    bloc_gres(m, -0.5, 0.3, 0.08, 0.09, seg=5, yaw=55, taper=0.85).clamp_floor()
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.3, strength=0.75, height_grad=(0.9, 1.0)))
