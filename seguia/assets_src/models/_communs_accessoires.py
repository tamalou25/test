"""Éléments partagés par les accessoires et les maisons de la série (b, c, étal, tente...).

Tout est en coordonnées du jeu (+Y haut, +Z façade). Chaque fonction renvoie une Piece
déjà colorée.
"""
import math

import _boot  # noqa: F401

from lib import V
from lib.palette import mix_srgb


def plane(m, pts, up=True, mat=None):
    """Polygone plat [(x, y, z), ...] (face visible vers le haut si up)."""
    p = m.add(pts, [list(range(len(pts)))], mat=mat)
    for f in p.faces:
        f.normal_update()
        if (f.normal.y < 0) == up:
            f.normal_flip()
    return p


def join(parts):
    p = parts[0]
    for q in parts[1:]:
        p = p + q
    return p


def sac(m, x, z, y=0.0, h=0.2, r=0.1, color="ecru", tie="garance", yaw=0.0, tilt=0.0,
        seg=6, squash=0.85):
    """Sac de toile à col lié (≈ 56 triangles à seg=6)."""
    prof = [(0.62 * r, 0.0), (r, 0.33 * h), (0.92 * r, 0.62 * h), (0.30 * r, 0.86 * h),
            (0.42 * r, h)]
    p = m.lathe(prof, seg, (0, 0, 0), smooth=45, sz=squash)

    def col(f):
        c = f.calc_center_median()
        if c.y > 0.84 * h:
            return (tie, 1.0)
        return (color, 1.0 + 0.05 * (c.y / h))

    p.color_fn(col, var=0.025)
    for v in p.verts():  # sac mou : sommets déplacés un peu
        if v.co.y > 0.05:
            v.co.x += m.rnd.uniform(-0.1, 0.1) * r
            v.co.z += m.rnd.uniform(-0.1, 0.1) * r
    for f in p.faces:
        f.normal_update()
    if tilt:
        p.rotate("X", tilt, pivot=(0, 0.1 * h, 0))
    if yaw:
        p.rotate_y(yaw)
    return p.translate(x, y, z)


def panier_dattes(m, x, z, y=0.0, r=0.12, h=0.1, seg=8, fill=("datte", "datte_claire"),
                  handles=True, loose=3):
    """Panier de vannerie à anses, plein à ras bord et en dôme (dattes)."""
    prof = [(0.74 * r, 0.0), (0.9 * r, 0.35 * h), (r, 0.7 * h), (1.04 * r, h)]
    body = m.lathe(prof, seg, (x, y, z), smooth=40)
    body.color_fn(lambda f: ("pise_clair", 0.80 + 0.2 * ((int(f.calc_center_median().y * 150)) % 2)
                             if f.calc_center_median().y < 0.9 * h else 0.7), var=0.03)
    heap = m.lathe([(0.97 * r, 0.92 * h), (0.85 * r, 1.22 * h), (0.5 * r, 1.5 * h),
                    (0.0, 1.62 * h)], seg, (x, y, z), smooth=35, cap=False)
    for v in heap.verts():
        v.co.x += m.rnd.uniform(-0.012, 0.012)
        v.co.z += m.rnd.uniform(-0.012, 0.012)
        v.co.y += m.rnd.uniform(-0.008, 0.008)
    for f in heap.faces:
        f.normal_update()
    heap.color_fn(lambda f: (fill[0], 1.0) if m.rnd.random() < 0.5 else (fill[1], 0.78), var=0.06)
    parts = [body, heap]
    if handles:
        for sx in (-1, 1):
            a = m.tube([(sx * 1.0 * r, y + 0.62 * h, z), (sx * 1.2 * r, y + 0.78 * h, z),
                        (sx * 1.0 * r, y + 1.05 * h, z)], 0.012 * max(1.0, r / 0.1), 3,
                       cap=(False, False), smooth=70)
            a.color("pise_sombre", var=0.03)
            parts.append(a)
    for i in range(loose):
        a = 2 * math.pi * (i + m.rnd.random()) / max(loose, 1)
        d = r * (0.45 + 0.3 * m.rnd.random())
        dt = m.sphere(0.024, 5, 2, (x + math.sin(a) * d, y + 1.38 * h - 0.4 * d / r * h * 0.5,
                                   z + math.cos(a) * d), sy=0.85, smooth=90)
        dt.color("datte_claire", var=0.1, shade=0.95)
        parts.append(dt)
    return join(parts)


def bloc_gres(m, cx, cz, r, h, seg=6, sx=1.0, sz=1.0, tilt=0.0, yaw=0.0, jit=0.12,
              y=0.0, strata=True, taper=0.82):
    """Bloc de grès facetté (colonne trapue) : 3 assises, sommet un peu plus étroit.

    ≈ 40 triangles à seg=6. r = rayon à la base ; h = hauteur.
    """
    prof = [(r, 0.0), (r * 1.06, 0.30 * h), (r * 0.94, 0.66 * h), (r * taper, h)]
    p = m.lathe(prof, seg, (0, 0, 0), smooth=0, sx=sx, sz=sz, rot0=m.rnd.uniform(0, 60))
    rnd = m.rnd
    for v in p.verts():
        k = 1.0 + rnd.uniform(-jit, jit)
        v.co.x *= k
        v.co.z *= k
        if v.co.y > 0.01:
            v.co.y *= 1.0 + rnd.uniform(-jit, jit) * 0.5
    for f in p.faces:
        f.normal_update()
    p.flat()

    def col(f):
        c = f.calc_center_median()
        if f.normal.y > 0.6:
            return ("roche", 1.20 * (1.0 + rnd.uniform(-0.05, 0.03)))
        k = int(c.y / (0.30 * h + 1e-6))
        base = "roche" if (k % 2 == 0) else "roche_sombre"
        return (base, 1.0 + rnd.uniform(-0.07, 0.07)) if strata else ("roche", 1.0)

    p.color_fn(col, var=0.02)
    if tilt:
        p.rotate("X", tilt, pivot=(0, 0.05 * h, 0))
    if yaw:
        p.rotate_y(yaw)
    p.translate(cx, y, cz)
    return p


def clamp_floor_all(p):
    return p.clamp_floor()


def petit_panier(m, x, z, y=0.0, r=0.08, h=0.055, fill="datte", seg=5, fill2=None):
    """Panier économe (≈ 30 triangles à seg=6) : cuvette + tas de marchandise."""
    body = m.lathe([(0.7 * r, 0.0), (r, h)], seg, (x, y, z), smooth=0, cap=False)
    body.color("pise_clair", var=0.04, shade=0.85)
    heap = m.lathe([(0.93 * r, 0.9 * h), (0.55 * r, 1.45 * h), (0.0, 1.62 * h)], seg, (x, y, z),
                   smooth=0, cap=False)
    for v in heap.verts():
        v.co.y += m.rnd.uniform(-0.006, 0.006) if v.co.y > y + 0.01 else 0
    for f in heap.faces:
        f.normal_update()
    f2 = fill2 or fill
    heap.color_fn(lambda f: (fill, 1.0) if m.rnd.random() < 0.6 else (f2, 0.85), var=0.05)
    return body + heap


def bloc(m, x0, z0, x1, z1, y0, h, color, t, plinth=False):
    """Volume de pisé posé en y0 : murs bandés + sol de terrasse maillé finement."""
    w, d = x1 - x0, z1 - z0
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    body = m.box((w, h, d), (cx, y0, cz), cell=0.52, bottom=False, top=False)
    body.bevel(0.02, angle=30)
    rnd = m.rnd
    bands = {}

    def col(f):
        c = f.calc_center_median()
        k = int((c.y - y0) / 0.115)
        bands.setdefault(k, 1.0 + rnd.uniform(-0.03, 0.03))
        return (color, bands[k])

    body.color_fn(col, var=0.004)
    for v in body.verts():
        if y0 + 0.05 < v.co.y < y0 + h - 0.05:
            v.co.x += rnd.uniform(-0.005, 0.005)
            v.co.z += rnd.uniform(-0.005, 0.005)
    for f in body.faces:
        f.normal_update()
    fl = m.box((w - 2 * t, 0.0, d - 2 * t), (cx, y0 + h, cz), cell=0.3,
               skip=("+x", "-x", "+z", "-z", "-y"))
    fl.color("pise_clair", var=0.02, face_var=0.01)
    return body


def muret(m, x0, z0, x1, z1, y, h, color="pise", horn_color="pise_clair", bevel=0.012, cell=0.8):
    p = m.boxmm((x0, y, z0), (x1, y + h, z1), bevel=bevel, bottom=False, cell=cell)
    p.color_fn(lambda f: (horn_color, 1.0) if f.calc_center_median().y > y + h - 0.004
               else (color, 1.04 if f.normal.y > 0.9 else 1.0), var=0.02)
    return p


def corne(m, cx, cz, y, t, horn=0.075, color="pise_clair"):
    s = t * 1.5
    p = m.lathe([(s * 0.72, 0), (s * 0.20, horn)], 4, (cx, y, cz), smooth=10, rot0=45)
    return p.color(color, var=0.03)
