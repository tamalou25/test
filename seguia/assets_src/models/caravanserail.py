"""caravanserail — la pièce maîtresse : enceinte carrée à cour (emprise 3x3).

Porche à arc outrepassé côté +Z, tours d'angle basses à fruit, chambres en
couronne sous toit-terrasse, galerie à arcades sur trois côtés de la cour,
auvents `tissu`, lanternes `lumiere`, puits et marchandises dans la cour.
Budget 8 000 triangles. Un seul nœud (aucune partie animée).
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize, V
from lib import archi

NAME = "caravanserail"
FOOTPRINT = (3, 3)
BUDGET = 8000

PARAMS = dict(
    S=1.30,           # demi-côté extérieur de l'enceinte
    T=0.14,           # épaisseur du mur d'enceinte
    wall_h=0.98,      # hauteur du mur d'enceinte (dépasse du toit : acrotère)
    room_in=0.88,     # demi-côté intérieur des chambres (bord de la galerie)
    roof_y=0.72,      # toit-terrasse des chambres et de la galerie
    arc_line=0.71,    # plan des arcades
    tower=0.44, tower_h=1.30, tower_c=1.16,
    porch_w=0.84, porch_d=0.30, porch_h=1.34, porch_out=0.07,
    gate_w=0.38, gate_spring=0.44, passage=0.21,
)


# ------------------------------------------------------------------ enceinte
def enceinte(m, P):
    S, T, h = P["S"], P["T"], P["wall_h"]
    tc, ts = P["tower_c"], P["tower"]
    inner = tc - ts / 2 + 0.02      # les murs s'arrêtent dans les tours
    pw = P["porch_w"] / 2
    segs = [  # (x0, z0, x1, z1)
        (-inner, -S, inner, -S + T),            # arrière
        (-S, -inner, -S + T, inner),            # gauche (-X)
        (S - T, -inner, S, inner),              # droite (+X)
        (-inner, S - T, -pw + 0.02, S),         # avant gauche
        (pw - 0.02, S - T, inner, S),           # avant droite
    ]
    for (x0, z0, x1, z1) in segs:
        w = m.boxmm((x0, 0, z0), (x1, h, z1), bevel=0.02, cell=0.5, bottom=False)
        rnd = m.rnd
        bands = {}

        def band(f):
            c = f.calc_center_median()
            if f.normal.y > 0.9:
                return ("pise", 1.04)
            k = int(c.y / 0.12)
            bands.setdefault(k, 1.0 + rnd.uniform(-0.035, 0.035))
            return ("pise", bands[k])

        w.color_fn(band, var=0.004)
        pl = m.boxmm((x0 - 0.02, 0, z0 - 0.02), (x1 + 0.02, 0.09, z1 + 0.02), bevel=0.012,
                     bottom=False)
        pl.color("pise_sombre", var=0.02)
    # merlons pyramidaux le long du sommet des murs
    for (x0, z0, x1, z1) in segs:
        along_x = (x1 - x0) > (z1 - z0)
        L = (x1 - x0) if along_x else (z1 - z0)
        n = max(1, int(L / 0.24))
        for i in range(n):
            t = (i + 0.5) / n
            x = x0 + (x1 - x0) * t if along_x else (x0 + x1) / 2
            z = (z0 + z1) / 2 if along_x else z0 + (z1 - z0) * t
            mer = m.lathe([(0.05, 0), (0.0, 0.085)], 4, (x, h, z), rot0=45, cap=False, smooth=10)
            mer.color("pise_clair", var=0.03)
    # tours d'angle
    for sx in (-1, 1):
        for sz in (-1, 1):
            archi.tower(m, sx * tc, sz * tc, ts, P["tower_h"], taper=0.10)


def facades_exterieures(m, P):
    """Poutres, meurtrières `lumiere`, gargouilles sur les quatre faces extérieures."""
    S, ry = P["S"], P["roof_y"]
    span = 2 * (P["tower_c"] - P["tower"] / 2)
    for facing in (90, 180, 270):
        at = archi.facade_point(0, 0, 2 * S, 2 * S, facing)
        archi.beam_ends(m, at, facing, span, ry - 0.07, spacing=0.30, margin=0.10)
        for off in (-0.45, 0.45):
            archi.window(m, archi.facade_point(0, 0, 2 * S, 2 * S, facing, off), facing,
                         y=0.52, width=0.05, height=0.16, grille=False, sill=False,
                         frame_color="pise_sombre", frame=0.018)
        archi.spout(m, archi.facade_point(0, 0, 2 * S, 2 * S, facing, 0.2), facing, ry + 0.03)
    # façade avant : poutres de part et d'autre du porche
    for sx in (-1, 1):
        at = (sx * 0.64, 0, S)
        archi.beam_ends(m, at, 0, 0.5, ry - 0.07, spacing=0.30, margin=0.08)
        archi.window(m, (sx * 0.70, 0, S), 0, y=0.52, width=0.05, height=0.16, grille=False,
                     sill=False, frame_color="pise_sombre", frame=0.018)


# -------------------------------------------------------------------- porche
def porche(m, P):
    S = P["S"]
    w, d, h = P["porch_w"], P["porch_d"], P["porch_h"]
    zc = S + P["porch_out"] - d / 2
    gate = m.arch_wall(w, h, d, P["gate_w"], P["gate_spring"], horse_deg=24, n=14)
    gate.translate(0, 0, zc)

    def col(f):
        c = f.calc_center_median()
        n = f.normal
        if abs(n.z) < 0.5 and abs(n.y) < 0.99 and abs(c.x) < P["gate_w"] / 2 + 0.06:
            return ("chaux", 1.0)  # intrados blanchi
        if n.y > 0.9:
            return ("pise", 1.05)
        return ("pise", 1.0 + 0.03 * math.sin(c.y * 40))

    gate.color_fn(col, var=0.006)
    pl = m.boxmm((-w / 2 - 0.02, 0, zc - d / 2), (w / 2 + 0.02, 0.09, zc + d / 2 + 0.02), bevel=0.012,
                 bottom=False)
    pl.delete_faces(lambda f: abs(f.calc_center_median().x) < P["gate_w"] / 2 + 0.01)
    pl.color("pise_sombre", var=0.02)
    # alfiz : cadre de chaux autour de l'arc
    _, top = m.horseshoe(P["gate_w"], P["gate_spring"], 24, 14)
    zf = zc + d / 2
    fx, fy = P["gate_w"] / 2 + 0.11, top + 0.07
    t = 0.035
    fr = m.boxmm((-fx, 0.09, zf - 0.005), (-fx + t, fy, zf + 0.015), skip=("-z",))
    fr = fr + m.boxmm((fx - t, 0.09, zf - 0.005), (fx, fy, zf + 0.015), skip=("-z",))
    fr = fr + m.boxmm((-fx, fy - t, zf - 0.005), (fx, fy, zf + 0.015), skip=("-z",))
    fr.color("chaux", var=0.02).no_cast()
    # frise de niches triangulaires sombres au-dessus de l'arc
    for i in range(5):
        x = -0.24 + i * 0.12
        y0 = fy + 0.07
        nic = m.add([(x - 0.035, y0, zf + 0.004), (x + 0.035, y0, zf + 0.004), (x, y0 + 0.07, zf + 0.004)],
                    [[0, 1, 2]])
        nic.color("boue_sombre", var=0.03).no_ao()
    # petite fenêtre haute `lumiere`
    archi.window(m, (0, 0, zf), 0, y=h - 0.26, width=0.09, height=0.10)
    # couronnement : acrotère + cornes
    archi.roof(m, -w / 2, zc - d / 2, w / 2, zc + d / 2, h, h=0.12, t=0.06, horn=0.10)
    fl = m.box((w - 0.12, 0, d - 0.12), (0, h, zc), skip=("+x", "-x", "+z", "-z", "-y"))
    fl.color("pise_clair", var=0.02)
    # vantaux ouverts vers l'intérieur
    for sx in (-1, 1):
        lw = P["gate_w"] / 2 - 0.01
        leaf = m.boxmm((0, 0.0, 0), (lw, P["gate_spring"] + 0.08, 0.025))
        leaf.color_fn(lambda f: ("bois", 1.0 + 0.08 * math.sin(f.calc_center_median().x * 160)),
                      var=0.03)
        if sx < 0:
            leaf.scale(-1, 1, 1)
        leaf.rotate_y(sx * 80).translate(sx * (P["gate_w"] / 2), 0, zc - d / 2 - 0.005)
    # lanternes de part et d'autre du porche (potences sur le mur d'enceinte)
    for sx in (-1, 1):
        x = sx * (w / 2 + 0.085)
        br = m.beam((x, 0.66, S - 0.01), (x, 0.66, S + 0.08), w=0.02, h=0.02)
        br.color("bois_sombre", var=0.03)
        archi.lantern(m, (x, 0.50, S + 0.065), scale=1.0, hang=0.04)


# ---------------------------------------------------------- chambres + galerie
def chambres(m, P):
    S, T, ry, ri = P["S"], P["T"], P["roof_y"], P["room_in"]
    wi = S - T  # face intérieure du mur d'enceinte
    pa = P["passage"]
    blocks = [
        (-wi, -wi, wi, -ri),        # arrière
        (-wi, -ri, -ri, wi),        # gauche
        (ri, -ri, wi, wi),          # droite
        (-ri, ri, -pa, wi),         # avant gauche du passage
        (pa, ri, ri, wi),           # avant droite
    ]
    for (x0, z0, x1, z1) in blocks:
        b = m.boxmm((x0, 0, z0), (x1, ry, z1), cell=0.4, bottom=False, bevel=0.0)
        b.color_fn(lambda f: ("pise_clair", 1.0) if f.normal.y > 0.9 else ("pise", 1.02), var=0.01)
    # portes des chambres (sombres) sous la galerie
    al = P["arc_line"]
    for facing, offs in ((90, (-0.35, 0.05, 0.45)), (270, (-0.45, -0.05, 0.35)), (0, (-0.35, 0.35))):
        for o in offs:
            if facing == 0:
                at = (o, 0, -ri)
            elif facing == 90:
                at = (-ri, 0, -o)
            else:
                at = (ri, 0, o)
            d = m.boxmm((-0.075, 0, -0.005), (0.075, 0.30, 0.012), skip=("-z", "-y"))
            d.color("bois_sombre", var=0.06)
            fr = m.boxmm((-0.10, 0.30, -0.005), (0.10, 0.34, 0.02), skip=("-z",))
            fr.color("bois", var=0.04)
            (d + fr).no_cast().rotate_y(facing).translate(*at)
    # passage d'entrée : sol de pierre
    pv = m.boxmm((-pa, 0, ri), (pa, 0.012, S + P["porch_out"] - 0.02), cell=0.3,
                 skip=("-y", "+z", "-z"))
    pv.color("pierre", var=0.03, face_var=0.04)


def galerie(m, P):
    al, ri, ry = P["arc_line"], P["room_in"], P["roof_y"]
    ah = ry - 0.05
    th = 0.08
    archi.arcade(m, (al, 0, -al), (al, 0, ri), ah, th, bays=3, spring=0.28)      # droite
    archi.arcade(m, (-al, 0, ri), (-al, 0, -al), ah, th, bays=3, spring=0.28)    # gauche
    archi.arcade(m, (-al, 0, -al), (al, 0, -al), ah, th, bays=3, spring=0.26)    # arrière
    # piliers d'angle
    for sx in (-1, 1):
        p = m.box((0.12, ah, 0.12), (sx * al, 0, -al), bevel=0.012, bottom=False)
        p.color("chaux", var=0.01)
    # toit de la galerie (dalle) + rive de chaux côté cour
    slabs = [(al - th / 2, -ri, ri, ri),
             (-ri, -ri, -al + th / 2, ri),
             (-al + th / 2, -ri, al - th / 2, -al + th / 2)]
    for (x0, z0, x1, z1) in slabs:
        s = m.boxmm((x0, ah, z0), (x1, ry, z1), cell=0.35, skip=("-y",))
        s.color_fn(lambda f: ("pise_clair", 1.0) if f.normal.y > 0.9 else ("chaux_ombre", 1.0),
                   var=0.01)
    # muret d'acrotère côté cour
    for (a, b) in (((al, -al), (al, ri)), ((-al, -al), (-al, ri)), ((-al, -al), (al, -al))):
        x0, x1 = sorted((a[0], b[0]))
        z0, z1 = sorted((a[1], b[1]))
        lip = m.boxmm((x0 - th / 2, ry, z0 - th / 2), (x1 + th / 2, ry + 0.06, z1 + th / 2),
                      bevel=0.008, cell=0.5, bottom=False)
        lip.color("chaux", var=0.015)
    # lanternes suspendues sous les arcades (une par côté)
    for pos in ((al - 0.10, 0.40, 0.09), (-al + 0.10, 0.40, -0.09), (0.0, 0.40, -al + 0.10)):
        archi.lantern(m, pos, scale=0.9, hang=ah - 0.40 - 0.10)


# ------------------------------------------------------------------------ cour
def cour(m, P):
    ri, al = P["room_in"], P["arc_line"]
    fl = m.boxmm((-ri, 0, -ri), (ri, 0.008, ri), cell=0.26, skip=("-y", "+x", "-x", "+z", "-z"))
    fl.color("pise_clair", var=0.02, face_var=0.03)
    # puits central : margelle, potence, poulie, seau
    well = m.lathe([(0.11, 0), (0.12, 0.10), (0.105, 0.12), (0.08, 0.12), (0.08, 0.04)], 10,
                   (0.05, 0, 0.05), smooth=40, cap=True)
    well.color("pierre", var=0.03, face_var=0.04)
    for sx in (-1, 1):
        post = m.box((0.028, 0.30, 0.028), (0.05 + sx * 0.10, 0.10, 0.05), skip=("-y",))
        post.color("bois", var=0.04)
    bar = m.beam((-0.07, 0.38, 0.05), (0.17, 0.38, 0.05), w=0.03, h=0.03)
    bar.color("bois_sombre", var=0.03)
    pul = m.cylinder(0.03, 0.02, 6, (0.05, 0.36, 0.04))
    pul.rotate("Z", 90, pivot=(0.05, 0.37, 0.05)).color("bois_sombre")
    bucket = m.lathe([(0.025, 0), (0.032, 0.045)], 6, (0.17, 0.12, 0.05), cap=False)
    bucket.color("cuivre", var=0.04)
    # auvents (marchands) dans deux angles de la cour
    archi.awning(m, -0.52, -0.52, -0.14, -0.22, 0.32, 0.40, colors=("safran", "ecru"), stripes=6)
    archi.awning(m, 0.18, 0.22, 0.54, 0.54, 0.30, 0.38, colors=("indigo", "ecru"), stripes=6)
    # étals sous les auvents
    archi.rug(m, -0.30, -0.33, 0.30, 0.22, colors=("garance", "safran", "indigo", "ecru"), stripes=5)
    archi.basket(m, -0.38, -0.30, r=0.05, h=0.05, y=0.012)
    archi.basket(m, -0.24, -0.38, r=0.045, h=0.045, y=0.012, fill="datte_claire")
    archi.rug(m, 0.36, 0.38, 0.28, 0.22, colors=("indigo", "garance", "ecru", "safran"), stripes=5,
              rot_y=90)
    for i, (x, z) in enumerate(((0.26, 0.32), (0.44, 0.30), (0.33, 0.46))):
        m.jar(0.15 - 0.02 * i, 0.055, 8, (x, 0.012, z)).color(("pise_sombre", "pise", "roche")[i],
                                                              var=0.05)
    # sacs et ballots près de l'entrée
    for (x, z, c) in ((-0.58, 0.60, "ecru"), (-0.46, 0.68, "indigo"), (-0.60, 0.45, "ecru")):
        sack = m.sphere(1.0, 6, 3).scale(0.07, 0.06, 0.08).translate(x, 0.06, z)
        sack.color(c, var=0.05)
    crate = m.box((0.14, 0.10, 0.12), (0.58, 0, 0.62), bevel=0.01, bottom=False, rot_y=15)
    crate.color("bois", var=0.05)
    # auge près du porche
    trough = m.box((0.32, 0.08, 0.10), (0.40, 0, -0.52), bevel=0.012, bottom=False)
    trough.color("pierre", var=0.03)
    # jarres au pied des arcades
    for (x, z) in ((-0.62, -0.30), (-0.62, -0.18), (0.62, 0.25)):
        m.jar(0.17, 0.06, 8, (x, 0.0, z)).color("pise_sombre", var=0.05)


def toits(m, P):
    """Quelques objets sur la terrasse : tapis à sécher, jarres."""
    ry = P["roof_y"]
    archi.rug(m, -1.02, -0.30, 0.20, 0.46, y=ry, stripes=5)
    archi.rug(m, 0.20, -1.02, 0.44, 0.18, y=ry, colors=("indigo", "safran", "ecru", "garance"),
              stripes=5)
    archi.basket(m, 1.02, 0.10, r=0.06, h=0.05, y=ry)


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    enceinte(m, P)
    facades_exterieures(m, P)
    porche(m, P)
    chambres(m, P)
    galerie(m, P)
    cour(m, P)
    toits(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.45, strength=0.8))
