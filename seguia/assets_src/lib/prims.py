"""Primitives de modélisation, attachées à Model (m.box(...), m.lathe(...), ...).

Conventions communes :
- coordonnées du jeu (+Y haut, +Z façade) ;
- `base` = point d'appui (centre de la face inférieure) sauf mention contraire ;
- chaque primitive renvoie une Piece, à colorer avec .color(...) (sinon magenta) ;
- `node` / `mat` facultatifs : par défaut ceux du contexte `with m.using(...)`.
"""
import math

from mathutils import Matrix, Vector

from .model import Model, Piece, V

UP = Vector((0, 0, 1))  # inutilisé (Blender) ; en jeu le haut est +Y
Y = Vector((0, 1, 0))


def _orient(face, outward):
    face.normal_update()
    if face.normal.dot(outward) < 0:
        face.normal_flip()


def _grid(n0, n1):
    return [(i, j) for i in range(n0) for j in range(n1)]


# ---------------------------------------------------------------- boîtes
def box(m, size, base=(0, 0, 0), bevel=0.0, rot_y=0.0, cell=None, top=True,
        bottom=True, skip=(), node=None, mat=None):
    """Parallélépipède posé sur `base` (centre du dessous).

    skip : faces à omettre parmi '+x','-x','+y','-y','+z','-z' (faces cachées
    contre un mur : économise des triangles ; ne pas chanfreiner une boîte ouverte).

    bevel : chanfrein des arêtes (unités) ; cell : taille max d'une maille
    (subdivise les grandes faces pour que l'occlusion ait des sommets où se poser).
    """
    sx, sy, sz = size
    hx, hz = sx / 2, sz / 2
    verts, faces = [], []
    cache = {}

    def vid(p):
        k = tuple(round(c, 6) for c in p)
        if k not in cache:
            cache[k] = len(verts)
            verts.append(p)
        return cache[k]

    def n_for(length):
        return max(1, int(math.ceil(length / cell - 1e-6))) if cell else 1

    def quad_grid(o, u, v, nu, nv):
        for i, j in _grid(nu, nv):
            a = [o[k] + u[k] * i / nu + v[k] * j / nv for k in range(3)]
            b = [o[k] + u[k] * (i + 1) / nu + v[k] * j / nv for k in range(3)]
            c = [o[k] + u[k] * (i + 1) / nu + v[k] * (j + 1) / nv for k in range(3)]
            d = [o[k] + u[k] * i / nu + v[k] * (j + 1) / nv for k in range(3)]
            faces.append([vid(a), vid(b), vid(c), vid(d)])

    nx, ny, nz = n_for(sx), n_for(sy), n_for(sz)
    # chaque face : origine, u, v choisis pour une normale sortante (u x v)
    skip = set(skip)
    if not top:
        skip.add("+y")
    if not bottom:
        skip.add("-y")
    if "+z" not in skip:
        quad_grid((-hx, 0, hz), (sx, 0, 0), (0, sy, 0), nx, ny)
    if "-z" not in skip:
        quad_grid((hx, 0, -hz), (-sx, 0, 0), (0, sy, 0), nx, ny)
    if "+x" not in skip:
        quad_grid((hx, 0, hz), (0, 0, -sz), (0, sy, 0), nz, ny)
    if "-x" not in skip:
        quad_grid((-hx, 0, -hz), (0, 0, sz), (0, sy, 0), nz, ny)
    if "+y" not in skip:
        quad_grid((-hx, sy, hz), (sx, 0, 0), (0, 0, -sz), nx, nz)
    if "-y" not in skip:
        quad_grid((-hx, 0, -hz), (sx, 0, 0), (0, 0, sz), nx, nz)
    p = m.add(verts, faces, node, mat)
    if bevel:
        p.bevel(bevel)
    if rot_y:
        p.rotate_y(rot_y)
    p.translate(*base)
    return p


def boxmm(m, lo, hi, **kw):
    """Boîte définie par ses coins min / max."""
    lo, hi = V(lo), V(hi)
    size = hi - lo
    base = ((lo.x + hi.x) / 2, lo.y, (lo.z + hi.z) / 2)
    return box(m, (size.x, size.y, size.z), base, **kw)


# ---------------------------------------------------------- révolution
def lathe(m, profile, seg=12, base=(0, 0, 0), smooth=55.0, cap=True, rot0=0.0,
          sx=1.0, sz=1.0, node=None, mat=None):
    """Solide de révolution autour de Y. profile = [(rayon, y), ...] du bas vers le haut.

    Un rayon nul en bout de profil produit un pôle (pointe) ; sinon un bouchon si cap.
    sx / sz : écrasement elliptique.
    """
    verts, faces = [], []
    rings = []
    for (r, y) in profile:
        if r <= 1e-6:
            rings.append([len(verts)])
            verts.append((0, y, 0))
            continue
        ring = []
        for j in range(seg):
            a = 2 * math.pi * j / seg + math.radians(rot0)
            ring.append(len(verts))
            verts.append((r * math.sin(a) * sx, y, r * math.cos(a) * sz))
        rings.append(ring)
    outs = []
    for i in range(len(rings) - 1):
        A, B = rings[i], rings[i + 1]
        (r0, y0), (r1, y1) = profile[i], profile[i + 1]
        dr, dy = r1 - r0, y1 - y0
        for j in range(seg):
            j1 = (j + 1) % seg
            if len(A) == 1:
                f = [A[0], B[j1], B[j]]
            elif len(B) == 1:
                f = [A[j], A[j1], B[0]]
            else:
                f = [A[j], A[j1], B[j1], B[j]]
            faces.append(f)
            outs.append((dy, -dr, j))
    caps = []
    if cap and len(rings[0]) > 1:
        faces.append(list(reversed(rings[0])))
        caps.append(-1)
    if cap and len(rings[-1]) > 1:
        faces.append(list(rings[-1]))
        caps.append(1)
    p = m.add(verts, faces, node, mat)
    # orientation : normale sortante du profil
    k = 0
    for f in p.faces:
        c = f.calc_center_median()
        rad = Vector((c.x, 0, c.z))
        if rad.length > 1e-9:
            rad.normalize()
        if k < len(outs):
            dy, mdr, _ = outs[k]
            out = rad * dy + Y * mdr
            if out.length < 1e-9:
                out = rad
        else:
            out = Y * caps[k - len(outs)]
        _orient(f, out)
        k += 1
    p.smooth(smooth)
    p.translate(*base)
    return p


def cylinder(m, r, h, seg=10, base=(0, 0, 0), cap=True, smooth=55.0, **kw):
    return lathe(m, [(r, 0), (r, h)], seg, base, smooth, cap, **kw)


def cone(m, r, h, seg=10, base=(0, 0, 0), r_top=0.0, **kw):
    return lathe(m, [(r, 0), (r_top, h)], seg, base, **kw)


def dome(m, r, seg=12, rings=4, base=(0, 0, 0), height=None, pointed=0.0, **kw):
    """Coupole : quart de cercle (ou ogive si pointed>0) sur un anneau de rayon r."""
    h = r if height is None else height
    prof = []
    for i in range(rings + 1):
        t = i / rings * (math.pi / 2)
        rr = r * math.cos(t)
        yy = h * math.sin(t)
        prof.append((rr, yy))
    prof[-1] = (0.0, h + pointed)
    return lathe(m, prof, seg, base, cap=False, **kw)


def sphere(m, r, seg=8, rings=5, base=(0, 0, 0), sy=1.0, **kw):
    """Sphère dont le CENTRE est en base."""
    prof = []
    for i in range(rings + 1):
        t = -math.pi / 2 + math.pi * i / rings
        prof.append((r * math.cos(t) if 0 < i < rings else 0.0, r * math.sin(t) * sy))
    return lathe(m, prof, seg, base, cap=False, **kw)


def jar(m, h=0.22, r=0.08, seg=8, base=(0, 0, 0), neck=0.45, lip=True, **kw):
    """Jarre de terre : panse, épaulement, col, lèvre éversée. (h = hauteur totale)"""
    prof = [(r * 0.55, 0.0), (r * 0.92, h * 0.25), (r, h * 0.48), (r * 0.72, h * 0.78),
            (r * neck, h * 0.90)]
    if lip:
        prof += [(r * neck * 1.25, h)]
    return lathe(m, prof, seg, base, **kw)


# ---------------------------------------------------- balayage le long d'une courbe
def tube(m, points, radii, sides=6, cap=(True, True), smooth=65.0, sx=1.0,
         node=None, mat=None, rot0=0.0):
    """Tube polygonal le long d'une polyligne (repères à transport parallèle).

    radii : un nombre ou une liste par point. sx : ellipse (largeur/hauteur).
    """
    pts = [V(p) for p in points]
    if not isinstance(radii, (list, tuple)):
        radii = [radii] * len(pts)
    n = len(pts)
    tans = []
    for i in range(n):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        tans.append((b - a).normalized())
    ref = Vector((1, 0, 0)) if abs(tans[0].x) < 0.9 else Vector((0, 0, 1))
    nrm = tans[0].cross(ref).normalized()
    frames = []
    for i in range(n):
        if i > 0:
            rot = tans[i - 1].rotation_difference(tans[i])
            nrm = (rot @ nrm).normalized()
        b = tans[i].cross(nrm).normalized()
        frames.append((nrm.copy(), b))
    verts, faces = [], []
    for i in range(n):
        nn, bb = frames[i]
        for j in range(sides):
            a = 2 * math.pi * j / sides + math.radians(rot0)
            off = nn * (math.cos(a) * radii[i] * sx) + bb * (math.sin(a) * radii[i])
            verts.append(pts[i] + off)
    for i in range(n - 1):
        for j in range(sides):
            j1 = (j + 1) % sides
            faces.append([i * sides + j, i * sides + j1, (i + 1) * sides + j1, (i + 1) * sides + j])
    nside = len(faces)
    if cap[0]:
        faces.append(list(range(sides)))
    if cap[1]:
        faces.append([(n - 1) * sides + j for j in range(sides)])
    p = m.add(verts, faces, node, mat)
    for k, f in enumerate(p.faces):
        c = f.calc_center_median()
        if k < nside:
            i = k // sides
            mid = (pts[i] + pts[i + 1]) / 2
            _orient(f, c - mid)
        elif k == nside and cap[0]:
            _orient(f, -tans[0])
        else:
            _orient(f, tans[-1])
    p.smooth(smooth)
    return p


def beam(m, a, b, w=0.05, h=None, node=None, mat=None, roll=0.0):
    """Poutre de section rectangulaire de a à b (bouts francs)."""
    h = w if h is None else h
    a, b = V(a), V(b)
    d = b - a
    L = d.length
    p = box(m, (w, h, L), (0, -h / 2, L / 2), node=node, mat=mat)
    if roll:
        p.rotate("Z", roll)
    q = d.normalized().to_track_quat("Z", "Y")
    p.transform(q.to_matrix())
    p.translate(*a)
    return p


def log_end(m, pos, direction, r=0.03, length=0.1, sides=6, node=None, mat=None):
    """Bout de poutre de palmier ronde dépassant d'un mur (de pos vers direction)."""
    a = V(pos)
    d = V(direction).normalized()
    return tube(m, [a - d * 0.02, a + d * length], r, sides, cap=(False, True),
                smooth=80, node=node, mat=mat)


# ------------------------------------------------------- polygones extrudés
def prism(m, poly, y0, y1, node=None, mat=None, top=True, bottom=False):
    """Extrusion verticale d'un polygone [(x, z), ...] entre y0 et y1."""
    n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1]
               for i in range(n))
    verts = [(x, y0, z) for x, z in poly] + [(x, y1, z) for x, z in poly]
    faces, outs = [], []
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j, n + i])
        dx, dz = poly[j][0] - poly[i][0], poly[j][1] - poly[i][1]
        outs.append(Vector((dz, 0, -dx)) if area > 0 else Vector((-dz, 0, dx)))
    if top:
        faces.append(list(range(n, 2 * n)))
        outs.append(Y)
    if bottom:
        faces.append(list(range(n)))
        outs.append(-Y)
    p = m.add(verts, faces, node, mat)
    for f, o in zip(p.faces, outs):
        _orient(f, o)
    return p


def horseshoe(open_w, spring_y, horse_deg=22.0, n=12):
    """Contour (x, y) d'un arc outrepassé : de la base du piédroit gauche à celle du droit."""
    hw = open_w / 2
    th = math.radians(horse_deg)
    R = hw / math.cos(th)
    yc = spring_y + R * math.sin(th)
    pts = [(-hw, 0.0)]
    for i in range(n + 1):
        phi = math.pi + th - (math.pi + 2 * th) * i / n
        pts.append((R * math.cos(phi), yc + R * math.sin(phi)))
    pts.append((hw, 0.0))
    return pts, yc + R


def arch_wall(m, width, height, thick, open_w, spring_y, base=(0, 0, 0), rot_y=0.0,
              horse_deg=22.0, n=12, node=None, mat=None):
    """Pan de mur percé d'un arc outrepassé (vraie ouverture, intrados compris).

    Le mur est centré en X, d'épaisseur `thick` en Z, posé sur base. Renvoie la Piece.
    """
    inner, top = horseshoe(open_w, spring_y, horse_deg, n)
    assert top < height - 0.02, "arc plus haut que le mur"
    W2 = width / 2
    yc = spring_y + (open_w / 2) * math.tan(math.radians(horse_deg))

    def proj(p):
        x, y = p
        if y <= spring_y + 1e-6:
            return (-W2 if x < 0 else W2, y)
        dx, dy = x, y - yc
        ts = []
        if dx < 0:
            ts.append(-W2 / dx)
        if dx > 0:
            ts.append(W2 / dx)
        if dy > 0:
            ts.append((height - yc) / dy)
        t = min(ts)
        return (dx * t, yc + dy * t)

    outer = [proj(p) for p in inner]
    # contour extérieur avec coins insérés
    verts2d, idx_in, idx_out = [], [], []
    for p in inner:
        idx_in.append(len(verts2d))
        verts2d.append(p)
    oute = []  # liste (indice, coin?) le long du bord extérieur
    for k, p in enumerate(outer):
        if k > 0:
            a, b = outer[k - 1], p
            on_left = lambda q: abs(q[0] + W2) < 1e-6
            on_right = lambda q: abs(q[0] - W2) < 1e-6
            on_top = lambda q: abs(q[1] - height) < 1e-6
            if on_left(a) and on_top(b) and not on_top(a):
                oute.append((len(verts2d), True))
                verts2d.append((-W2, height))
            if on_top(a) and on_right(b) and not on_top(b):
                oute.append((len(verts2d), True))
                verts2d.append((W2, height))
        oute.append((len(verts2d), False))
        verts2d.append(p)
    # sommets 3D : avant (z=+t/2) puis arrière
    nv = len(verts2d)
    t2 = thick / 2
    verts = [(x, y, t2) for x, y in verts2d] + [(x, y, -t2) for x, y in verts2d]
    faces, outs = [], []
    # faces avant / arrière : bandes entre contour intérieur et extérieur
    out_main = [i for i, c in oute if not c]
    k_out = 0
    for k in range(len(inner) - 1):
        a_in, b_in = idx_in[k], idx_in[k + 1]
        a_out, b_out = out_main[k], out_main[k + 1]
        ia = [i for i, _ in oute].index(a_out)
        ib = [i for i, _ in oute].index(b_out)
        corners = [oute[q][0] for q in range(ia + 1, ib)]
        ring = [a_in, b_in, b_out] + list(reversed(corners)) + [a_out]
        faces.append(ring)
        outs.append(Vector((0, 0, 1)))
        faces.append([i + nv for i in ring])
        outs.append(Vector((0, 0, -1)))
    # intrados
    for k in range(len(inner) - 1):
        a, b = idx_in[k], idx_in[k + 1]
        faces.append([a, b, b + nv, a + nv])
        ca = Vector((*verts2d[a], 0)); cb = Vector((*verts2d[b], 0))
        mid = (ca + cb) / 2
        outs.append(Vector((-mid.x, yc - mid.y, 0)) if mid.y > spring_y else Vector((-mid.x, 0, 0)))
    # pourtour extérieur
    ol = [i for i, _ in oute]
    for k in range(len(ol) - 1):
        a, b = ol[k], ol[k + 1]
        pa, pb = verts2d[a], verts2d[b]
        if abs(pa[0] - pb[0]) < 1e-9 and abs(pa[1] - pb[1]) < 1e-9:
            continue
        faces.append([a, b, b + nv, a + nv])
        mid = ((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2)
        if abs(mid[1] - height) < 1e-6:
            outs.append(Y)
        else:
            outs.append(Vector((1 if mid[0] > 0 else -1, 0, 0)))
    # remap faces in (x,y,z) where 2D y -> 3D y ; already
    p = m.add(verts, faces, node, mat)
    for f, o in zip(p.faces, outs):
        _orient(f, o)
    p.smooth(35)
    if rot_y:
        p.rotate_y(rot_y)
    p.translate(*base)
    return p


# ------------------------------------------------------------- textiles
def cloth(m, c00, c10, c11, c01, nu=4, nv=3, sag=0.04, node=None, mat="tissu",
          up=(0, 1, 0)):
    """Toile tendue entre 4 coins (bilinéaire) avec flèche `sag` au centre (vers -Y)."""
    c00, c10, c11, c01 = V(c00), V(c10), V(c11), V(c01)
    verts, faces = [], []
    for j in range(nv + 1):
        for i in range(nu + 1):
            u, v = i / nu, j / nv
            p = c00 * (1 - u) * (1 - v) + c10 * u * (1 - v) + c11 * u * v + c01 * (1 - u) * v
            p.y -= sag * math.sin(math.pi * u) * math.sin(math.pi * v) * 1.0
            verts.append(p)
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            faces.append([a, a + 1, a + nu + 2, a + nu + 1])
    p = m.add(verts, faces, node, mat)
    upv = V(up)
    for f in p.faces:
        _orient(f, upv)
    p.smooth(60)
    return p


# ------------------------------------------------------------ végétal
def frond(m, base, yaw, pitch, length, width, droop=0.55, segs=5, fold=0.35,
          twist=0.0, serrate=0.0, node=None, mat=None):
    """Palme arquée : nervure en parabole + section en Λ, effilée aux deux bouts.

    yaw : direction (degrés, 0 = +Z) ; pitch : élévation initiale (degrés) ;
    droop : retombée de la pointe (fraction de la longueur).
    serrate : rétrécit une section sur deux -> silhouette dentelée (folioles).
    """
    b = V(base)
    yr, pr = math.radians(yaw), math.radians(pitch)
    d0 = Vector((math.cos(pr) * math.sin(yr), math.sin(pr), math.cos(pr) * math.cos(yr)))
    side = Vector((math.cos(yr), 0, -math.sin(yr)))
    verts, faces = [], []
    pts = []
    for i in range(segs + 1):
        t = i / segs
        p = b + d0 * (length * t) + Vector((0, -droop * length * t * t, 0))
        pts.append(p)
    for i in range(segs + 1):
        t = i / segs
        w = width * (math.sin(math.pi * min(1.0, 0.12 + 0.95 * t)) ** 0.8) if i < segs else 0.0
        if i == 0:
            w = width * 0.12
        elif i % 2 == 0 and i < segs:
            w *= 1.0 - serrate
        tw = math.radians(twist * t)
        s = side * math.cos(tw) + Vector((0, 1, 0)) * math.sin(tw)
        drop = Vector((0, -fold * w, 0))
        verts += [pts[i] - s * (w / 2) + drop, pts[i], pts[i] + s * (w / 2) + drop]
    for i in range(segs):
        a = i * 3
        if i == segs - 1:
            faces.append([a, a + 1, a + 4])
            faces.append([a + 1, a + 2, a + 4])
            faces.append([a, a + 4, a + 3])
            faces.append([a + 2, a + 5, a + 4])
        else:
            faces.append([a, a + 1, a + 4, a + 3])
            faces.append([a + 1, a + 2, a + 5, a + 4])
    p = m.add(verts, faces, node, mat)
    for f in p.faces:
        _orient(f, Vector((0, 1, 0)))
    p.smooth(70)
    return p


def ladder(m, base, height, width=0.16, lean=12.0, rot_y=0.0, rungs=5, r=0.012,
           node=None, mat=None):
    """Échelle de bois appuyée (lean = inclinaison en degrés, vers -Z local)."""
    hw = width / 2
    pieces = []
    top_z = -height * math.tan(math.radians(lean))
    for sx in (-hw, hw):
        pieces.append(tube(m, [(sx, 0, 0), (sx, height, top_z)], r, 4, smooth=60,
                           node=node, mat=mat))
    for k in range(rungs):
        t = (k + 0.7) / (rungs + 0.4)
        y, z = height * t, top_z * t
        pieces.append(tube(m, [(-hw - 0.01, y, z), (hw + 0.01, y, z)], r * 0.8, 4,
                           cap=(False, False), smooth=60, node=node, mat=mat))
    p = pieces[0]
    for q in pieces[1:]:
        p = p + q
    if rot_y:
        p.rotate_y(rot_y)
    p.translate(*base)
    return p


def parapet(m, x0, z0, x1, z1, y, h=0.12, t=0.06, horn=0.08, bevel=0.012, cell=0.55,
            node=None, mat=None):
    """Acrotère sur le pourtour d'un toit-terrasse, avec cornes d'angle (merlons).

    cell : les longs murets sont subdivisés pour que l'occlusion ne soit pas
    échantillonnée seulement à leurs extrémités (sous les cornes).
    """
    ps = []
    kw = dict(bevel=bevel, node=node, mat=mat, cell=cell, bottom=False)
    ps.append(boxmm(m, (x0, y, z1 - t), (x1, y + h, z1), **kw))
    ps.append(boxmm(m, (x0, y, z0), (x1, y + h, z0 + t), **kw))
    ps.append(boxmm(m, (x0, y, z0 + t), (x0 + t, y + h, z1 - t), **kw))
    ps.append(boxmm(m, (x1 - t, y, z0 + t), (x1, y + h, z1 - t), **kw))
    horns = []
    if horn > 0:
        s = t * 1.5
        for cx, cz in ((x0, z0), (x1, z0), (x0, z1), (x1, z1)):
            hx = cx + (s / 2 if cx == x0 else -s / 2)
            hz = cz + (s / 2 if cz == z0 else -s / 2)
            # merlon pyramidal tronqué
            horns.append(lathe(m, [(s * 0.72, 0), (s * 0.62, horn * 0.55), (s * 0.18, horn)],
                               4, (hx, y + h - 0.01, hz), smooth=10, rot0=45, node=node, mat=mat))
    p = ps[0]
    for q in ps[1:] + horns:
        p = p + q
    return p


for _name, _fn in list(globals().items()):
    if _name in ("box", "boxmm", "lathe", "cylinder", "cone", "dome", "sphere", "jar",
                 "tube", "beam", "log_end", "prism", "arch_wall", "cloth", "frond",
                 "ladder", "parapet"):
        setattr(Model, _name, _fn)
Model.horseshoe = staticmethod(horseshoe)
