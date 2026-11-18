"""Primitives communes aux bâtiments hammam, fanal, sechoir, noria, puits, briqueterie.

Tout est en coordonnées du jeu (+Y haut, +Z façade). Chaque fonction renvoie une Piece
déjà colorée (sauf mention contraire). Ce module ne modifie pas lib/ : il s'appuie dessus.
"""
import math

from lib.model import V


# ------------------------------------------------------------------ utilitaires
def merge(parts):
    parts = [p for p in parts if p is not None and p.faces]
    p = parts[0]
    for q in parts[1:]:
        p = p + q
    return p


def bands(m, piece, color="pise", step=0.115, amp=0.035, top_color=None, top_shade=1.04):
    """Couleur par assise (banchées de pisé) ; faces de dessus plus claires."""
    rnd = m.rnd
    table = {}

    def fn(f):
        c = f.calc_center_median()
        if f.normal.y > 0.9:
            return (top_color or color, top_shade)
        k = int(math.floor(c.y / step))
        table.setdefault(k, 1.0 + rnd.uniform(-amp, amp))
        return (color, table[k])

    piece.color_fn(fn, var=0.004)
    return piece


def flip_up(piece):
    for f in piece.faces:
        f.normal_update()
        if f.normal.y < 0:
            f.normal_flip()
    return piece


def disc(m, center, r, n=8, y_up=True, rot0=0.0):
    """Disque horizontal (n-gone) à la hauteur center.y."""
    cx, cy, cz = center
    a0 = math.radians(rot0)
    pts = [(cx + r * math.sin(a0 + 2 * math.pi * i / n), cy, cz + r * math.cos(a0 + 2 * math.pi * i / n))
           for i in range(n)]
    p = m.add(pts, [list(range(n))])
    if y_up:
        flip_up(p)
    return p


# ------------------------------------------------------------------ roue (plan XY)
def ring_xy(m, center, r_out, r_in, z0, z1, n=16, rot0=0.0):
    """Anneau (jante) dans le plan XY, axe Z, entre z0 et z1. Non coloré."""
    cx, cy, _ = center
    verts, faces, outs = [], [], []
    a0 = math.radians(rot0)
    for i in range(n):
        a = a0 + 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        for r in (r_out, r_in):
            for z in (z0, z1):
                verts.append((cx + r * c, cy + r * s, z))
    # indices : base i*4 + (0 out z0, 1 out z1, 2 in z0, 3 in z1)
    for i in range(n):
        j = (i + 1) % n
        A, B = i * 4, j * 4
        am = a0 + 2 * math.pi * (i + 0.5) / n
        radial = V(math.cos(am), math.sin(am), 0)
        faces.append([A + 0, B + 0, B + 1, A + 1]); outs.append(radial)
        faces.append([A + 2, A + 3, B + 3, B + 2]); outs.append(-radial)
        faces.append([A + 1, B + 1, B + 3, A + 3]); outs.append(V(0, 0, 1))
        faces.append([A + 0, A + 2, B + 2, B + 0]); outs.append(V(0, 0, -1))
    p = m.add(verts, faces)
    for f, o in zip(p.faces, outs):
        f.normal_update()
        if f.normal.dot(o) < 0:
            f.normal_flip()
    return p


def bar_xy(m, center, a_deg, r0, r1, w, z0, z1):
    """Rayon de section rectangulaire dans le plan XY, de r0 à r1 selon l'angle a. Non coloré."""
    cx, cy, _ = center
    p = m.boxmm((r0, -w / 2, z0), (r1, w / 2, z1), skip=("+x", "-x"))
    p.rotate("Z", a_deg)
    p.translate(cx, cy, 0)
    return p


# ------------------------------------------------------------------ vannerie / dattes
def date_bed(m, x0, z0, x1, z1, y, cell=0.06, bump=0.018, colors=("datte", "datte_claire"), light=0.18):
    """Couche de dattes étalées : grille bosselée, une couleur par face (aspect grumeleux)."""
    nx = max(1, int(round((x1 - x0) / cell)))
    nz = max(1, int(round((z1 - z0) / cell)))
    rnd = m.rnd
    verts, faces = [], []
    for j in range(nz + 1):
        for i in range(nx + 1):
            edge = i in (0, nx) or j in (0, nz)
            h = 0.004 if edge else rnd.uniform(0.35, 1.0) * bump
            verts.append((x0 + (x1 - x0) * i / nx, y + h, z0 + (z1 - z0) * j / nz))
    for j in range(nz):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append([a, a + 1, a + nx + 2, a + nx + 1])
    p = m.add(verts, faces)
    flip_up(p)
    p.color_fn(lambda f: (colors[0], 1.0 + rnd.uniform(-0.22, 0.12)) if rnd.random() > light else
               (colors[1], 1.0 + rnd.uniform(-0.15, 0.0)), var=0.0)
    p.smooth(70)
    return p


def claie(m, x0, z0, x1, z1, y, frame_w=0.03, slats=True):
    """Claie de séchage : cadre de bois de palmier + nervures de palmes (lattes)."""
    parts = []
    t = frame_w
    for (a, b) in (((x0, z0), (x1, z0)), ((x0, z1), (x1, z1))):
        parts.append(m.boxmm((a[0], y - t, a[1] - t / 2), (b[0], y, a[1] + t / 2), bottom=False))
    for xx in (x0, x1):
        parts.append(m.boxmm((xx - t / 2, y - t, z0 + t / 2), (xx + t / 2, y, z1 - t / 2), bottom=False))
    fr = merge(parts).color("bois", var=0.05)
    out = [fr]
    if slats:
        # fond de nervures (une plaque fine claire, rayée)
        pl = m.boxmm((x0 + t / 2, y - t * 0.6, z0 + t / 2), (x1 - t / 2, y - t * 0.6 + 0.008, z1 - t / 2),
                     skip=("-y",))
        pl.color_fn(lambda f: ("pise_clair", 0.92 + 0.08 * math.sin(f.calc_center_median().x * 90)),
                    var=0.02)
        out.append(pl)
    return merge(out)


def basket_full(m, x, z, r=0.07, h=0.07, y=0.0, fill="datte", seg=8, handles=False):
    """Couffin de palmier tressé rempli à ras bord (dattes en dôme irrégulier)."""
    b = m.lathe([(r * 0.78, 0), (r * 1.02, h * 0.55), (r * 1.06, h), (r * 0.92, h)], seg, (x, y, z),
                smooth=50, cap=False)
    b.color_fn(lambda f: ("pise_clair", 0.95 + 0.07 * math.sin(f.calc_center_median().y * 140)),
               var=0.02)
    top = m.dome(r * 0.94, seg, 2, (x, y + h * 0.8, z), height=h * 0.55)
    rnd = m.rnd
    top.color_fn(lambda f: (fill if rnd.random() < 0.8 else "datte",
                            1.0 + rnd.uniform(-0.18, 0.08)), var=0.0)
    out = [b, top]
    if handles:
        for s in (-1, 1):
            hd = m.tube([(x + s * r * 0.95, y + h * 0.9, z - 0.02), (x + s * r * 1.15, y + h * 1.25, z),
                         (x + s * r * 0.95, y + h * 0.9, z + 0.02)], 0.006, 3, cap=(False, False))
            hd.color("bois", var=0.04)
            out.append(hd)
    return merge(out)


def sack(m, x, z, sx=0.07, sy=0.06, sz=0.08, y=0.0, color="ecru", rot=0.0):
    p = m.sphere(1.0, 7, 4).scale(sx, sy, sz)
    for v in p.verts():
        if v.co.y > sy * 0.6:
            v.co.x *= 0.55
            v.co.z *= 0.55
    if rot:
        p.rotate_y(rot)
    p.translate(x, y + sy * 0.9, z)
    p.clamp_floor(y)
    return p.color(color, var=0.05, shade=0.9 if color == "ecru" else 1.0)


# ------------------------------------------------------------------ outils
def hoe(m, base, yaw=0.0, length=0.30, lean=70.0):
    """Houe (ou pelle) posée au sol / appuyée : manche + fer de cuivre sombre."""
    bx, by, bz = base
    a = math.radians(yaw)
    d = V(math.sin(a), 0, math.cos(a))
    l = math.radians(lean)
    tip = V(bx, by, bz) + d * (length * math.sin(l)) + V(0, length * math.cos(l), 0)
    h = m.tube([V(bx, by + 0.012, bz), tip], 0.008, 4, cap=(False, True))
    h.color("bois", var=0.05)
    blade = m.boxmm((-0.035, 0, -0.004), (0.035, 0.045, 0.004))
    blade.rotate("X", -60).rotate_y(yaw).translate(bx, by + 0.004, bz)
    blade.color("pierre_sombre", var=0.03, shade=0.85)
    return merge([h, blade]).no_cast()


def rope_coil(m, x, z, r=0.04, y=0.0, turns=2):
    pts = []
    n = 8 * turns
    for i in range(n + 1):
        a = 2 * math.pi * i / 8
        rr = r * (1.0 - 0.15 * i / n)
        pts.append((x + rr * math.cos(a), y + 0.008 + 0.010 * i / n, z + rr * math.sin(a)))
    p = m.tube(pts, 0.009, 3, cap=(False, False), smooth=80)
    return p.color("pise_clair", var=0.03, shade=0.8).no_cast()


def stone_ring(m, center, r_out, r_in, h, n=10, color="pierre", lip=0.0, dark_inside=True,
               inner_depth=0.0, courses=1):
    """Margelle annulaire (lathe) : extérieur, dessus usé, intérieur qui s'assombrit."""
    cx, cy, cz = center
    prof = [(r_out, 0.0)] + [(r_out * (1 - 0.012 * k), h * k / courses) for k in range(1, courses)] + \
        [(r_out, h - 0.02), (r_out + lip, h), (r_in, h), (r_in, inner_depth)]
    p = m.lathe(prof, n, (cx, cy, cz), smooth=25, cap=False)
    rnd = m.rnd

    def col(f):
        c = f.calc_center_median()
        rr = math.hypot(c.x - cx, c.z - cz)
        if f.normal.y > 0.7:
            return (color, 1.1)
        if dark_inside and rr < (r_in + r_out) / 2 and (f.normal.x * (c.x - cx) + f.normal.z * (c.z - cz)) < 0:
            return ("pierre_sombre", 0.7)
        return (color if rnd.random() < 0.75 else "pierre_sombre", 1.0 + rnd.uniform(-0.07, 0.05))

    p.color_fn(col, var=0.02)
    return p
