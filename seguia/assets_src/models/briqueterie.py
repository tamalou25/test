"""briqueterie — four à briques et aire de séchage (emprise 2x2).

À l'arrière gauche, un four trapu de briques à coupole basse, noirci de suie, dont la
bouche de feu (côté +Z) rougeoie (`lumiere`) ; bois de palmier empilé à côté.
Devant à gauche, la fosse de boue (terre + paille) cernée d'un bourrelet, houe plantée,
jarres d'eau. Moules de bois à côté. À droite, rangées de briques crues qui sèchent
(à plat puis sur chant) et, au fond, le tas de briques cuites croisées.
Un seul nœud.
"""
import math

import _boot  # noqa: F401

from lib import Model, finalize, V
from lib.palette import mix_srgb
from _communs_batiments import merge, flip_up, disc, hoe, sack

NAME = "briqueterie"
FOOTPRINT = (2, 2)
BUDGET = 2500

CUITE = mix_srgb("pise_sombre", "garance", 0.35)      # brique cuite
CRUE = "pise_clair"                                    # brique crue sèche
FRAICHE = mix_srgb("pise", "boue", 0.5)                # brique moulée du jour

PARAMS = dict(kiln=(-0.44, -0.40), kr=0.40, wall_h=0.40, dome_h=0.22)


def four(m, P):
    cx, cz = P["kiln"]
    r, h, dh = P["kr"], P["wall_h"], P["dome_h"]
    prof = [(r + 0.02, 0.0), (r, 0.10), (r - 0.01, 0.2), (r - 0.025, h)]
    for i in range(1, 4):
        t = i / 4 * math.pi / 2
        prof.append(((r - 0.03) * math.cos(t), h + dh * math.sin(t)))
    prof += [(0.085, h + dh), (0.06, h + dh - 0.02)]
    body = m.lathe(prof, 14, (cx, 0, cz), smooth=40, cap=False, rot0=0)
    rnd = m.rnd

    def col(f):
        c = f.calc_center_median()
        y = c.y
        front = (c.z - cz) / r          # 1 = face avant
        if y > h + dh - 0.03:
            return ("boue_sombre", 0.5)  # lèvre de l'évent, noire de suie
        soot = max(0.0, (y - h * 0.55) / (dh + h * 0.45)) * 0.6 + max(0.0, front - 0.45) * 1.3 * (y > 0.22)
        base = mix_srgb(CUITE, "boue_sombre", min(0.85, soot))
        course = 1.0 + 0.08 * ((int(y / 0.06)) % 2 * 2 - 1) + rnd.uniform(-0.06, 0.03)
        return (base, course)

    body.color_fn(col, var=0.0)
    # évent : trou noir
    hole = disc(m, (cx, h + dh - 0.02, cz), 0.06, n=7)
    hole.color("#140d08", var=0.0).no_ao()
    collar = m.lathe([(0.10, h + dh - 0.012), (0.095, h + dh + 0.04), (0.075, h + dh + 0.04),
                      (0.07, h + dh + 0.0)], 8, (cx, 0, cz), smooth=40, cap=False)
    collar.color_fn(lambda f: ("boue_sombre", 0.45 if f.normal.y > 0.5 else 0.6), var=0.03)
    # couronne de pierres au pied du four
    stones = m.lathe([(r + 0.07, 0.0), (r + 0.06, 0.05), (r + 0.015, 0.06)], 14, (cx, 0, cz), smooth=20,
                     cap=False, rot0=12)
    stones.jitter(0.008).clamp_floor()
    stones.color_fn(lambda f: ("pierre" if rnd.random() < 0.6 else "pierre_sombre", 1.0 + rnd.uniform(-0.08, 0.05)),
                    var=0.0)
    # contreforts bas (renforts de terre) de part et d'autre
    for a in (-60, 60, 180):
        ar = math.radians(a)
        bx, bz = cx + math.sin(ar) * (r - 0.02), cz + math.cos(ar) * (r - 0.02)
        bt = m.box((0.12, 0.22, 0.10), (bx, 0, bz), rot_y=a, bottom=False)
        bt.taper(0.35, bx, bz, 0, 0.22)
        bt.color(mix_srgb(CUITE, "pise", 0.5), var=0.04)


def bouche(m, P):
    cx, cz = P["kiln"]
    r = P["kr"]
    zf = cz + r + 0.10
    w, hh, d = 0.32, 0.30, 0.16
    vest = m.boxmm((cx - w / 2, 0, zf - d), (cx + w / 2, hh, zf), bottom=False, cell=0.12)

    def col(f):
        c = f.calc_center_median()
        soot = 0.0
        if f.normal.z > 0.5:
            soot = max(0.0, 0.85 - abs(c.x - cx) * 3.5) * min(1.0, c.y / 0.2)
        return (mix_srgb(CUITE, "boue_sombre", min(0.8, soot)), 1.0 + m.rnd.uniform(-0.05, 0.03))

    vest.color_fn(col, var=0.0)
    # linteau de pierre
    lin = m.boxmm((cx - w / 2 - 0.02, hh, zf - d - 0.01), (cx + w / 2 + 0.02, hh + 0.05, zf + 0.015), bevel=0.008)
    lin.color("pierre_sombre", var=0.03)
    # bouche de feu : arc outrepassé `lumiere`
    pts, top = m.horseshoe(0.17, 0.09, 18, 8)
    with m.using(mat="lumiere"):
        fire = m.add([(cx + x, y, zf + 0.003) for x, y in pts], [list(range(len(pts)))])
        for f in fire.faces:
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
        fire.color_vertex_fn(lambda p, f: mix_srgb("#E8692A", "#FFC56B", max(0.0, min(1.0, p.y / 0.16))))
        fire.no_ao().no_cast()
    # cendres et braises tirées devant la bouche
    ash = m.lathe([(0.11, 0.0), (0.07, 0.018), (0.0, 0.024)], 7, (cx, 0, zf + 0.09), cap=False, sz=0.7)
    ash.color_fn(lambda f: (mix_srgb("boue_sombre", "pierre_sombre", m.rnd.uniform(0.2, 0.7)), 0.8), var=0.0)
    with m.using(mat="lumiere"):
        emb = disc(m, (cx + 0.01, 0.019, zf + 0.085), 0.045, n=5, rot0=20)
        for v in emb.verts():
            v.co.z = zf + 0.085 + (v.co.z - zf - 0.085) * 0.7
        emb.color("#E0602A", var=0.03).no_ao().no_cast()
    # bois de palmier empilé à droite de la bouche
    for k, (dy, dz) in enumerate(((0.035, 0.0), (0.035, 0.07), (0.035, 0.14), (0.095, 0.035), (0.095, 0.105),
                                  (0.155, 0.07))):
        x0, x1 = cx + 0.22, cx + 0.56
        z = cz + 0.16 + dz
        lg = m.tube([(x0, dy, z), (x1, dy + 0.004 * k, z + 0.01)], 0.034, 5, smooth=60)
        lg.color_fn(lambda f: ("pise_clair", 0.85) if abs(f.normal.x) > 0.8 else ("bois", 0.9 + 0.1 * (k % 2)),
                    var=0.04)
    # pelle à enfourner appuyée au four
    hoe(m, (cx - 0.24, 0.0, cz + r + 0.12), yaw=200, length=0.40, lean=28)


def fosse(m, P):
    """Fosse de malaxage : bourrelet de terre, boue luisante, paille, houe."""
    cx, cz, rx, rz = -0.48, 0.52, 0.34, 0.26
    bank = m.lathe([(1.0, 0.0), (0.92, 0.07), (0.80, 0.075), (0.74, 0.035)], 12, (0, 0, 0), smooth=40,
                   cap=False)
    bank.scale(rx, 1, rz).translate(cx, 0, cz)
    bank.color_fn(lambda f: ("pise_sombre", 1.0) if f.normal.y < 0.6 else ("boue", 1.08), var=0.04)
    mud = disc(m, (cx, 0.035, cz), 1.0, n=12)
    for v in mud.verts():
        v.co.x = cx + (v.co.x - cx) * rx * 0.75
        v.co.z = cz + (v.co.z - cz) * rz * 0.75
    mud.color("boue_sombre", var=0.02).no_cast()
    # remous de boue et brins de paille
    lump = m.dome(0.07, 6, 2, (cx + 0.05, 0.03, cz - 0.03), height=0.03)
    lump.color("boue", var=0.04)
    for k in range(5):
        a = m.rnd.uniform(0, math.pi)
        x, z = cx + m.rnd.uniform(-0.15, 0.15), cz + m.rnd.uniform(-0.1, 0.1)
        st = m.add([(x - 0.04 * math.cos(a), 0.038, z - 0.04 * math.sin(a)),
                    (x + 0.04 * math.cos(a), 0.038, z + 0.04 * math.sin(a)),
                    (x + 0.04 * math.cos(a), 0.038, z + 0.04 * math.sin(a) + 0.008)], [[0, 1, 2]])
        flip_up(st).color("safran", var=0.03, shade=0.9).no_ao().no_cast()
    # houe plantée dans la boue
    h = m.tube([(cx - 0.10, 0.03, cz + 0.02), (cx - 0.18, 0.36, cz - 0.04)], 0.009, 4, cap=(False, True))
    h.color("bois", var=0.04)
    # jarres d'eau et seau
    m.jar(0.22, 0.075, 8, (-0.86 + 0.04, 0.0, 0.24)).color("pise_sombre", var=0.05)
    m.jar(0.16, 0.055, 7, (-0.80, 0.0, 0.84)).color("pise", var=0.05)
    sack(m, -0.12, 0.86, 0.06, 0.05, 0.07, color="ecru", rot=20)
    for k in range(4):
        x, z = -0.12 + m.rnd.uniform(-0.09, 0.09), 0.80 + m.rnd.uniform(-0.08, 0.0)
        st = m.add([(x, 0.003, z), (x + 0.05, 0.003, z + 0.012), (x + 0.05, 0.003, z + 0.02)], [[0, 1, 2]])
        flip_up(st).color("safran", var=0.03, shade=0.85).no_ao().no_cast()  # paille hachée


def moules(m, P):
    """Moules de bois (deux alvéoles) : un vide, un plein ; planche à mouler."""
    def mould(x, z, rot, full):
        parts = []
        L, W, H, t = 0.24, 0.10, 0.035, 0.012
        parts.append(m.boxmm((-L / 2, 0, -W / 2), (L / 2, H, -W / 2 + t), bottom=False))
        parts.append(m.boxmm((-L / 2, 0, W / 2 - t), (L / 2, H, W / 2), bottom=False))
        for xx in (-L / 2, 0.0, L / 2):
            parts.append(m.boxmm((xx - t / 2, 0, -W / 2 + t), (xx + t / 2, H, W / 2 - t), bottom=False))
        hd = m.boxmm((L / 2, H * 0.5, -0.015), (L / 2 + 0.05, H * 0.5 + 0.015, 0.015))
        parts.append(hd)
        p = merge(parts).color("bois", var=0.05)
        out = [p]
        if full:
            for xx in (-L / 4, L / 4):
                f = m.boxmm((xx - L / 4 + t / 2, 0, -W / 2 + t), (xx + L / 4 - t / 2, H * 0.9, W / 2 - t),
                            skip=("-y", "-x", "+x", "-z", "+z"))
                f.color("boue", var=0.03)
                out.append(f)
        q = merge(out).no_cast()
        q.rotate_y(rot).translate(x, 0, z)
        return q

    board = m.box((0.34, 0.03, 0.22), (-0.06, 0, 0.52), bevel=0.006, bottom=False, rot_y=-8)
    board.color("bois", var=0.04, shade=1.05)
    mould(-0.06, 0.52, -8, True).translate(0, 0.03, 0)
    mould(-0.02, 0.24, 25, False)


def sechage(m, P):
    """Rangées de briques crues : fraîches à plat devant, sèches sur chant derrière."""
    bw, bh, bd = 0.11, 0.032, 0.055
    rnd = m.rnd
    x0 = 0.20
    rows = [  # (z, n, à plat ?, couleur)
        (0.84, 6, True, FRAICHE), (0.72, 6, True, FRAICHE), (0.60, 6, True, CRUE),
        (0.46, 7, False, CRUE), (0.34, 7, False, CRUE),
    ]
    for (z, n, flat, col) in rows:
        for i in range(n):
            if flat:
                size, x = (bw, bh, bd), x0 + 0.02 + i * (bw + 0.02)
            else:
                size, x = (bh, bd, bw), x0 + 0.02 + i * 0.095
            b = m.box(size, (x + rnd.uniform(-0.005, 0.005), 0, z), rot_y=rnd.uniform(-4, 4), bottom=False)
            b.color(col, var=0.05, face_var=0.02)
            if flat and col == FRAICHE:
                b.color_fn(lambda f, c=col: (c, 0.9) if f.normal.y > 0.5 else (c, 0.8), var=0.03)
    # empreintes de pas dans la terre (traces d'usage)
    for (x, z) in ((0.06, 0.70), (0.10, 0.60), (0.05, 0.47)):
        fp = disc(m, (x, 0.002, z), 0.022, n=5)
        for v in fp.verts():
            v.co.z = z + (v.co.z - z) * 1.6
        fp.color("pise_sombre", var=0.02, shade=0.95).no_cast()


def briques_cuites(m, P):
    """Tas de briques cuites croisées (palette à l'arrière droite)."""
    cx, cz = 0.50, -0.50
    bw, bh, bd = 0.12, 0.035, 0.06
    rnd = m.rnd
    layers = 6
    for k in range(layers):
        along_x = k % 2 == 0
        n = 4
        for i in range(n):
            off = -0.105 + i * 0.07
            if along_x:
                size, pos = (bw * 2.1, bh, bd), (cx, k * bh, cz + off)
            else:
                size, pos = (bd, bh, bw * 2.1), (cx + off, k * bh, cz)
            if k == layers - 1 and i == 3:
                continue
            b = m.box(size, pos, bottom=False, rot_y=rnd.uniform(-1.5, 1.5))
            b.color_fn(lambda f: (CUITE, 1.0 + rnd.uniform(-0.08, 0.06)), var=0.0)
    # second tas plus bas, entamé
    for k in range(3):
        for i in range(3):
            b = m.box((bw, bh, bd), (0.20 + i * 0.13, k * bh, -0.84 + 0.0), bottom=False,
                      rot_y=rnd.uniform(-3, 3))
            b.color_fn(lambda f: (CUITE, 0.95 + rnd.uniform(-0.08, 0.06)), var=0.0)
    # couffin de transport et brouette de palme (civière)
    for s in (-1, 1):
        pole = m.tube([(0.86, 0.04, -0.2 + s * 0.08 - 0.0), (0.86 - 0.42, 0.04, -0.2 + s * 0.08)], 0.012, 4)
        pole.color("bois", var=0.05)
    deck = m.boxmm((0.50, 0.045, -0.27), (0.80, 0.06, -0.13))
    deck.color("pise_clair", var=0.03, shade=0.9)
    for i in range(3):
        b = m.box((bw, bh, bd), (0.58 + i * 0.07, 0.06, -0.20), bottom=False, rot_y=90 + rnd.uniform(-5, 5))
        b.color(CUITE, var=0.05)


def build(P=PARAMS):
    m = Model(NAME, footprint=FOOTPRINT, budget=BUDGET)
    four(m, P)
    bouche(m, P)
    fosse(m, P)
    moules(m, P)
    sechage(m, P)
    briques_cuites(m, P)
    return m


if __name__ == "__main__":
    finalize(build(), ao=dict(samples=40, max_dist=0.35, strength=0.8))
