"""rocher_a — grand rocher de grès en pilier trapu (0,75 de haut) flanqué d'un éclat et d'un galet."""
import _boot  # noqa: F401

from lib import Model, finalize
from _communs_accessoires import bloc_gres

NAME = "rocher_a"
FOOTPRINT = None
BUDGET = 200


def build():
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    bloc_gres(m, 0.0, 0.0, 0.25, 0.75, seg=7, sx=1.0, sz=0.9, tilt=3, yaw=10, taper=0.72).clamp_floor()
    bloc_gres(m, 0.27, 0.12, 0.17, 0.36, seg=6, yaw=40, taper=0.8, tilt=-5).clamp_floor()
    bloc_gres(m, -0.24, 0.2, 0.11, 0.2, seg=5, yaw=20, taper=0.85).clamp_floor()
    bloc_gres(m, -0.18, -0.22, 0.12, 0.28, seg=5, yaw=70, taper=0.8, tilt=6).clamp_floor()
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.3, strength=0.75, height_grad=(0.9, 1.0)))
