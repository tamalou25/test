"""Palette Séguia (CONVENTIONS.md) et conversions de couleur.

Les hex de la palette sont en sRGB. Les attributs de couleur FLOAT_COLOR de Blender
stockent des valeurs LINÉAIRES et l'exporteur glTF les écrit telles quelles dans
COLOR_0 (que three.js lit comme linéaire). On convertit donc sRGB -> linéaire ici,
une seule fois, et tout le reste de la chaîne travaille en linéaire.
"""

PALETTE = {
    # Pisé
    "pise": "#C98A5E", "pise_clair": "#DBA77C", "pise_sombre": "#A8683F",
    # Chaux
    "chaux": "#F3E9D8", "chaux_ombre": "#E2D2B8",
    # Pierre / maçonnerie
    "pierre": "#B8A58C", "pierre_sombre": "#8F7D66",
    # Roche
    "roche": "#9A6B4F", "roche_sombre": "#6E4A38",
    # Bois de palmier
    "bois": "#7A5536", "bois_sombre": "#4F3523",
    # Palmes
    "palme": "#4F8F3A", "palme_sombre": "#2F6B2E", "palme_jeune": "#8DBB4A",
    # Terre humide / boue
    "boue": "#7A5236", "boue_sombre": "#5E3F2A",
    # Textiles
    "indigo": "#2E4A8F", "safran": "#E6A21E", "garance": "#B8402E",
    "ecru": "#F2E8D5", "turquoise": "#2A9D8F",
    # Cuivre, lumière
    "cuivre": "#C8823A", "lumiere": "#FFC56B",
    # Eau
    "eau": "#2FB5B0",
    # Chameau
    "chameau": "#C9A06A", "chameau_sombre": "#A07C4E",
    # Peau
    "peau": "#B07850", "peau_sombre": "#8A5A3C", "peau_claire": "#D29C72",
    # Dattes
    "datte": "#8A4B2A", "datte_claire": "#C27A2C",
    # Blanc pur : robe de l'habitant (teintée par le moteur)
    "blanc": "#FFFFFF",
}


def srgb_to_linear_channel(c: float) -> float:
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def linear_to_srgb_channel(c: float) -> float:
    c = max(0.0, c)
    if c <= 0.0031308:
        return c * 12.92
    return 1.055 * c ** (1 / 2.4) - 0.055


def hex_to_srgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def srgb(color):
    """Accepte un nom de palette, un hex '#RRGGBB' ou un triplet sRGB 0..1."""
    if isinstance(color, str):
        if color.startswith("#"):
            return hex_to_srgb(color)
        return hex_to_srgb(PALETTE[color])
    return tuple(color[:3])


def linear(color):
    """Couleur (nom / hex / triplet sRGB) -> triplet linéaire pour COLOR_0."""
    return tuple(srgb_to_linear_channel(c) for c in srgb(color))


def mix_srgb(a, b, t):
    a, b = srgb(a), srgb(b)
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
