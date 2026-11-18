"""hammam — bains de terre crue (emprise 3x2).

Deux corps bas en pisé à toit-terrasse : la salle chaude (à gauche, -X) sous une
grande coupole, la salle tiède (à droite) sous une coupole plus petite. Les coupoles
sont enduites de chaux et percées d'oculi de verre (`lumiere`). Un portail à arc
outrepassé, cadré de chaux et fermé d'un rideau indigo (`tissu`), ouvre la façade
+Z. Devant, un parvis dallé et un petit bassin d'ablutions (nœud `eau`) alimenté par
un bec de cuivre. À droite, la chaufferie : foyer rougeoyant (`lumiere`), bois de
palmier et haute cheminée noircie. Linge (`tissu`) qui sèche sur une corde.

Nœuds : `hammam` (racine) et `eau` (plan d'eau du bassin, origine au niveau de l'eau).
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize, V
from lib import archi
from lib.palette import mix_srgb
from mathutils import Vector
from _communs_batiments import merge, bands, flip_up, disc, sack

NAME = "hammam"
FOOTPRINT = (3, 2)
BUDGET = 4000

VERRE = mix_srgb("ecru", "turquoise", 0.40)   # teinte de jour des oculi

PARAMS = dict(
    A=(-1.25, -0.80, -0.05, 0.22, 0.60),      # salle chaude : x0, z0, x1, z1, hauteur
    B=(-0.05, -0.70, 1.02, 0.30, 0.50),       # salle tiède + entrée
    C=(1.02, -0.66, 1.36, -0.12, 0.36),       # chaufferie
    domeA=(-0.65, -0.29, 0.40, 0.36), domeB=(0.47, -0.20, 0.31, 0.29),   # cx, cz, r, h
    door_x=0.47, basin=(-0.98, 0.42, -0.32, 0.84), water_y=0.085,
    chimney=(1.20, -0.50),
)


# ------------------------------------------------------------------ corps de pisé
def corps(m, P):
    for key in ("A", "B", "C"):
        x0, z0, x1, z1, h = P[key]
        cx, cz, w, d = (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0
        archi.earth_block(m, cx, cz, w, d, h, parapet_t=0.05, cell=0.45, plinth=0.09)
        archi.roof(m, x0, z0, x1, z1, h, h=0.08, t=0.05, horn=0.07 if key != "C" else 0.0)


def coupole(m, cx, cz, r, h, y0, n_oc, seg=14):
    """Tambour octogonal + coupole de chaux + oculi + épi de cuivre."""
    drum = m.lathe([(r + 0.04, 0.0), (r + 0.04, 0.07), (r + 0.01, 0.075)], 8, (cx, y0, cz), smooth=10,
                   cap=False, rot0=22.5)
    drum.color_fn(lambda f: ("chaux_ombre", 1.0) if f.normal.y < 0.5 else ("chaux", 0.97), var=0.015)
    yb = y0 + 0.07
    prof = []
    rings = 5
    for i in range(rings + 1):
        t = i / rings * math.pi / 2
        prof.append((r * math.cos(t), h * math.sin(t)))
    prof[-1] = (0.0, h + 0.02)
    dome = m.lathe(prof, seg, (cx, yb, cz), smooth=50, cap=False)
    dome.color_vertex_fn(lambda p, f: mix_srgb("chaux_ombre", "chaux", min(1.0, (p.y - yb) / (h * 0.6))))
    # épi (finial) de cuivre
    fin = m.lathe([(0.03, 0.0), (0.035, 0.03), (0.0, 0.10)], 6, (cx, yb + h + 0.005, cz), smooth=50, cap=False)
    fin.color("cuivre", var=0.03)
    ball = m.sphere(0.022, 6, 3, (cx, yb + h + 0.06, cz))
    ball.color("cuivre", var=0.03, shade=1.1)
    # oculi : deux couronnes décalées
    crowns = ((40.0, n_oc, 0.0), (66.0, max(3, n_oc - 2), 180.0 / n_oc))
    for el, n, a0 in crowns:
        for k in range(n):
            az = math.radians(a0 + 360.0 * k / n + 15)
            t = math.radians(el)
            p = V(cx + r * math.cos(t) * math.sin(az), yb + h * math.sin(t), cz + r * math.cos(t) * math.cos(az))
            nrm = Vector((math.cos(t) * math.sin(az) / r, math.sin(t) / h, math.cos(t) * math.cos(az) / r)).normalized()
            oculus(m, p, nrm, 0.030 if el < 50 else 0.026)


def oculus(m, pos, nrm, s):
    rot = Vector((0, 1, 0)).rotation_difference(nrm).to_matrix()
    collar = m.lathe([(s * 1.15, -0.012), (s * 1.1, 0.008), (s * 0.78, 0.012)], 6, (0, 0, 0), smooth=40, cap=False)
    collar.color("chaux_ombre", var=0.02, shade=0.97)
    with m.using(mat="lumiere"):
        glass = m.lathe([(s * 0.78, 0.012), (s * 0.45, 0.026), (0.0, 0.03)], 6, (0, 0, 0), smooth=60, cap=False)
        glass.color(VERRE, var=0.03, face_var=0.04).no_ao()
    p = (collar + glass)
    p.transform(rot)
    p.translate(*pos)
    p.no_cast()


def coupoles(m, P):
    cx, cz, r, h = P["domeA"]
    coupole(m, cx, cz, r, h, P["A"][4], 6)
    cx, cz, r, h = P["domeB"]
    coupole(m, cx, cz, r, h, P["B"][4], 5, seg=12)


# ------------------------------------------------------------------ façade et portail
def portail(m, P):
    x = P["door_x"]
    zf = P["B"][3]
    W, H, T = 0.50, 0.80, 0.10
    ow, sp = 0.27, 0.40
    a = m.arch_wall(W, H, T, ow, sp, horse_deg=22, n=12)
    a.translate(x, 0, zf + T / 2 - 0.01)

    def col(f):
        c = f.calc_center_median()
        if abs(f.normal.z) < 0.5 and abs(f.normal.y) < 0.99 and abs(c.x - x) < ow / 2 + 0.03:
            return ("chaux_ombre", 1.0)
        if f.normal.y > 0.9:
            return ("pise_clair", 1.0)
        return ("pise", 1.0 + 0.03 * math.sin(c.y * 40))

    a.color_fn(col, var=0.006)
    pl = m.boxmm((x - W / 2 - 0.02, 0, zf - 0.01), (x + W / 2 + 0.02, 0.09, zf + T + 0.01), bottom=False)
    pl.delete_faces(lambda f: abs(f.calc_center_median().x - x) < ow / 2 + 0.005)
    pl.color("pise_sombre", var=0.02)
    # fond sombre et alfiz de chaux
    pts, top = m.horseshoe(ow, sp, 22, 12)
    back = m.add([(x + px, py, zf + 0.004) for px, py in pts], [list(range(len(pts)))])
    for f in back.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    back.color("#2a1c12", var=0.0).no_ao()
    zt = zf + T + 0.008 - 0.01
    fx, fy, t = ow / 2 + 0.08, top + 0.06, 0.03
    fr = m.boxmm((x - fx, 0.09, zt - 0.006), (x - fx + t, fy, zt + 0.01), skip=("-z",))
    fr = fr + m.boxmm((x + fx - t, 0.09, zt - 0.006), (x + fx, fy, zt + 0.01), skip=("-z",))
    fr = fr + m.boxmm((x - fx, fy - t, zt - 0.006), (x + fx, fy, zt + 0.01), skip=("-z",))
    fr.color("chaux", var=0.02).no_cast()
    # couronnement : merlons en dents de scie
    for i in range(4):
        mx = x - W / 2 + W * (i + 0.5) / 4
        mer = m.lathe([(0.05, 0), (0.0, 0.08)], 4, (mx, H, zf + T / 2 - 0.01), rot0=45, cap=False, smooth=10)
        mer.color("pise_clair", var=0.03)
    # rideau indigo rayé suspendu dans l'arc (relevé d'un côté)
    with m.using(mat="tissu"):
        cz = zf + 0.03
        cur = m.cloth((x - ow / 2 + 0.01, top - 0.02, cz), (x + ow / 2 - 0.01, top - 0.02, cz),
                      (x + ow / 2 - 0.01, 0.16, cz + 0.01), (x - ow / 2 + 0.06, 0.30, cz + 0.02), nu=3, nv=2,
                      sag=0.0, up=(0, 0, 1))
        cur.color_fn(lambda f: ("indigo", 1.0) if int((f.calc_center_median().x - x + 1) * 13.6) % 2 else
                     ("ecru", 0.96), var=0.03)
    rod = m.beam((x - ow / 2 - 0.02, top - 0.015, cz), (x + ow / 2 + 0.02, top - 0.015, cz), w=0.012, h=0.012)
    rod.color("bois_sombre", var=0.03)
    # lanterne de cuivre à droite du portail
    br = m.beam((x - 0.33, 0.46, zf - 0.01), (x - 0.33, 0.46, zf + 0.08), w=0.02, h=0.02)
    br.color("bois_sombre", var=0.03)
    archi.lantern(m, (x - 0.33, 0.31, zf + 0.065), scale=1.0, hang=0.04)


def facades(m, P):
    x0, z0, x1, z1, h = P["A"]
    # fenêtres hautes `lumiere` (claustras) sur la salle chaude et la salle tiède
    archi.window(m, (-0.95, 0, z1), 0, y=0.42, width=0.10, height=0.10, sill=False)
    archi.window(m, (x0, 0, -0.30), 270, y=0.40, width=0.10, height=0.10, sill=False)
    bx0, bz0, bx1, bz1, bh = P["B"]
    archi.window(m, (0.85, 0, bz1), 0, y=0.36, width=0.09, height=0.09, sill=False)
    # bouts de poutres
    archi.beam_ends(m, (-0.65, 0, z1), 0, x1 - x0 - 0.5, h - 0.07, spacing=0.30, margin=0.1)
    archi.beam_ends(m, (x0, 0, (z0 + z1) / 2), 270, z1 - z0, h - 0.07, spacing=0.30, margin=0.12)
    archi.beam_ends(m, (bx1, 0, (bz0 + bz1) / 2 + 0.25), 90, 0.40, bh - 0.07, spacing=0.30, margin=0.05)
    archi.spout(m, (x0, 0, 0.0), 270, h + 0.03)
    # banquette de terre le long de la façade de la salle tiède
    b = m.boxmm((0.02, 0, bz1), (P["door_x"] - 0.30, 0.11, bz1 + 0.13), bevel=0.015, bottom=False)
    b.color("pise_clair", var=0.03)


# ------------------------------------------------------------------ parvis et bassin
def parvis(m, P):
    zf = P["B"][3]
    z0 = P["A"][3]
    rnd = m.rnd
    pav = m.boxmm((-0.25, 0.0, zf), (0.95, 0.014, 0.90), cell=0.15, skip=("-y",))
    pav.color_fn(lambda f: (mix_srgb("pierre", "pise_clair", rnd.uniform(0.0, 0.45)), 1.0 + rnd.uniform(-0.05, 0.04))
                 if f.normal.y > 0.5 else ("pierre_sombre", 0.9), var=0.0)
    # bassin d'ablutions devant la salle chaude
    bx0, bz0, bx1, bz1 = P["basin"]
    t, hh = 0.06, 0.13
    walls = [(bx0, bz0, bx1, bz0 + t), (bx0, bz1 - t, bx1, bz1), (bx0, bz0 + t, bx0 + t, bz1 - t),
             (bx1 - t, bz0 + t, bx1, bz1 - t)]
    for (a, b, c, d) in walls:
        w = m.boxmm((a, 0, b), (c, hh, d), bevel=0.01, cell=0.3, bottom=False)
        w.color_fn(lambda f: ("pierre", 1.1) if f.normal.y > 0.9 else
                   ("pierre_sombre" if rnd.random() < 0.3 else "pierre", 1.0 + rnd.uniform(-0.06, 0.04)), var=0.0)
    fl = m.boxmm((bx0 + t, 0.0, bz0 + t), (bx1 - t, 0.02, bz1 - t), skip=("+x", "-x", "+z", "-z", "-y"))
    fl.color(mix_srgb("turquoise", "pierre_sombre", 0.5), var=0.02)
    archi.water(m, [(bx0 + t, bz0 + t), (bx1 - t, bz0 + t), (bx1 - t, bz1 - t), (bx0 + t, bz1 - t)],
                P["water_y"])
    # bec de cuivre sortant du mur et filet d'eau
    xb = (bx0 + bx1) / 2
    bec = m.tube([(xb, 0.30, z0 - 0.01), (xb, 0.30, z0 + 0.10), (xb, 0.27, z0 + 0.15)], 0.014, 5,
                 cap=(False, True), smooth=70)
    bec.color("cuivre", var=0.03)
    plate = m.box((0.10, 0.12, 0.012), (xb, 0.24, z0), bevel=0.003)
    plate.color("chaux", var=0.02)
    jet = m.tube([(xb, 0.265, z0 + 0.155), (xb, 0.18, z0 + 0.175), (xb, P["water_y"], z0 + 0.18)],
                 [0.007, 0.008, 0.011], 4, cap=(False, False), smooth=70)
    jet.color("eau", var=0.0, shade=1.2).no_ao().no_cast()
    # seaux, bols de cuivre, sabots de bois sur le parvis
    for (x, z) in ((-0.20, 0.70), (-0.12, 0.80)):
        bowl = m.lathe([(0.025, 0), (0.05, 0.035), (0.045, 0.035), (0.0, 0.01)], 7, (x, 0.0, z), cap=False)
        bowl.color("cuivre", var=0.04)
    for k, (x, z) in enumerate(((0.24, 0.48), (0.30, 0.47))):
        clog = m.box((0.035, 0.03, 0.075), (x, 0.014, z), bevel=0.006, bottom=False, rot_y=8 * k)
        clog.color("bois", var=0.05)
    m.jar(0.22, 0.075, 8, (-1.22, 0.0, 0.40)).color("pise_sombre", var=0.05)
    m.jar(0.16, 0.055, 7, (-1.16, 0.0, 0.62)).color("pise", var=0.05)


def linge(m, P):
    """Corde à linge tendue entre deux perches, serviettes (`tissu`)."""
    p0, p1 = V(0.98, 0.0, 0.86), V(1.36, 0.0, 0.40)
    hh = 0.46
    for p in (p0, p1):
        pole = m.tube([p, p + V(0, hh + 0.03, 0)], 0.012, 4, cap=(False, True))
        pole.color("bois", var=0.05)
    rope = m.tube([p0 + V(0, hh, 0), (p0 + p1) / 2 + V(0, hh - 0.03, 0), p1 + V(0, hh, 0)], 0.004, 3,
                  cap=(False, False))
    rope.color("pise_clair", var=0.02, shade=0.8).no_cast()
    cols = ("garance", "ecru", "indigo", "safran")
    with m.using(mat="tissu"):
        for i in range(4):
            t0, t1 = 0.08 + i * 0.22, 0.08 + i * 0.22 + 0.17
            a = p0.lerp(p1, t0) + V(0, hh - 0.03 * math.sin(math.pi * t0) - 0.005, 0)
            b = p0.lerp(p1, t1) + V(0, hh - 0.03 * math.sin(math.pi * t1) - 0.005, 0)
            drop = 0.20 - 0.03 * (i % 2)
            cl = m.cloth(a, b, b + V(0.01, -drop, 0.01), a + V(0.01, -drop, 0.01), nu=1, nv=2, sag=0.0,
                         up=(0.77, 0, 0.64))
            cl.color(cols[i], var=0.03)


# ------------------------------------------------------------------ chaufferie
def chaufferie(m, P):
    x0, z0, x1, z1, h = P["C"]
    chx, chz = P["chimney"]
    # cheminée : fût de pisé taluté, sommet noirci
    ch = m.box((0.18, 1.18, 0.18), (chx, 0, chz), cell=0.3, bottom=False, top=False)
    ch.taper(0.25, chx, chz, 0, 1.18)
    ch.color_vertex_fn(lambda p, f: mix_srgb("pise", "boue_sombre", max(0.0, min(0.85, (p.y - 0.75) / 0.45))))
    rim = m.lathe([(0.085, 1.18), (0.085, 1.22), (0.06, 1.22), (0.06, 1.12)], 4, (chx, 0, chz), rot0=45,
                  smooth=10, cap=False)
    rim.color_fn(lambda f: ("boue_sombre", 0.5 if f.normal.y > 0.5 else 0.65), var=0.03)
    # foyer : bouche voûtée rougeoyante sur la face +Z de la chaufferie
    xm = (x0 + x1) / 2
    pts, top = m.horseshoe(0.14, 0.07, 15, 8)
    with m.using(mat="lumiere"):
        fire = m.add([(xm + px, py, z1 + 0.004) for px, py in pts], [list(range(len(pts)))])
        for f in fire.faces:
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
        fire.color_vertex_fn(lambda p, f: mix_srgb("#E8692A", "#FFC56B", max(0.0, min(1.0, p.y / 0.15))))
        fire.no_ao().no_cast()
    soot = m.add([(xm - 0.10, 0.0, z1 + 0.002), (xm + 0.10, 0.0, z1 + 0.002), (xm + 0.07, top + 0.12, z1 + 0.002),
                  (xm - 0.07, top + 0.12, z1 + 0.002)], [[0, 1, 2, 3]])
    for f in soot.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    soot.color_vertex_fn(lambda p, f: mix_srgb("boue_sombre", "pise_sombre", min(1.0, p.y / (top + 0.12))))
    soot.no_cast()
    lin = m.beam((xm - 0.12, top + 0.03, z1 + 0.02), (xm + 0.12, top + 0.03, z1 + 0.02), w=0.04, h=0.035)
    lin.color("bois", var=0.04)
    # cendres + bûches de palmier empilées devant
    ash = m.lathe([(0.10, 0.0), (0.0, 0.02)], 6, (xm, 0, z1 + 0.08), cap=False, sz=0.7)
    ash.color("boue_sombre", var=0.04, shade=0.7)
    for k, (dy, dz) in enumerate(((0.03, 0.0), (0.03, 0.065), (0.03, 0.13), (0.085, 0.032), (0.085, 0.097))):
        z = z1 + 0.20 + dz
        lg = m.tube([(x0 + 0.02, dy, z), (x1 + 0.06, dy + 0.003 * k, z - 0.01)], 0.03, 5, smooth=60)
        lg.color_fn(lambda f: ("pise_clair", 0.85) if abs(f.normal.x) > 0.8 else ("bois", 0.9 + 0.1 * (k % 2)),
                    var=0.04)
    sack(m, 1.30, -0.02 + 0.33, 0.06, 0.05, 0.07, color="boue_sombre", rot=10)


def toits(m, P):
    """Sur les terrasses : tapis et nattes qui sèchent, jarre."""
    x0, z0, x1, z1, h = P["A"]
    archi.rug(m, -1.08, 0.04, 0.22, 0.26, y=h, stripes=5, rot_y=4)
    bx0, bz0, bx1, bz1, bh = P["B"]
    archi.rug(m, 0.85, -0.48, 0.22, 0.30, y=bh, colors=("indigo", "ecru", "garance", "safran"), stripes=5)
    m.jar(0.14, 0.05, 7, (0.10, bh, 0.16)).color("pise_sombre", var=0.05)


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    corps(m, P)
    coupoles(m, P)
    portail(m, P)
    facades(m, P)
    parvis(m, P)
    linge(m, P)
    chaufferie(m, P)
    toits(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.45, strength=0.8))
