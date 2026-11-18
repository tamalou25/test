"""fanal — tour de guet effilée avec brasero au sommet (emprise 1x1, hauteur 2,6).

Fût de pisé taluté (fruit marqué) sur un socle sombre, couronnement blanchi à la
chaux pour être repéré de loin, plateforme débordante sur poutres de palmier,
acrotère à merlons, brasero de cuivre dont le feu est en `lumiere` (le moteur
l'allume la nuit), fanion garance sur une perche. Porte haute côté +Z atteinte par
une échelle ; potence + corde pour hisser le combustible ; fagots au pied.
Un seul nœud.
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize, V
from mathutils import Matrix
from lib import archi
from _communs_batiments import merge, bands, sack

NAME = "fanal"
FOOTPRINT = (1, 1)
BUDGET = 1200

PARAMS = dict(base=0.58, h=2.06, taper=0.34, plat=0.50, plat_t=0.07, par_h=0.11, par_t=0.05,
              door_y=0.90, door_w=0.19, door_h=0.42, white_from=1.70)


def half_w(P, y):
    return P["base"] / 2 * (1 - P["taper"] * y / P["h"])


def slope(P):
    return math.degrees(math.atan((P["base"] / 2 * P["taper"]) / P["h"]))


def fut(m, P):
    b, h = P["base"], P["h"]
    body = m.box((b, h, b), (0, 0, 0), cell=0.36, bottom=False, top=False)
    body.bevel(0.02)
    rnd = m.rnd
    tab = {}

    def col(f):
        c = f.calc_center_median()
        if c.y > P["white_from"]:
            return ("chaux", 0.98 + rnd.uniform(-0.02, 0.02))
        k = int(c.y / 0.13)
        tab.setdefault(k, 1.0 + rnd.uniform(-0.04, 0.04))
        return ("pise", tab[k])

    body.color_fn(col, var=0.004)
    body.taper(P["taper"], 0, 0, 0, h)
    pl = m.box((b + 0.06, 0.14, b + 0.06), (0, 0, 0), bevel=0.015, bottom=False)
    pl.taper(P["taper"] * 0.14 / h, 0, 0, 0, 0.14)
    pl.color("pise_sombre", var=0.02)
    # bandeau de chaux débordant (larmier) au bas de la partie blanchie
    y = P["white_from"]
    hw = half_w(P, y) + 0.018
    ring = m.box((2 * hw, 0.035, 2 * hw), (0, y - 0.035, 0), skip=("-y",))
    ring.color("chaux_ombre", var=0.02)


def boulins(m, P):
    """Trous de boulin (empreintes des échafaudages de banchée) : petits carrés sombres."""
    rnd = m.rnd
    for facing in (0, 90, 180, 270):
        for (x, y) in ((-0.13, 0.42), (0.12, 0.44), (-0.10, 1.25), (0.11, 1.22), (0.0, 0.70)):
            if facing == 0 and abs(x) < 0.12 and 0.6 < y < 1.4:
                continue
            x += rnd.uniform(-0.02, 0.02)
            s = 0.018
            pts = [(x - s, y - s), (x + s, y - s), (x + s, y + s), (x - s, y + s)]
            q = m.add([(px, py, half_w(P, py) + 0.003) for px, py in pts], [[0, 1, 2, 3]])
            for f in q.faces:
                f.normal_update()
                if f.normal.z < 0:
                    f.normal_flip()
            q.color("boue_sombre", var=0.0, shade=0.55).no_ao().no_cast().rotate_y(facing)


def plateforme(m, P):
    h, s = P["h"], P["plat"] / 2
    t = P["plat_t"]
    slab = m.boxmm((-s, h, -s), (s, h + t, s), bevel=0.012, top=False)
    slab.color("pise_clair", var=0.03)
    floor = m.box((2 * s - 2 * P["par_t"], 0.0, 2 * s - 2 * P["par_t"]), (0, h + t, 0),
                  skip=("+x", "-x", "+z", "-z", "-y"), cell=0.2)
    floor.color("pise_clair", var=0.02, face_var=0.03)
    par = m.parapet(-s, -s, s, s, h + t, h=P["par_h"], t=P["par_t"], horn=0.11, bevel=0.0, cell=0.6)
    par.color_fn(lambda f: ("chaux", 1.0) if f.normal.y > 0.9 else ("chaux", 0.96), var=0.02)
    # merlons intermédiaires au milieu de chaque côté
    for (x, z) in ((0, s - P["par_t"] / 2), (0, -s + P["par_t"] / 2), (s - P["par_t"] / 2, 0),
                   (-s + P["par_t"] / 2, 0)):
        mer = m.lathe([(0.05, 0), (0.04, 0.05), (0.012, 0.09)], 4, (x, h + t + P["par_h"] - 0.01, z),
                      rot0=45, smooth=10, cap=False)
        mer.color("chaux", var=0.02)
    # poutres de palmier sous la plateforme (corbeaux), sur les 4 faces
    yb = h - 0.05
    hw = half_w(P, yb)
    for facing in (0, 90, 180, 270):
        at = archi.facade_point(0, 0, 2 * hw, 2 * hw, facing)
        archi.beam_ends(m, at, facing, 2 * hw, yb, spacing=0.15, r=0.02, out=s - hw + 0.01, margin=0.08)


def brasero(m, P):
    y0 = P["h"] + P["plat_t"]
    # trépied de fer forgé
    for k in range(3):
        a = math.radians(120 * k + 30)
        leg = m.tube([(0.10 * math.sin(a), y0, 0.10 * math.cos(a)), (0.04 * math.sin(a), y0 + 0.16,
                      0.04 * math.cos(a))], 0.01, 4, cap=(False, True))
        leg.color("bois_sombre", var=0.02, shade=0.7)
    # vasque de cuivre
    bowl = m.lathe([(0.05, y0 + 0.14), (0.12, y0 + 0.20), (0.135, y0 + 0.25), (0.12, y0 + 0.25),
                    (0.10, y0 + 0.23)], 8, (0, 0, 0), smooth=50, cap=False)
    bowl.color_fn(lambda f: ("cuivre", 1.1) if f.calc_center_median().y > y0 + 0.24 else ("cuivre", 0.88),
                  var=0.03)
    under = m.lathe([(0.05, y0 + 0.14), (0.0, y0 + 0.13)], 8, (0, 0, 0), cap=False)
    under.color("cuivre", var=0.03, shade=0.7)
    # feu : braises et flammes en `lumiere`
    with m.using(mat="lumiere"):
        coals = m.lathe([(0.105, y0 + 0.228), (0.07, y0 + 0.26), (0.0, y0 + 0.27)], 8, (0, 0, 0), cap=False,
                        smooth=40)
        coals.color("#E0602A", var=0.04, face_var=0.06).no_ao()
        rnd = m.rnd
        flames = [(0.0, 0.0, 0.23, 0.08), (0.055, 0.03, 0.17, 0.05), (-0.05, 0.035, 0.18, 0.05),
                  (0.01, -0.06, 0.15, 0.045)]
        for (x, z, hh, r) in flames:
            fl = m.lathe([(r, 0.0), (r * 0.75, hh * 0.35), (0.0, hh)], 5, (x, y0 + 0.235, z), smooth=60,
                         cap=False, rot0=rnd.uniform(0, 70))
            fl.transform(Matrix.Shear("XZ", 3, (x * 0.6, z * 0.6)),
                         pivot=(x, y0 + 0.235, z))
            fl.color_vertex_fn(lambda p, f, hh=hh: _flame(p.y - (y0 + 0.235), hh))
            fl.no_ao()


def _flame(t, hh):
    from lib.palette import mix_srgb
    k = max(0.0, min(1.0, t / hh))
    return mix_srgb("#F07A22", "#FFE7A8", k)


def porte_echelle(m, P):
    y = P["door_y"]
    sl = slope(P)
    zf = half_w(P, y)
    dw, dh = P["door_w"], P["door_h"]
    fr = m.boxmm((-dw / 2 - 0.035, 0, -0.01), (dw / 2 + 0.035, dh + 0.035, 0.012), skip=("-z", "-y"))
    fr.color("chaux", var=0.02)
    leaf = m.boxmm((-dw / 2, 0, 0.012), (dw / 2, dh, 0.016), skip=("-z", "-y", "-x", "+x", "+y"))
    leaf.color_fn(lambda f: ("bois_sombre", 1.0), var=0.03)
    plank = m.boxmm((-dw / 2, 0, 0.016), (dw / 2, dh, 0.022), skip=("-z", "-y"))
    plank.color_fn(lambda f: ("bois", 0.9 + 0.12 * (int((f.calc_center_median().x + 1) * 36) % 2)), var=0.03)
    lin = m.beam((-dw / 2 - 0.07, dh + 0.06, 0.02), (dw / 2 + 0.07, dh + 0.06, 0.02), w=0.045, h=0.04)
    lin.color("bois", var=0.05)
    d = merge([fr, leaf, plank, lin]).no_cast()
    d.translate(0, y, 0).rotate("X", -sl, pivot=(0, y, 0)).translate(0, 0, zf - 0.002)
    # seuil de bois débordant (palier de l'échelle)
    sill = m.boxmm((-0.13, y - 0.035, -0.02), (0.13, y, 0.07))
    sill.translate(0, 0, half_w(P, y))
    sill.color("bois", var=0.04)
    top = y + 0.02
    zb = 0.405
    zt = half_w(P, top) + 0.03
    lean = math.degrees(math.atan((zb - zt) / top))
    lad = m.ladder((0, 0.0, zb), top + 0.10, width=0.16, lean=lean, rungs=6, r=0.012)
    lad.clamp_floor().color("bois", var=0.06)
    # meurtrières `lumiere` sur les trois autres faces et au-dessus de la porte
    for facing, yy in ((90, 1.30), (270, 1.05), (180, 1.40), (0, 1.52)):
        zf2 = half_w(P, yy)
        fr = m.boxmm((-0.042, yy - 0.09, -0.01), (0.042, yy + 0.09, 0.014), skip=("-z", "-y"))
        fr.color("pise_sombre", var=0.03)
        with m.using(mat="lumiere"):
            gl = m.add([(-0.022, yy - 0.068, 0.0145), (0.022, yy - 0.068, 0.0145), (0.022, yy + 0.068, 0.0145),
                        (-0.022, yy + 0.068, 0.0145)], [[0, 1, 2, 3]])
            gl.color("boue_sombre", var=0.0, face_var=0.0, shade=0.6).no_ao()
        w = (fr + gl).no_cast()
        w.rotate("X", -sl, pivot=(0, yy, 0)).translate(0, 0, zf2 - 0.004).rotate_y(facing)


def potence(m, P):
    """Potence de hissage du combustible (côté +X) et corde jusqu'à un panier de bois."""
    y = P["h"] + P["plat_t"] + 0.06
    s = P["plat"] / 2
    arm = m.beam((s - 0.10, y, 0.10), (0.40, y, 0.10), w=0.035, h=0.035)
    arm.color("bois", var=0.05)
    strut = m.beam((s - 0.02, P["h"] - 0.12, 0.10), (0.35, y - 0.01, 0.10), w=0.025, h=0.025)
    strut.color("bois", var=0.05)
    pulley = m.cylinder(0.025, 0.02, 6, (0.38, y - 0.04, 0.09)).rotate("X", 90, pivot=(0.38, y - 0.03, 0.10))
    pulley.color("bois_sombre", var=0.03)
    rope = m.tube([(0.38, y - 0.03, 0.12), (0.38, 0.17, 0.12)], 0.005, 3, cap=(False, False))
    rope.color("pise_clair", var=0.02, shade=0.8).no_cast()
    bk = m.lathe([(0.05, 0.0), (0.065, 0.10)], 7, (0.37, 0.0, 0.12), cap=True, smooth=50)
    bk.color_fn(lambda f: ("pise_clair", 0.95 + 0.08 * math.sin(f.calc_center_median().y * 120)), var=0.02)
    for k in range(3):
        lg = m.tube([(0.34 + 0.025 * k, 0.07, 0.09), (0.35 + 0.02 * k, 0.17, 0.15)], 0.012, 4)
        lg.color("bois_sombre", var=0.05)


def fanion(m, P):
    y0 = P["h"] + P["plat_t"]
    x, z = -0.19, -0.19
    pole = m.tube([(x, y0, z), (x, 2.58, z)], 0.012, 4, cap=(False, True))
    pole.color("bois", var=0.04)
    with m.using(mat="tissu"):
        fl = m.cloth((x, 2.56, z), (x + 0.14, 2.545, z - 0.12), (x + 0.14, 2.47, z - 0.12), (x, 2.46, z),
                     nu=3, nv=1, sag=0.0, up=(1, 0, 1))
        fl.color_fn(lambda f: ("garance", 1.0), var=0.03)


def pied(m, P):
    """Fagots de palmes et bûches au pied, jarre, sac de charbon."""
    for i, (x, z, a) in enumerate(((-0.24, 0.32, 20), (-0.27, 0.15, -10), (-0.22, 0.24, 70))):
        r = math.radians(a)
        dx, dz = math.cos(r) * 0.14, math.sin(r) * 0.14
        lg = m.tube([(x - dx, 0.03 + 0.03 * (i == 2), z - dz), (x + dx, 0.03 + 0.03 * (i == 2), z + dz)],
                    0.03, 5, smooth=60)
        lg.color_fn(lambda f: ("pise_clair", 0.9) if abs(f.normal.y) < 0.2 and f.normal.dot(V(math.cos(r), 0, math.sin(r))) ** 2 > 0.8
                    else ("bois", 1.0), var=0.04)
    m.jar(0.19, 0.065, 7, (0.33, 0.0, -0.30)).color("pise_sombre", var=0.05)
    sack(m, 0.33, 0.33, 0.06, 0.05, 0.07, color="boue_sombre", rot=30)


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    fut(m, P)
    boulins(m, P)
    plateforme(m, P)
    brasero(m, P)
    porte_echelle(m, P)
    potence(m, P)
    fanion(m, P)
    pied(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.45, strength=0.8, height_grad=(0.88, 1.0)))
