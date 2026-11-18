"""Éléments d'architecture de terre réutilisables (portes, fenêtres, poutres, toits...).

Convention des ouvertures : on donne un point au PIED du mur, sur sa surface
extérieure (`at`), et l'orientation de la normale du mur `facing` en degrés
(0 = +Z façade, 90 = +X, 180 = -Z, 270 = -X). L'élément est construit en repère
local (mur dans le plan z = 0, extérieur vers +z) puis tourné et placé.
"""
import math

from .model import V


def _place(piece, at, facing):
    if facing:
        piece.rotate_y(facing)
    piece.translate(*at)
    return piece


def facade_point(cx, cz, w, d, facing, offset=0.0):
    """Point au pied du mur d'un bloc (centre cx,cz, dims w x d) pour une orientation.

    offset : décalage le long du mur (vers la droite quand on regarde le mur).
    """
    f = facing % 360
    if f == 0:
        return (cx + offset, 0, cz + d / 2)
    if f == 90:
        return (cx + w / 2, 0, cz - offset)
    if f == 180:
        return (cx - offset, 0, cz - d / 2)
    if f == 270:
        return (cx - w / 2, 0, cz + offset)
    raise ValueError("facing doit être 0, 90, 180 ou 270")


def earth_block(m, cx, cz, w, d, h, color="pise", plinth=0.11, plinth_color="pise_sombre",
                bevel=0.022, cell=0.52, roof_color="pise_clair", jitter=0.005,
                parapet_t=None, floor_cell=0.3):
    """Volume de pisé : soubassement débordant + corps + dessus (sol de terrasse).

    Le corps reçoit une variation par assise (bandes horizontales de banchée).
    parapet_t : si un acrotère d'épaisseur t sera posé (archi.roof), le dessus est
    remplacé par un sol de terrasse limité à l'intérieur de l'acrotère et maillé
    finement (floor_cell) : l'occlusion au pied de l'acrotère est alors correcte.
    Renvoie (corps, soubassement).
    """
    body = m.box((w, h, d), (cx, 0, cz), bevel=0 if parapet_t else bevel, cell=cell,
                 bottom=False, top=not parapet_t)
    if parapet_t:
        if bevel:
            body.bevel(bevel, angle=30)
        fl = m.box((w - 2 * parapet_t, 0.0, d - 2 * parapet_t), (cx, h, cz), cell=floor_cell,
                   skip=("+x", "-x", "+z", "-z", "-y"))
        fl.color(roof_color, var=0.02, face_var=0.01)
    rnd = m.rnd
    bands = {}

    def band_color(f):
        c = f.calc_center_median()
        if f.normal.y > 0.9 and c.y > h - 0.01:
            return (roof_color, 1.0 + rnd.uniform(-0.02, 0.02))
        k = int(c.y / 0.115)
        if k not in bands:
            bands[k] = 1.0 + rnd.uniform(-0.035, 0.035)
        return (color, bands[k])

    body.color_fn(band_color, var=0.004)
    if jitter:
        # irrégularité « fait main » : seuls les sommets intérieurs des faces bougent
        for v in body.verts():
            if 0.05 < v.co.y < h - 0.05:
                v.co.x += m.rnd.uniform(-jitter, jitter)
                v.co.z += m.rnd.uniform(-jitter, jitter)
        for f in body.faces:
            f.normal_update()
    pl = None
    if plinth:
        pl = m.box((w + 0.04, plinth, d + 0.04), (cx, 0, cz), bevel=0.015, bottom=False)
        pl.color(plinth_color, var=0.02)
    return body, pl


def door(m, at, facing=0, width=0.28, height=0.48, frame=0.05, frame_color="chaux",
         leaf_color="bois", lintel=True, step=True, knocker=True):
    """Porte de bois à planches dans un encadrement de chaux, linteau de palmier, seuil."""
    hw, d = width / 2, 0.035
    parts = []
    # encadrement de chaux (piédroits + linteau), saillie d
    fr = m.boxmm((-hw - frame, 0, -0.01), (-hw, height + frame, d), bevel=0.01, bottom=False)
    fr = fr + m.boxmm((hw, 0, -0.01), (hw + frame, height + frame, d), bevel=0.01, bottom=False)
    fr = fr + m.boxmm((-hw, height, -0.01), (hw, height + frame, d), skip=("-z", "-x", "+x"))
    fr.color(frame_color, var=0.02)
    parts.append(fr)
    # vantail : planches verticales légèrement en retrait
    n = 4
    pw = width / n
    for i in range(n):
        x0 = -hw + i * pw
        pl = m.boxmm((x0 + 0.003, 0.0, -0.01), (x0 + pw - 0.003, height, 0.012),
                     skip=("-z", "-y"))
        pl.color(leaf_color, var=0.06, shade=0.92 if i % 2 else 1.0)
        parts.append(pl)
    # traverses
    for y in (height * 0.22, height * 0.78):
        t = m.boxmm((-hw, y - 0.018, 0.010), (hw, y + 0.018, 0.022), skip=("-z", "-x", "+x"))
        t.color("bois_sombre", var=0.03)
        parts.append(t)
    if knocker:
        k = m.cylinder(0.018, 0.01, 6, (hw * 0.45, height * 0.5, 0.02))
        k.rotate("X", 90, pivot=(hw * 0.45, height * 0.5, 0.02)).color("cuivre", var=0.03)
        parts.append(k)
    if lintel:
        li = m.beam((-hw - frame - 0.06, height + frame + 0.022, 0.02),
                    (hw + frame + 0.06, height + frame + 0.022, 0.02), w=0.05, h=0.045)
        li.color("bois", var=0.05)
        parts.append(li)
    if step:
        st = m.boxmm((-hw - 0.04, 0, 0.0), (hw + 0.04, 0.035, 0.11), bevel=0.01)
        st.color("pierre", var=0.04)
        parts.append(st)
    p = parts[0]
    for q in parts[1:]:
        p = p + q
    p.no_cast()
    return _place(p, at, facing)


def window(m, at, facing=0, y=0.55, width=0.14, height=0.16, frame_color="chaux",
           grille=True, sill=True, day_color="boue_sombre", frame=0.035):
    """Petite fenêtre : baie `lumiere` (sombre le jour, émissive la nuit), grille, appui."""
    hw, hh = width / 2, height / 2
    parts = []
    f = frame
    fr = m.boxmm((-hw - f, y - hh - f, -0.01), (hw + f, y + hh + f, 0.02), bevel=0.008)
    fr.color(frame_color, var=0.02)
    parts.append(fr)
    with m.using(mat="lumiere"):
        gl = m.boxmm((-hw, y - hh, -0.01), (hw, y + hh, 0.026), skip=("-z", "-x", "+x", "-y", "+y"))
        gl.color(day_color, var=0.0, face_var=0.0, shade=0.6).no_ao()
    parts.append(gl)
    if grille:
        g = m.boxmm((-0.008, y - hh, 0.02), (0.008, y + hh, 0.034), skip=("-z", "-y", "+y"))
        g = g + m.boxmm((-hw, y - 0.008, 0.02), (hw, y + 0.008, 0.034), skip=("-z", "-x", "+x"))
        g.color("bois_sombre", var=0.03)
        parts.append(g)
    if sill:
        s = m.boxmm((-hw - f - 0.015, y - hh - f - 0.025, -0.01), (hw + f + 0.015, y - hh - f, 0.05),
                    skip=("-z",))
        s.color("bois", var=0.04)
        parts.append(s)
    p = parts[0]
    for q in parts[1:]:
        p = p + q
    p.no_cast()
    return _place(p, at, facing)


def beam_ends(m, at, facing, length_along, y, spacing=0.22, r=0.022, out=0.08,
              color="bois", margin=0.12):
    """Rangée de bouts de poutres de palmier dépassant d'un mur (le long de `length_along`)."""
    n = max(1, int((length_along - 2 * margin) / spacing) + 1)
    span = (n - 1) * spacing
    parts = []
    for i in range(n):
        x = -span / 2 + i * spacing
        p = m.log_end((x, y + m.rnd.uniform(-0.006, 0.006), -0.01), (0, -0.05 * m.rnd.random(), 1),
                      r=r * m.rnd.uniform(0.85, 1.1), length=out + m.rnd.uniform(-0.015, 0.015),
                      sides=5)
        p.color_fn(lambda f: ("bois_sombre", 1.0) if f.normal.z > 0.9 else ("bois", 1.0))
        parts.append(p)
    p = parts[0]
    for q in parts[1:]:
        p = p + q
    p.no_cast()
    return _place(p, at, facing)


def spout(m, at, facing, y, length=0.10):
    """Gargouille (demi-tronc de palmier) pour l'évacuation du toit."""
    p = m.boxmm((-0.025, y - 0.03, -0.01), (0.025, y, length), skip=("-z",))
    p.color("bois", var=0.05)
    return _place(p, at, facing)


def roof(m, x0, z0, x1, z1, y, h=0.12, t=0.06, horn=0.075, color="pise", horn_color="pise_clair"):
    """Acrotère + cornes d'angle sur un toit-terrasse (le sol est le dessus du bloc)."""
    p = m.parapet(x0, z0, x1, z1, y, h=h, t=t, horn=horn)
    p.color_fn(lambda f: (horn_color, 1.0) if f.calc_center_median().y > y + h + 0.004
               else (color, 1.04 if f.normal.y > 0.9 else 1.0), var=0.02)
    return p


def rug(m, x, z, w, d, y=0.0, colors=("garance", "indigo", "safran", "ecru"), stripes=7,
        rot_y=0.0, thick=0.012):
    """Tapis rayé posé à plat (bandes transversales colorées)."""
    parts = []
    for i in range(stripes):
        z0 = -d / 2 + d * i / stripes
        z1 = -d / 2 + d * (i + 1) / stripes
        s = m.boxmm((-w / 2, 0, z0), (w / 2, thick, z1), bottom=False)
        s.color(colors[i % len(colors)] if i % 2 == 0 else colors[1 + (i // 2) % (len(colors) - 1)],
                var=0.03)
        parts.append(s)
    p = parts[0]
    for q in parts[1:]:
        p = p + q
    if rot_y:
        p.rotate_y(rot_y)
    return p.translate(x, y, z)


def basket(m, x, z, r=0.07, h=0.06, y=0.0, fill="datte", seg=8):
    """Panier de vannerie rempli (dattes par défaut)."""
    b = m.lathe([(r * 0.8, 0), (r * 1.04, h), (r * 0.86, h)], seg, (x, y, z), smooth=50)
    b.color_fn(lambda f: ("pise_clair", 1.0 + 0.06 * math.sin(f.calc_center_median().y * 120)),
               var=0.02)
    top = m.dome(r * 0.86, seg, 2, (x, y + h * 0.75, z), height=h * 0.5)
    top.color(fill, var=0.05, face_var=0.08)
    return b + top


def tower(m, cx, cz, size, h, taper=0.12, color="pise", parapet_h=0.12, horn=0.09,
          bevel=0.022, cell=0.45, plinth=0.1):
    """Tour carrée à fruit (murs inclinés), terrasse à acrotère et cornes d'angle."""
    body = m.box((size, h, size), (cx, 0, cz), cell=cell, bottom=False, top=False)
    body.bevel(bevel)
    rnd = m.rnd
    bands = {}

    def band(f):
        k = int(f.calc_center_median().y / 0.12)
        bands.setdefault(k, 1.0 + rnd.uniform(-0.035, 0.035))
        return (color, bands[k])

    body.color_fn(band, var=0.004)
    body.taper(taper, cx, cz, 0, h)
    top = size * (1 - taper)
    t = 0.06
    fl = m.box((top - 2 * t, 0.0, top - 2 * t), (cx, h, cz), skip=("+x", "-x", "+z", "-z", "-y"),
               cell=0.3)
    fl.color("pise_clair", var=0.02)
    roof(m, cx - top / 2, cz - top / 2, cx + top / 2, cz + top / 2, h, h=parapet_h, t=t, horn=horn,
         color=color)
    if plinth:
        pl = m.box((size + 0.04, plinth, size + 0.04), (cx, 0, cz), bevel=0.015, bottom=False)
        pl.taper(taper * plinth / h, cx, cz, 0, plinth)
        pl.color("pise_sombre", var=0.02)
    return body


def arcade(m, a, b, height, thick=0.08, bays=3, pier=0.11, spring=0.30, horse_deg=24.0,
           n=10, color="chaux", intrados="chaux_ombre"):
    """Galerie d'arcs outrepassés de a à b (points au sol), face avant à DROITE du trajet a->b.

    (ex. a=(x,0,-1) -> b=(x,0,+1) : la face avant regarde vers -X.)
    Renvoie la Piece de toutes les arches.
    """
    a, b = V(a), V(b)
    d = b - a
    L = d.length
    bay = L / bays
    yaw = math.degrees(math.atan2(d.x, d.z)) - 90.0  # local +x -> direction a->b
    parts = []
    for i in range(bays):
        p = m.arch_wall(bay, height, thick, bay - pier, spring, horse_deg=horse_deg, n=n)
        p.translate(-L / 2 + bay * (i + 0.5), 0, 0)
        parts.append(p)
    p = parts[0]
    for q in parts[1:]:
        p = p + q

    def col(f):
        nrm = f.normal
        if abs(nrm.z) < 0.5 and f.calc_center_median().y < height - 0.01 and abs(nrm.y) < 0.99:
            return (intrados, 1.0)  # intrados et piédroits
        return (color, 1.0)

    p.color_fn(col, var=0.012)
    p.rotate_y(yaw)
    mid = (a + b) / 2
    p.translate(mid.x, mid.y, mid.z)
    return p


def lantern(m, pos, scale=1.0, hang=0.0):
    """Lanterne de cuivre (corps vitré `lumiere`). pos = point bas ; hang>0 : chaîne au-dessus."""
    x, y, z = pos
    s = scale
    base = m.lathe([(0.022 * s, 0), (0.03 * s, 0.012 * s)], 6, (x, y, z), smooth=40)
    base.color("cuivre", var=0.04)
    with m.using(mat="lumiere"):
        glass = m.lathe([(0.026 * s, 0.012 * s), (0.032 * s, 0.045 * s), (0.024 * s, 0.07 * s)], 6,
                        (x, y, z), smooth=40, cap=False)
        glass.color("lumiere", var=0.0, face_var=0.0).no_ao()
    cap = m.lathe([(0.034 * s, 0.07 * s), (0.012 * s, 0.098 * s), (0.0, 0.11 * s)], 6, (x, y, z),
                  smooth=40, cap=False)
    cap.color("cuivre", var=0.04, shade=0.9)
    p = base + glass + cap
    if hang > 0:
        ch = m.tube([(x, y + 0.11 * s, z), (x, y + 0.11 * s + hang, z)], 0.004, 3,
                    cap=(False, False))
        ch.color("bois_sombre", var=0.02)
        p = p + ch
    return p.no_cast()


def awning(m, x0, z0, x1, z1, y_front, y_back, colors=("safran", "ecru"), stripes=6,
           poles=True, sag=0.025, pole_color="bois"):
    """Auvent de toile `tissu` rayé tendu sur 4 perches (avant = côté z1)."""
    c00, c10 = (x0, y_back, z0), (x1, y_back, z0)
    c11, c01 = (x1, y_front, z1), (x0, y_front, z1)
    cl = m.cloth(c00, c10, c11, c01, nu=stripes, nv=2, sag=sag)
    cl.color_fn(lambda f: colors[int((f.calc_center_median().x - x0) / (x1 - x0) * stripes)
                                 % len(colors)], var=0.03)
    if poles:
        for (x, z, y) in ((x0, z0, y_back), (x1, z0, y_back), (x0, z1, y_front), (x1, z1, y_front)):
            pl = m.tube([(x, 0, z), (x, y + 0.02, z)], 0.012, 4, cap=(False, True), smooth=60)
            pl.color(pole_color, var=0.05)
    return cl


def water(m, poly, y, node="eau"):
    """Plan d'eau horizontal (polygone [(x, z), ...]) dans le nœud `eau`.

    L'origine du nœud est placée au niveau de l'eau (0, y, 0) : le moteur fait
    varier la hauteur de l'eau en déplaçant ce nœud. Matériau `eau`, sans occlusion.
    Plusieurs appels ajoutent d'autres plans au même nœud (même origine : la 1re).
    """
    m.node(node, (0, y, 0))
    with m.using(node=node, mat="eau"):
        p = m.add([(x, y, z) for x, z in poly], [list(range(len(poly)))])
        for f in p.faces:
            f.normal_update()
            if f.normal.y < 0:
                f.normal_flip()
        p.color("eau", var=0.0, face_var=0.0).no_ao().no_cast()
    return p


def regular_poly(r, n, rot_deg=0.0, cx=0.0, cz=0.0):
    """Polygone régulier (rayon au sommet r) en [(x, z)], sens trigonométrique vu du dessus."""
    a0 = math.radians(rot_deg)
    return [(cx + r * math.sin(a0 + 2 * math.pi * i / n), cz + r * math.cos(a0 + 2 * math.pi * i / n))
            for i in range(n)]


def barrel_vault(m, half_w, thick, z0, z1, y0, hfac=1.0, n=10, cx=0.0, inner_color="pierre_sombre",
                 outer_color="chaux", back=True):
    """Voûte en berceau d'axe Z (de z0 à z1, ouverte en z1), posée à y0 sur des murs en ±half_w.

    hfac < 1 : voûte surbaissée (ellipse). L'intérieur (vu par l'ouverture) est sombre.
    """
    from mathutils import Vector
    R, r = half_w, half_w - thick
    outer = [(R * math.cos(math.pi * i / n), y0 + R * math.sin(math.pi * i / n) * hfac) for i in range(n + 1)]
    inner = [(r * math.cos(math.pi * i / n), y0 + r * math.sin(math.pi * i / n) * hfac) for i in range(n + 1)]
    verts, faces, outs = [], [], []

    def v(p, z):
        verts.append((cx + p[0], p[1], z))
        return len(verts) - 1

    oz0 = [v(p, z0) for p in outer]
    oz1 = [v(p, z1) for p in outer]
    iz0 = [v(p, z0) for p in inner]
    iz1 = [v(p, z1) for p in inner]
    for i in range(n):
        th = math.pi * (i + 0.5) / n
        rad = Vector((math.cos(th), math.sin(th), 0))
        faces.append([oz0[i], oz0[i + 1], oz1[i + 1], oz1[i]]); outs.append(rad)
        faces.append([iz0[i], iz1[i], iz1[i + 1], iz0[i + 1]]); outs.append(-rad)
        faces.append([oz1[i], oz1[i + 1], iz1[i + 1], iz1[i]]); outs.append(Vector((0, 0, 1)))
    if back:
        faces.append(list(oz0)); outs.append(Vector((0, 0, -1)))
        faces.append(list(iz0)); outs.append(Vector((0, 0, 1)))
    p = m.add(verts, faces)
    roles = []
    for f, o in zip(p.faces, outs):
        f.normal_update()
        if f.normal.dot(o) < 0:
            f.normal_flip()
    p.smooth(25)

    def col(f):
        c = f.calc_center_median()
        if f.normal.z > 0.9 and abs(c.z - z1) < 1e-4:
            return (outer_color, 0.95)   # tranche de l'arc
        rr = math.hypot(c.x - cx, (c.y - y0) / max(hfac, 1e-3))
        if rr < (R + r) / 2 or (f.normal.z > 0.9 and c.z < z1 - 1e-4):
            return (inner_color, 0.55)   # intrados et fond, dans l'ombre
        return (outer_color, 1.0)

    p.color_fn(col, var=0.015)
    return p
