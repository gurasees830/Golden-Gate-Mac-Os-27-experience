"""Procedurally render original Golden Gate wallpapers (no external imagery).

Usage: python3 -I wallpapers.py <out_dir> [names...]
"""
import sys, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter, zoom

W, H = 2880, 1800
SS = 2  # supersampling for geometry
rng = np.random.default_rng(27)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    t = np.asarray(t)
    if t.ndim == 2:
        t = t[..., None]
    return a * (1 - t) + b * t


def col(hexs):
    hexs = hexs.lstrip('#')
    return np.array([int(hexs[i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


def fbm(h, w, base=8, octaves=6, persistence=0.5, seed=0, stretch=1.0):
    r = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gh = max(2, int(base * (2 ** o) / stretch))
        gw = max(2, int(base * (2 ** o) * w / h))
        g = r.random((gh + 3, gw + 3)).astype(np.float32)
        up = zoom(g, (h / gh, w / gw), order=3)[:h, :w]
        out += amp * up
        tot += amp
        amp *= persistence
    out /= tot
    return (out - out.min()) / (out.max() - out.min() + 1e-6)


YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
NX, NY = XX / W, YY / H


def vertical_gradient(stops):
    """stops: list of (pos, hex)"""
    img = np.zeros((H, W, 3), np.float32)
    pos = [p for p, _ in stops]
    cols = [col(c) for _, c in stops]
    for ch in range(3):
        img[..., ch] = np.interp(NY, pos, [c[ch] for c in cols])
    return img


def glow(cx, cy, r, aspect=1.0):
    d2 = ((NX - cx) * W) ** 2 + (((NY - cy) * H) * aspect) ** 2
    return np.exp(-d2 / (2 * (r * W) ** 2))


# ---------------------------------------------------------------- geometry
def S(x, y):
    return (x * W * SS, y * H * SS)


def quad_bezier(p0, p1, p2, n=400):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2 = map(np.array, (p0, p1, p2))
    return (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2


def mask_from(draw_fn, blur=0.0):
    im = Image.new('L', (W * SS, H * SS), 0)
    d = ImageDraw.Draw(im)
    draw_fn(d)
    im = im.resize((W, H), Image.LANCZOS)
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(im, np.float32) / 255


class Bridge:
    # normalized coordinates
    near_x, near_top, near_deck, near_base = 0.265, 0.075, 0.468, 0.92
    far_x, far_top, far_deck, far_base = 0.735, 0.355, 0.586, 0.70
    near_w, far_w = 0.074, 0.030  # face width at deck

    def deck_y(self, x):
        # line through both tower deck points, slight curve
        t = (x - self.near_x) / (self.far_x - self.near_x)
        return self.near_deck + (self.far_deck - self.near_deck) * t + 0.012 * t * (1 - t)

    def deck_th(self, x):
        t = np.clip((x - self.near_x) / (self.far_x - self.near_x), -0.6, 1.6)
        return 0.016 * (1 - t) + 0.0065 * t

    def main_cable(self, side=0):
        off = (-1 if side == 0 else 1)
        nx = self.near_x + off * self.near_w * 0.36
        fx = self.far_x + off * self.far_w * 0.36
        p0 = (nx, self.near_top + 0.012)
        p2 = (fx, self.far_top + 0.006)
        mid_x = 0.575
        p1 = (mid_x, self.deck_y(mid_x) * 2 - (p0[1] + p2[1]) / 2 + 0.02)
        return quad_bezier(p0, p1, p2)

    def tower_polys(self, cx, top, deck, base, w):
        """Return list of (poly, kind) for one tower; kind in front/side/strut/cap/recess"""
        polys = []
        h = base - top
        leg = w * 0.24
        side = w * 0.07
        # setbacks: legs narrow toward top
        levels = [(base, 1.0), (deck - 0.02 * h, 1.0), (top + 0.55 * h * 0.62, 0.9), (top + 0.28 * h * 0.62, 0.82), (top + 0.06 * h, 0.74), (top, 0.7)]
        for s in (-1, 1):
            for i in range(len(levels) - 1):
                y0, k0 = levels[i]
                y1, k1 = levels[i + 1]
                outer0 = cx + s * w / 2 * (0.86 + 0.14 * k0)
                outer1 = cx + s * w / 2 * (0.86 + 0.14 * k1)
                inner0 = outer0 - s * leg * k0
                inner1 = outer0 - s * leg * k1
                polys.append(([S(outer0, y0), S(inner0, y0), S(inner1, y1), S(outer1, y1)], 'front'))
                # side face visible on right side of each leg (sun from right)
                polys.append(([S(outer0 if s > 0 else inner0, y0), S((outer0 if s > 0 else inner0) + side * k0, y0 - 0.002),
                               S((outer1 if s > 0 else inner1) + side * k1, y1 - 0.002), S(outer1 if s > 0 else inner1, y1)], 'side'))
                # vertical recess line on leg
                rx0 = (outer0 + inner0) / 2
                polys.append(([S(rx0 - leg * 0.06 * k0, y0), S(rx0 + leg * 0.06 * k0, y0), S(rx0 + leg * 0.06 * k1, y1), S(rx0 - leg * 0.06 * k1, y1)], 'recess'))
        # portal struts (above deck)
        strut_ys = [top + 0.015 * h, top + 0.24 * h * 0.62 + 0.0, top + 0.47 * h * 0.62, top + 0.74 * h * 0.62]
        strut_h = [0.045 * h, 0.03 * h, 0.03 * h, 0.034 * h]
        for y, sh in zip(strut_ys, strut_h):
            half = w / 2 * 0.80
            polys.append(([S(cx - half, y), S(cx + half, y), S(cx + half, y + sh), S(cx - half, y + sh)], 'strut'))
            # arch recess inside strut
            polys.append(([S(cx - half * 0.7, y + sh * 0.25), S(cx + half * 0.7, y + sh * 0.25), S(cx + half * 0.7, y + sh * 0.8), S(cx - half * 0.7, y + sh * 0.8)], 'recess'))
        # cap
        polys.append(([S(cx - w / 2 * 0.62, top - 0.006), S(cx + w / 2 * 0.62, top - 0.006), S(cx + w / 2 * 0.64, top + 0.004), S(cx - w / 2 * 0.64, top + 0.004)], 'cap'))
        return polys

    def masks(self):
        m = {}
        towers = [(self.near_x, self.near_top, self.near_deck, self.near_base, self.near_w),
                  (self.far_x, self.far_top, self.far_deck, self.far_base, self.far_w)]
        for kind in ('front', 'side', 'strut', 'cap', 'recess'):
            def fn(d, kind=kind):
                for t in towers:
                    for poly, k in self.tower_polys(*t):
                        if k == kind:
                            d.polygon(poly, fill=255)
            m['tower_' + kind] = mask_from(fn)

        # deck: top face + truss
        xs = np.linspace(-0.05, 1.05, 300)

        def deck_fn(d, part):
            top, bot = [], []
            for x in xs:
                y = self.deck_y(x)
                th = self.deck_th(x)
                if part == 'top':
                    top.append(S(x, y - th * 0.18)); bot.append(S(x, y + th * 0.30))
                else:
                    top.append(S(x, y + th * 0.30)); bot.append(S(x, y + th))
            d.polygon(top + bot[::-1], fill=255)
        m['deck_top'] = mask_from(lambda d: deck_fn(d, 'top'))
        m['deck_truss'] = mask_from(lambda d: deck_fn(d, 'truss'))

        # truss pattern (vertical posts in truss)
        def truss_fn(d):
            x = -0.05
            while x < 1.05:
                y = self.deck_y(x)
                th = self.deck_th(x)
                d.line([S(x, y + th * 0.32), S(x, y + th * 0.98)], fill=255, width=max(1, int(2.2 * SS * th / 0.016)))
                x += 0.0022 + 0.004 * th / 0.016
        m['truss_lines'] = mask_from(truss_fn)

        # cables
        def cables_fn(d, which):
            for side in (0, 1):
                pts = self.main_cable(side)
                if which == 'main':
                    pp = [S(x, y) for x, y in pts]
                    wd = int(5 * SS) if side == 1 else int(4.4 * SS)
                    for i in range(len(pp) - 1):
                        t = i / len(pp)
                        wd_i = max(2, int((7.5 * (1 - t) + 2.6 * t) * SS))
                        d.line([pp[i], pp[i + 1]], fill=255, width=wd_i)
            if which == 'side':
                for off in (-1, 1):
                    # left side-span from near tower down off-screen
                    p0 = (self.near_x + off * self.near_w * 0.36, self.near_top + 0.012)
                    p2 = (-0.04, 0.36 + (0.012 if off > 0 else 0))
                    p1 = (0.12, 0.30)
                    pts = quad_bezier(p0, p1, p2)
                    pp = [S(x, y) for x, y in pts]
                    for i in range(len(pp) - 1):
                        d.line([pp[i], pp[i + 1]], fill=255, width=int(7.5 * SS))
                    # right side-span from far tower down to anchorage
                    p0 = (self.far_x + off * self.far_w * 0.36, self.far_top + 0.006)
                    p2 = (0.94, self.deck_y(0.94) - 0.004)
                    p1 = (0.85, self.deck_y(0.85) - 0.07)
                    pts = quad_bezier(p0, p1, p2)
                    pp = [S(x, y) for x, y in pts]
                    for i in range(len(pp) - 1):
                        d.line([pp[i], pp[i + 1]], fill=255, width=int(2.8 * SS))
            if which == 'susp':
                for side in (0, 1):
                    pts = self.main_cable(side)
                    for i in range(6, len(pts) - 4, 5):
                        x, y = pts[i]
                        yd = self.deck_y(x) - self.deck_th(x) * 0.15
                        if yd - y > 0.004:
                            t = (x - self.near_x) / (self.far_x - self.near_x)
                            d.line([S(x, y), S(x, yd)], fill=200 if side else 150, width=max(1, int((2.6 * (1 - t) + 1.2 * t) * SS)))
                # left side span suspenders
                for off in (-1, 1):
                    p0 = (self.near_x + off * self.near_w * 0.36, self.near_top + 0.012)
                    pts = quad_bezier(p0, (0.12, 0.30), (-0.04, 0.36))
                    for i in range(8, len(pts), 9):
                        x, y = pts[i]
                        yd = self.deck_y(x) - self.deck_th(x) * 0.15
                        if yd - y > 0.004 and x > -0.03:
                            d.line([S(x, y), S(x, yd)], fill=170, width=int(2.8 * SS))
        m['cable_main'] = mask_from(lambda d: cables_fn(d, 'main'))
        m['cable_side'] = mask_from(lambda d: cables_fn(d, 'side'))
        m['susp'] = mask_from(lambda d: cables_fn(d, 'susp'))
        return m


def hills_mask(base_y, amp, seed, freq=3, sharp=1.0, offset=0.0):
    r = np.random.default_rng(seed)
    xs = np.linspace(0, 1, W)
    ridge = np.zeros(W, np.float32)
    a = amp
    f = freq
    for o in range(6):
        ph = r.random() * 6.28
        ridge += a * np.sin(xs * f * 6.28 + ph) * (0.6 + 0.4 * r.random())
        a *= 0.5
        f *= 2.1
    ridge = base_y - ridge - offset
    return ridge


def finish(img, grain=0.012, vignette=0.22, seed=1):
    v = 1 - vignette * (((NX - 0.5) * 1.1) ** 2 + ((NY - 0.5) * 1.3) ** 2)
    img = img * v[..., None]
    n = np.random.default_rng(seed).normal(0, grain, (H, W, 1)).astype(np.float32)
    img = img + n
    return np.clip(img, 0, 1)


def save(img, path, quality=90):
    im = Image.fromarray((np.clip(img, 0, 1) ** (1 / 1.0) * 255).astype(np.uint8))
    im.save(path, quality=quality, optimize=True, progressive=True)
    th = im.resize((480, 300), Image.LANCZOS)
    th.save(path.replace('.jpg', '-thumb.jpg'), quality=82)


# ---------------------------------------------------------------- Golden Gate scenes
def golden_gate(mode='golden'):
    br = Bridge()
    m = br.masks()
    horizon = 0.665

    if mode == 'day':
        sky = vertical_gradient([(0, '#2f6fc0'), (0.35, '#6fa6dc'), (0.6, '#b9d6ee'), (horizon, '#e7eef2'), (1, '#e7eef2')])
        sun = (0.86, 0.12)
        sky += glow(*sun, 0.05)[..., None] * col('#fff6e0') * 0.6 + glow(*sun, 0.22)[..., None] * col('#fff2d0') * 0.25
        haze_col = col('#dfe9f0')
        fog_col = col('#f7f8f8')
        water_top, water_bot = col('#7ea5bf'), col('#1f4d6b')
        tower_lit, tower_shade, tower_side = col('#d0452f'), col('#8f2a1e'), col('#e8644a')
        hill_cols = [col('#9fb0b8'), col('#7d8f8a'), col('#4f6650')]
        cloud_col = col('#ffffff')
    elif mode == 'night':
        sky = vertical_gradient([(0, '#05070f'), (0.3, '#0b1530'), (0.55, '#1b2a52'), (horizon, '#3b3f63'), (1, '#3b3f63')])
        sun = (0.86, 0.6)
        sky += glow(0.82, horizon, 0.25, 2.0)[..., None] * col('#ff9a5a') * 0.18
        haze_col = col('#2c3354')
        fog_col = col('#6d7290')
        water_top, water_bot = col('#1c2340'), col('#04060c')
        tower_lit, tower_shade, tower_side = col('#c84a2c'), col('#5a1d16'), col('#f07a45')
        hill_cols = [col('#1b2140'), col('#121731'), col('#0a0d1c')]
        cloud_col = col('#4a4f73')
    else:  # golden hour
        sky = vertical_gradient([(0, '#24376a'), (0.22, '#4b5d93'), (0.42, '#a98aa6'), (0.56, '#f0b48a'), (horizon, '#ffd9a0'), (1, '#ffd9a0')])
        sun = (0.875, 0.545)
        sky += glow(*sun, 0.035)[..., None] * col('#fff3d6') * 0.9
        sky += glow(*sun, 0.12)[..., None] * col('#ffcf8a') * 0.45
        sky += glow(sun[0], sun[1], 0.35, 1.8)[..., None] * col('#ff9e6a') * 0.22
        haze_col = col('#f3c79c')
        fog_col = col('#fff0de')
        water_top, water_bot = col('#c9a79a'), col('#2b3550')
        tower_lit, tower_shade, tower_side = col('#d2462b'), col('#7d2219'), col('#ff7a45')
        hill_cols = [col('#9b8095'), col('#6e5a74'), col('#3a3048')]
        cloud_col = col('#ffd0b8')

    img = sky.copy()

    # stars at night
    if mode == 'night':
        st = np.zeros((H, W), np.float32)
        r = np.random.default_rng(5)
        n = 2600
        ys = r.integers(0, int(H * 0.55), n)
        xs = r.integers(0, W, n)
        st[ys, xs] = r.random(n) ** 3 * 1.6
        st = gaussian_filter(st, 0.8) * 4
        img += (st * (1 - NY / 0.6).clip(0, 1))[..., None] * col('#dfe6ff')

    # high clouds: stretched fbm
    cl = fbm(H, W, base=3, octaves=6, seed=11, stretch=0.25)
    cl = smoothstep(0.55, 0.85, cl) * smoothstep(0.62, 0.2, NY) * smoothstep(0.0, 0.12, NY)
    a = 0.55 if mode != 'night' else 0.35
    if mode == 'golden':
        lit = mix(col('#c79bb0'), cloud_col, smoothstep(0.1, 0.5, NY))
        img = mix(img, lit, cl * a)
    else:
        img = mix(img, np.broadcast_to(cloud_col, img.shape), cl * a)

    # distant hills (3 ranges)
    ranges = [
        (hills_mask(0.60, 0.035, 3, 2.2) , 0.65),
        (hills_mask(0.575, 0.06, 7, 1.4) + 0.0, 0.42),
        (hills_mask(0.60, 0.05, 13, 1.1), 0.18),
    ]
    # make far-left headland taller
    for i, (ridge, haze) in enumerate(ranges):
        rr = ridge.copy()
        if i == 1:
            rr -= 0.09 * np.exp(-((np.linspace(0, 1, W) - 0.05) / 0.22) ** 2)
            rr += 0.05 * smoothstep(0.55, 1.0, np.linspace(0, 1, W))
        if i == 2:
            rr -= 0.045 * np.exp(-((np.linspace(0, 1, W) - 0.42) / 0.2) ** 2)
            rr += 0.04 * smoothstep(0.6, 0.95, np.linspace(0, 1, W))
        mask = smoothstep(rr[None, :] - 0.0015, rr[None, :] + 0.0015, NY) * (NY < horizon + 0.01)
        tex = fbm(H, W, base=10, octaves=5, seed=20 + i)
        hc = hill_cols[i] * (0.85 + 0.3 * tex[..., None])
        # sunlit rim on ridge
        rim = np.exp(-((NY - rr[None, :]) * H / 6) ** 2) * (mode != 'night')
        hc = hc + rim[..., None] * (col('#ffd2a0') if mode == 'golden' else col('#ffffff')) * (0.45 if mode == 'golden' else 0.12)
        hc = mix(hc, np.broadcast_to(haze_col, hc.shape), haze)
        img = mix(img, hc, mask)

    # city skyline on far right
    city = Image.new('L', (W * SS, H * SS), 0)
    dd = ImageDraw.Draw(city)
    r = np.random.default_rng(42)
    x = 0.80
    while x < 1.02:
        bw = 0.004 + r.random() * 0.01
        bh = (0.008 + r.random() ** 2 * 0.045) * (1.4 if 0.86 < x < 0.93 else 1)
        dd.rectangle([S(x, horizon - bh), S(x + bw, horizon + 0.01)], fill=255)
        x += bw * (0.7 + r.random() * 0.6)
    # pyramid tower
    dd.polygon([S(0.895, horizon - 0.075), S(0.889, horizon), S(0.901, horizon)], fill=255)
    city = np.asarray(city.resize((W, H), Image.LANCZOS), np.float32) / 255
    city_col = mix(hill_cols[1], haze_col, 0.55 if mode != 'night' else 0.2)
    img = mix(img, np.broadcast_to(city_col, img.shape), city)

    # night city lights on hills and skyline
    lights_layer = np.zeros((H, W, 3), np.float32)
    if mode == 'night':
        r = np.random.default_rng(9)
        n = 9000
        lx = r.random(n)
        ly = horizon - r.random(n) ** 2 * 0.08
        keep = []
        for i in range(n):
            px, py = int(lx[i] * (W - 1)), int(ly[i] * (H - 1))
            on_city = city[py, px] > 0.5
            on_hill = (py / H > ranges[2][0][px] + 0.004 and lx[i] > 0.45) or (py / H > ranges[1][0][px] + 0.006 and lx[i] < 0.2)
            if on_city or (on_hill and r.random() < 0.35):
                keep.append((px, py))
        pts = np.zeros((H, W), np.float32)
        for px, py in keep:
            pts[py, px] += 0.6 + r.random() * 0.8
        warm = gaussian_filter(pts, 0.7) * 3
        bloom = gaussian_filter(pts, 6) * 22
        lights_layer += warm[..., None] * col('#ffd59a') + bloom[..., None] * col('#ff9f5a') * 0.6

    # water
    wy = smoothstep(horizon, 1.0, NY)
    water = mix(water_top, water_bot, wy ** 0.7)
    ripples = fbm(H, W, base=30, octaves=5, seed=33, stretch=0.08)
    water = water * (0.9 + 0.2 * ripples[..., None])
    if mode != 'night':
        streak = np.exp(-((NX - sun[0]) * W / (60 + 400 * wy)) ** 2) * (NY > horizon)
        streak *= smoothstep(0.45, 0.85, ripples) * 0.9
        water = water + streak[..., None] * (col('#ffe2b0') if mode == 'golden' else col('#ffffff')) * 0.55
    wmask = smoothstep(horizon - 0.001, horizon + 0.002, NY)
    img = mix(img, water, wmask)

    # fog layers
    def fog(y0, y1, seed, density, xmask=None, softness=0.05):
        f = fbm(H, W, base=4, octaves=7, seed=seed, stretch=0.5)
        band = smoothstep(y0 - softness, y0 + softness, NY) * smoothstep(y1 + softness, y1 - softness, NY)
        a = smoothstep(0.30, 0.66, f) * band * density
        if xmask is not None:
            a = a * xmask
        return np.clip(a, 0, 1)

    fog_lit = fog_col * 1.0
    # far fog bank on horizon
    a = fog(horizon - 0.06, horizon + 0.05, 101, 0.95)
    img = mix(img, np.broadcast_to(fog_lit, img.shape), a)

    # ---------------- bridge
    haze = smoothstep(0.30, 0.80, NX) * (0.42 if mode == 'golden' else 0.38 if mode == 'day' else 0.25)
    shade_grad = smoothstep(0.0, 1.0, NY)

    def paint(mask, color):
        nonlocal img
        c = mix(np.broadcast_to(color, img.shape), np.broadcast_to(haze_col, img.shape), haze)
        img = mix(img, c, mask)

    # main colors with vertical light falloff
    if mode == 'night':
        flood = (0.55 + 0.6 * smoothstep(0.45, 0.1, NY))[..., None]
        front_c = tower_lit * flood
        img_front = front_c
    else:
        img_front = mix(tower_lit * 1.05, tower_shade, smoothstep(0.1, 0.7, NY) * 0.35)

    paint(m['cable_side'], tower_shade * 0.95)
    paint(m['tower_front'], img_front)
    paint(m['tower_side'], tower_side)
    paint(m['tower_recess'], tower_shade * 0.8)
    paint(m['tower_strut'], img_front * 0.95)
    paint(m['tower_recess'] * m['tower_strut'], tower_shade * 0.75)
    paint(m['tower_cap'], tower_side * 1.05)
    paint(m['deck_truss'], tower_shade * 0.55)
    paint(m['truss_lines'] * m['deck_truss'], tower_lit * 0.8)
    paint(m['deck_top'], tower_side * 0.95 if mode != 'night' else tower_lit * 0.7)
    paint(m['susp'] * 0.85, tower_shade * 1.05)
    paint(m['cable_main'], tower_lit * 0.98)
    # highlight on top of cables (sunlit)
    if mode != 'night':
        hl = np.clip(m['cable_main'] - np.roll(m['cable_main'], 2, axis=0), 0, 1)
        img = mix(img, np.broadcast_to(tower_side * 1.15, img.shape), hl * 0.6)

    # night lights on bridge
    if mode == 'night':
        pts = np.zeros((H, W), np.float32)
        xs = np.arange(-0.04, 1.04, 0.0105)
        for x in xs:
            y = br.deck_y(x) - br.deck_th(x) * 0.25
            px, py = int(x * W), int(y * H)
            if 0 <= px < W and 0 <= py < H:
                pts[py, px] = 1.0
        lamp = gaussian_filter(pts, 1.0) * 6 + gaussian_filter(pts, 8) * 60
        img += lamp[..., None] * col('#ffcf7a') * 0.5
        # aviation lights
        av = np.zeros((H, W), np.float32)
        for (x, y) in [(br.near_x - br.near_w * 0.3, br.near_top - 0.008), (br.near_x + br.near_w * 0.3, br.near_top - 0.008),
                       (br.far_x - br.far_w * 0.3, br.far_top - 0.005), (br.far_x + br.far_w * 0.3, br.far_top - 0.005)]:
            av[int(y * H), int(x * W)] = 1
        img += (gaussian_filter(av, 1.4) * 14 + gaussian_filter(av, 10) * 120)[..., None] * col('#ff3b2f') * 0.6
        # reflections of all lights in water
        Lsum = lights_layer.mean(axis=2) + lamp * 0.3
        refl = np.zeros_like(Lsum)
        hy = int(horizon * H)
        src = Lsum[:hy][::-1]
        n = min(src.shape[0], H - hy)
        refl[hy:hy + n] = src[:n]
        refl = gaussian_filter(refl, (40, 2.5))
        refl *= (0.6 + 0.8 * ripples)
        img += (refl * (NY > horizon) * 1.6)[..., None] * col('#ffb36a')
        img += lights_layer

    # mid fog around far tower base & under deck
    xm = smoothstep(0.42, 0.62, NX)
    a = fog(br.far_deck + 0.01, horizon + 0.04, 202, 0.9, xm, 0.035)
    img = mix(img, np.broadcast_to(fog_lit, img.shape), a)
    # low fog in front of near tower legs
    a = fog(br.near_deck + 0.17, 0.95, 303, 1.0, None, 0.07)
    img = mix(img, np.broadcast_to(fog_lit * 0.98, img.shape), a)

    # foreground headland bottom-left
    xs = np.linspace(0, 1, W)
    ridge = 0.78 + 0.25 * smoothstep(0.0, 0.42, xs) ** 1.4 + 0.012 * np.sin(xs * 37) + 0.006 * np.sin(xs * 91 + 1)
    ridge = ridge - 0.08 * np.exp(-((xs - 0.0) / 0.12) ** 2)
    fg = smoothstep(ridge[None, :] - 0.001, ridge[None, :] + 0.002, NY)
    tex = fbm(H, W, base=40, octaves=5, seed=77)
    if mode == 'night':
        fgc = col('#05060c') * (0.8 + 0.4 * tex[..., None])
    elif mode == 'day':
        fgc = mix(col('#4e5f35'), col('#2c3a22'), tex) * 1.0
    else:
        fgc = mix(col('#4a3a3a'), col('#231b22'), tex)
    rim = np.exp(-((NY - ridge[None, :]) * H / 5) ** 2)
    if mode != 'night':
        fgc = fgc + rim[..., None] * (col('#ffc78a') if mode == 'golden' else col('#d8e6b0')) * 0.35
    img = mix(img, fgc, fg)

    # overall atmosphere bloom
    if mode == 'golden':
        img += glow(*sun, 0.25)[..., None] * col('#ffb070') * 0.12
    return finish(img, grain=0.010, vignette=0.18 if mode != 'night' else 0.3)


# ---------------------------------------------------------------- silk folds
def folds(dark=False):
    xs = np.linspace(0, 1, W)
    # each sheet: boundary curve y = c(x); sheet covers region BELOW-RIGHT (y > c(x)) or above
    def curve(a, b, c, d, e):
        return a + b * xs + c * np.sin(xs * d + e)

    sheets = [
        # (curve params, side, colorL, colorR)
        ((0.42, -0.70, 0.30, 4.2, 0.2), 1),
        ((0.78, -0.80, 0.30, 4.0, 0.6), 1),
        ((1.12, -0.86, 0.28, 3.8, 0.9), 1),
        ((1.45, -0.92, 0.26, 3.6, 1.2), 1),
        ((1.80, -0.98, 0.24, 3.4, 1.5), 1),
    ]
    if dark:
        palL = [col('#3a2a52'), col('#2a2346'), col('#1d1a38'), col('#2b1e3d'), col('#151329'), col('#0c0b1c')]
        palR = [col('#20263f'), col('#283050'), col('#3a3a63'), col('#4b3f6b'), col('#2c2c52'), col('#1a1b38')]
        rim_c = col('#f6c98d')
        base = vertical_gradient([(0, '#0d0c1d'), (1, '#1b1630')])
    else:
        palL = [col('#c7a173'), col('#e9d5bb'), col('#a3774b'), col('#efe1cf'), col('#b8936c'), col('#f3e8db')]
        palR = [col('#7a6f86'), col('#cfc9d4'), col('#575269'), col('#e2dfe6'), col('#8b8aa3'), col('#f0eef2')]
        rim_c = col('#fffaf0')
        base = vertical_gradient([(0, '#a07a52'), (1, '#6e5e72')])

    img = base.copy()
    lx = mix(np.zeros(1), np.ones(1), 0)
    for i, (p, side) in enumerate(sheets):
        c = curve(*p)
        dc = np.gradient(c, xs) / (H / W)
        sd = (NY - c[None, :]) / np.sqrt(1 + dc[None, :] ** 2)  # >0 below curve (normalized by H)
        cover = smoothstep(-0.0008, 0.0008, sd)
        # color across x with diagonal blend
        t = smoothstep(0.0, 1.0, NX * 0.9 + (NY - 0.5) * 0.25 + 0.05)
        cl = mix(palL[i + 1], palR[i + 1], t)
        # bevel: rolled edge bright then dark trough, then broad gradient
        d = np.maximum(sd, 0) * H
        bevel = 0.30 * np.exp(-d / 26) - 0.22 * np.exp(-((d - 90) / 70) ** 2) + 0.10 * np.exp(-((d - 420) / 260) ** 2)
        broad = 0.92 + 0.16 * np.sin(sd * 3.1 + i)
        shade = cl * (broad + bevel)[..., None]
        # thin specular rim line
        rim = np.exp(-((d - 3.5) / 2.2) ** 2) * 0.9
        shade = shade + rim[..., None] * rim_c * (0.55 if dark else 0.7)
        # shadow cast on lower layer (outside this sheet, above the curve)
        out = np.maximum(-sd, 0) * H
        shadow = np.exp(-out / 60) * (1 - cover) * (0.45 if dark else 0.35)
        img = img * (1 - shadow[..., None])
        img = mix(img, shade, cover)
    # soft overall light from top-left
    light = 0.9 + 0.2 * (1 - NX) * (1 - NY)
    img = img * light[..., None]
    img += glow(0.05, 0.25, 0.4)[..., None] * (col('#ffcf9a') if not dark else col('#6b4c8a')) * 0.18
    return finish(img, grain=0.008, vignette=0.12)


def glass(dark=False):
    """Soft mesh-gradient wallpaper (bay at dawn / dusk)."""
    if dark:
        blobs = [((0.15, 0.2), 0.45, '#3a1f6b'), ((0.85, 0.15), 0.4, '#0f3a6e'), ((0.7, 0.85), 0.5, '#b4462f'), ((0.2, 0.9), 0.4, '#5a1f4a'), ((0.5, 0.5), 0.3, '#1d2b5c')]
        img = vertical_gradient([(0, '#0a0d1f'), (1, '#120a1c')])
    else:
        blobs = [((0.12, 0.18), 0.45, '#9cc9ff'), ((0.88, 0.12), 0.40, '#ffc7a6'), ((0.75, 0.82), 0.5, '#f5a3c0'), ((0.18, 0.88), 0.42, '#b9b2ff'), ((0.5, 0.45), 0.3, '#fff1d6')]
        img = vertical_gradient([(0, '#e9eef8'), (1, '#f3e6ef')])
    warp = fbm(H, W, base=1, octaves=2, seed=301) - 0.5
    for (cx, cy), r, c in blobs:
        g = glow(cx + warp * 0.08, cy + warp * 0.06, r * 0.55)
        img = mix(img, np.broadcast_to(col(c), img.shape), np.clip(g * 1.1, 0, 1))
    return finish(img, grain=0.006, vignette=0.08)


if __name__ == '__main__':
    out = sys.argv[1]
    names = sys.argv[2:] or ['gg-golden', 'gg-day', 'gg-night', 'folds-light', 'folds-dark', 'glass-light', 'glass-dark']
    os.makedirs(out, exist_ok=True)
    for n in names:
        if n == 'gg-golden':
            img = golden_gate('golden')
        elif n == 'gg-day':
            img = golden_gate('day')
        elif n == 'gg-night':
            img = golden_gate('night')
        elif n == 'folds-light':
            img = folds(False)
        elif n == 'folds-dark':
            img = folds(True)
        elif n == 'glass-light':
            img = glass(False)
        elif n == 'glass-dark':
            img = glass(True)
        save(img, os.path.join(out, n + '.jpg'))
        print('wrote', n)
