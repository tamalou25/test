"""Éléments naturels : rochers de grès, touffes, roseaux."""
import math

from .model import V


def rock(m, center, size, seg=6, rings=4, jitter=0.18, flat_bottom=True, colors=("roche", "roche_sombre"),
         top_color=("roche", 1.18), flat_top=0.78):
    """Rocher de grès facetté : sphère basse déformée, dessus plus clair, ombrage plat.

    size = (sx, sy, sz) demi-dimensions. Base posée sur y = center.y si flat_bottom.
    """
    cx, cy, cz = center
    sx, sy, sz = size
    p = m.sphere(1.0, seg, rings, (0, 0, 0))
    rnd = m.rnd
    for v in p.verts():
        k = 1.0 + rnd.uniform(-jitter, jitter)
        v.co.x *= sx * k
        v.co.z *= sz * k
        v.co.y = v.co.y * sy * (1.0 + rnd.uniform(-jitter, jitter) * 0.6)
        if flat_bottom and v.co.y < -sy * 0.15:
            v.co.y = -sy * 0.15
        if v.co.y > sy * flat_top:  # dessus tabulaire (grès en table)
            v.co.y = sy * flat_top * (1.0 + rnd.uniform(-0.04, 0.04))
    for f in p.faces:
        f.normal_update()
    p.flat()
    p.translate(cx, cy + sy * 0.15, cz)

    def col(f):
        n = f.normal
        if n.y > 0.55:
            tc, k = top_color if isinstance(top_color, tuple) else (top_color, 1.0)
            return (tc, k * (1.0 + rnd.uniform(-0.06, 0.04)))
        return (colors[0] if rnd.random() < 0.7 else colors[1], 1.0 + rnd.uniform(-0.05, 0.05))

    p.color_fn(col, var=0.02)
    return p


def tuft(m, center, h=0.18, n=5, color="palme", spread=0.05):
    """Touffe de feuilles effilées (roseaux, herbe) : n lames triangulaires."""
    cx, cy, cz = center
    rnd = m.rnd
    parts = []
    for i in range(n):
        a = 2 * math.pi * i / n + rnd.uniform(-0.4, 0.4)
        lean = rnd.uniform(0.25, 0.6)
        hh = h * rnd.uniform(0.7, 1.1)
        tip = (cx + math.sin(a) * lean * hh * 0.6, cy + hh, cz + math.cos(a) * lean * hh * 0.6)
        w = 0.012
        ox, oz = math.cos(a) * w, -math.sin(a) * w
        b0 = (cx + math.sin(a) * spread * 0.3 - ox, cy, cz + math.cos(a) * spread * 0.3 - oz)
        b1 = (cx + math.sin(a) * spread * 0.3 + ox, cy, cz + math.cos(a) * spread * 0.3 + oz)
        blade = m.add([b0, b1, tip], [[0, 1, 2]])
        back = m.add([b1, b0, tip], [[0, 1, 2]])  # double face (fines lames)
        q = blade + back
        q.color_vertex_fn(lambda p, f, hh=hh: _mix(color, "palme_jeune", min(1.0, (p.y - cy) / hh)))
        parts.append(q)
    p = parts[0]
    for q in parts[1:]:
        p = p + q
    return p.no_cast()


def _mix(a, b, t):
    from .palette import mix_srgb
    return mix_srgb(a, b, t)
