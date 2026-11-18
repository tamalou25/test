"""panier — panier de vannerie à anses, plein de dattes. Accessoire, origine au pied."""
import _boot  # noqa: F401

from lib import Model, finalize
from _communs_accessoires import panier_dattes

NAME = "panier"
FOOTPRINT = None
BUDGET = 200


def build():
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    panier_dattes(m, 0, 0, 0, r=0.15, h=0.13, seg=8, loose=3)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.2, strength=0.8))
