"""Bibliothèque commune des modèles Séguia (bpy en module, sans affichage).

Usage type (voir models/maison_a.py, le gabarit de référence) :

    import _boot  # noqa  (ajoute assets_src/ au sys.path)
    from lib import Model, finalize
    m = Model("maison_a", footprint=(2, 2), budget=1500)
    m.box((1.4, 0.9, 1.2), bevel=0.02, cell=0.3).color("pise")
    finalize(m)
"""
import bpy  # noqa: F401  (doit précéder bmesh / mathutils)

from .model import Model, Piece, V  # noqa: E402,F401
from . import prims  # noqa: E402,F401
from .export import finalize  # noqa: E402,F401
from .palette import PALETTE, linear, srgb  # noqa: E402,F401
