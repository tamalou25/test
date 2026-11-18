"""sacs — tas de 3 sacs de toile (2 au sol, 1 couché dessus). Accessoire, origine au pied."""
import _boot  # noqa: F401

from lib import Model, finalize
from _communs_accessoires import sac

NAME = "sacs"
FOOTPRINT = None
BUDGET = 200


def build():
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    sac(m, -0.11, 0.02, h=0.21, r=0.105, color="ecru", tie="garance", yaw=15)
    sac(m, 0.12, -0.01, h=0.19, r=0.10, color="chaux_ombre", tie="indigo", yaw=-30)
    sac(m, 0.0, -0.05, y=0.13, h=0.2, r=0.095, color="ecru", tie="bois", yaw=70, tilt=-8)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.22, strength=0.8))
