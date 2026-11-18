"""lanterne — lanterne de cuivre sur pied de bois (0,6 de haut), corps vitré `lumiere`."""
import _boot  # noqa: F401

from lib import Model, finalize
from lib import archi

NAME = "lanterne"
FOOTPRINT = None
BUDGET = 200
S = 2.3


def build():
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    base = m.lathe([(0.085, 0), (0.06, 0.035), (0.022, 0.075)], 6, (0, 0, 0), smooth=40)
    base.color("pierre_sombre", var=0.04)
    mast = m.tube([(0, 0.07, 0), (0, 0.20, 0), (0, 0.34, 0)], [0.020, 0.016, 0.014], 5,
                  cap=(False, True), smooth=70)
    mast.color("bois", var=0.04)
    collar = m.lathe([(0.03, 0.30), (0.03, 0.325), (0.014, 0.335)], 5, (0, 0, 0), smooth=40)
    collar.color("cuivre", var=0.04, shade=0.9)
    archi.lantern(m, (0, 0.34, 0), scale=S)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.25, strength=0.7))
