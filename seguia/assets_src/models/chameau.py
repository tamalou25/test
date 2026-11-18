"""chameau — dromadaire stylisé de bât, longueur 0,95 (tête vers +Z), 0,70 à la bosse.

Nœuds : `chameau` (racine vide) > `corps` (corps + cou + tête + queue),
`patte_avg`, `patte_avd`, `patte_arg`, `patte_ard` (origine de chaque patte à la
hanche / l'épaule : le moteur les fait pivoter autour de X), `charge` (bât, sacs, tapis).
« g » = gauche de l'animal = +X (l'animal regarde vers +Z) ; « d » = -X.
Budget 700 triangles.
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize, V

NAME = "chameau"
FOOTPRINT = None
BUDGET = 700

PARAMS = dict(
    body_c=(0.0, 0.455, -0.03), body_r=(0.125, 0.105, 0.25),
    hump_c=(0.0, 0.545, -0.05), hump_r=(0.095, 0.14, 0.135),
    leg_x=0.068, front_z=0.15, back_z=-0.19, hip_y=0.43,
)

LEGS = {  # nom : (côté x, avant ?)
    "patte_avg": (1, True), "patte_avd": (-1, True),
    "patte_arg": (1, False), "patte_ard": (-1, False),
}


def ellipsoid(m, c, r, seg=8, rings=6):
    return m.sphere(1.0, seg, rings).scale(*r).translate(*c)


def corps(m, P):
    with m.using(node="corps"):
        body = ellipsoid(m, P["body_c"], P["body_r"], 8, 5)
        body.color("chameau", var=0.02)
        hump = ellipsoid(m, P["hump_c"], P["hump_r"], 8, 5)
        hump.color("chameau", var=0.02, shade=1.04)
        # poitrail plus massif à l'avant
        chest = ellipsoid(m, (0, 0.44, 0.15), (0.10, 0.10, 0.11), 6, 5)
        chest.color("chameau", var=0.02)
        # cou en S : descend vers l'avant puis remonte vers la tête
        neck = m.tube([(0, 0.47, 0.17), (0, 0.45, 0.30), (0, 0.52, 0.39), (0, 0.62, 0.41)],
                      [0.062, 0.05, 0.042, 0.038], 6, cap=(False, False), sx=0.8, smooth=70)
        neck.color("chameau", var=0.02)
        # tête allongée, museau tombant
        head = ellipsoid(m, (0, 0.0, 0.0), (0.042, 0.045, 0.085), 6, 4)
        head.rotate("X", 18).translate(0, 0.635, 0.455)
        head.color("chameau", var=0.02, shade=1.03)
        muzzle = ellipsoid(m, (0, 0.0, 0.0), (0.03, 0.03, 0.035), 6, 3)
        muzzle.translate(0, 0.607, 0.522).color("chameau_sombre", var=0.02)
        for sx in (-1, 1):
            ear = m.cone(0.014, 0.035, 4, (sx * 0.03, 0.665, 0.405))
            ear.rotate("Z", -sx * 35, pivot=(sx * 0.03, 0.665, 0.405)).color("chameau_sombre")
            eye = m.box((0.008, 0.012, 0.016), (sx * 0.040, 0.642, 0.47),
                        skip=("-x" if sx > 0 else "+x", "-y"))
            eye.color("#2a1a12", var=0).no_cast()
        tail = m.tube([(0, 0.47, -0.27), (0, 0.40, -0.30), (0, 0.32, -0.30)],
                      [0.016, 0.012, 0.016], 4, cap=(False, True), smooth=70)
        tail.color("chameau_sombre", var=0.03)


def pattes(m, P):
    for name, (sx, front) in LEGS.items():
        x = sx * P["leg_x"]
        z0 = P["front_z"] if front else P["back_z"]
        hip = V(x, P["hip_y"], z0)
        m.node(name, tuple(hip), parent="chameau")
        with m.using(node=name):
            if front:
                pts = [hip + V(0, 0.04, 0), V(x, 0.30, z0 + 0.005), V(x, 0.17, z0 + 0.01),
                       V(x, 0.03, z0 + 0.01)]
                radii = [0.048, 0.03, 0.024, 0.02]
            else:
                pts = [hip + V(0, 0.04, 0.01), V(x, 0.30, z0 + 0.04), V(x, 0.17, z0 - 0.025),
                       V(x, 0.03, z0 - 0.01)]
                radii = [0.058, 0.034, 0.022, 0.02]
            leg = m.tube(pts, radii, 5, cap=(False, False), smooth=70)
            leg.color_fn(lambda f: ("chameau", 1.0) if f.calc_center_median().y > 0.22
                         else ("chameau_sombre", 1.0), var=0.02)
            # pied large et plat (sole)
            foot = m.lathe([(0.034, 0.0), (0.03, 0.022), (0.018, 0.04)], 5,
                           (x, 0, pts[-1].z + 0.008), smooth=60, cap=False)
            foot.color("chameau_sombre", var=0.03, shade=0.9)


def charge(m, P):
    hc, hr = V(P["hump_c"]), V(P["hump_r"])
    m.node("charge", (0, 0, 0))
    with m.using(node="charge"):
        # tapis de selle drapé sur la bosse (rayures garance / indigo / safran)
        top = hc.y + hr.y
        prof = []
        for i in range(5):
            t = i / 4 * (math.pi / 2)
            prof.append((math.cos(t), math.sin(t)))
        blanket = m.lathe([(1.0, -0.55), (1.05, 0.0)] + [(math.cos(t), math.sin(t))
                                                          for t in (0.55, 1.1)] + [(0.0, 1.0)],
                          7, (0, 0, 0), cap=False, smooth=60)
        blanket.scale(hr.x * 1.12, hr.y * 0.97, hr.z * 1.2).translate(hc.x, hc.y + 0.008, hc.z)

        def stripes(f):
            # fond garance, liserés indigo / safran, bordure écrue en bas
            c = f.calc_center_median()
            if c.y < hc.y - 0.02:
                return "indigo"
            if c.y < hc.y + 0.03:
                return "safran"
            if c.y < hc.y + 0.09:
                return "garance"
            if c.y < hc.y + 0.11:
                return "ecru"
            return ("garance", 0.92)

        blanket.color_fn(stripes, var=0.03)
        # sacs de part et d'autre (toile écrue / indigo), rebondis
        for sx, col in ((1, "ecru"), (-1, "indigo")):
            sack = ellipsoid(m, (0, 0, 0), (0.055, 0.085, 0.09), 6, 3)
            sack.rotate("Z", sx * 12).translate(sx * 0.165, 0.44, -0.04)
            sack.color(col, var=0.04)
            tie = m.cylinder(0.02, 0.03, 5, (sx * 0.17, 0.51, -0.04))
            tie.color("safran" if col == "indigo" else "garance", var=0.03)
        # tapis roulé en travers, derrière la bosse
        roll = m.cylinder(0.034, 0.30, 7, (0, 0, 0), smooth=60)
        roll.rotate("Z", 90).translate(0.15, 0.585, -0.215)
        roll.color_fn(lambda f: ("ecru", 1.0) if abs(f.normal.x) > 0.9 else
                      ("indigo", 1.0) if abs(f.calc_center_median().x) < 0.09 else
                      ("garance", 1.0), var=0.03)
        # licol : tour de museau
        hal = m.lathe([(0.033, 0), (0.033, 0.014)], 6, (0, 0, 0), cap=False, smooth=60)
        hal.rotate("X", 108).translate(0, 0.613, 0.50).color("garance", var=0.03)


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    m.node("corps", (0, 0, 0))
    corps(m, P)
    pattes(m, P)
    charge(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.25, strength=0.7, height_grad=(0.88, 1.0)))
