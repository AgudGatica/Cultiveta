# -*- coding: utf-8 -*-
"""
Cultiveta — transición de agua cartoon (2 s, 24 fps, 48 cuadros).

Un solo script genera TODO a partir de las mismas cuentas:
  * las escenas de Blender (mallas con shape keys absolutas, una por cuadro),
  * los renders (secuencia PNG con transparencia, WebM VP9 con transparencia, vista previa),
  * el "bake" vectorial (JSON) que usa la app cuando el navegador no muestra video con transparencia.

Uso sin ventana (todo de cero, deja también el .blend):
  blender -b --factory-startup -P agua_transicion.py -- --blend agua_transicion.blend \
      --out render --bake ../../src/assets/transiciones --render png,webm,preview

Uso dentro de un Blender abierto (por la conexión MCP): se ejecuta con AT_MODE="live" y solo arma las
escenas "Agua_Mobile" y "Agua_Desktop" (no toca las demás escenas del archivo abierto).

Cuadros: 1–7 lluvia · 7–20 entra la ola · 20–28 pantalla cubierta · 28–46 salida · 47–48 vacío.
Unidades: se calcula todo en píxeles (origen en el centro, Y hacia arriba) y 1 px = 0,01 unidades de Blender.
"""
import json
import math
import os
import sys

FPS = 24
FRAMES = 48
FORMATS = {"mobile": (1080, 1920), "desktop": (1920, 1080)}
PX = 0.01
TAU = math.tau

PAL = {
    "agua": "#39C9E7",      # agua principal
    "agua2": "#71E6F3",     # agua secundaria
    "sombra": "#1887BD",    # sombras
    "reflejo": "#DDFBFF",   # reflejos
    "contorno": "#173B65",  # contornos
}
PAL_ORDER = ["agua", "agua2", "sombra", "reflejo", "contorno"]
COLECCIONES = ["Agua principal", "Sombras", "Contornos", "Gotas", "Burbujas", "Reflejos"]

# Capas (Z en Blender, de atrás hacia adelante)
Z = {"contorno": 0.00, "gota": 0.04, "cuerpo": 0.20, "banda": 0.23, "sombra": 0.26, "cresta": 0.29,
     "reflejo": 0.32, "burbuja": 0.38, "espuma": 0.48}


# ----------------------------------------------------------------------------------------------
# Cuentas (sin Blender)
# ----------------------------------------------------------------------------------------------
def clamp(v, a=0.0, b=1.0):
    return a if v < a else b if v > b else v


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(t):
    t = clamp(t)
    return t * t * (3.0 - 2.0 * t)


def ssin(th, k=0.45):
    """Seno inclinado: ondas apenas asimétricas, como dibujadas a mano."""
    return math.sin(th + k * math.sin(th))


def rnd(seed, i=0):
    v = math.sin(seed * 127.1 + i * 311.7 + 0.5) * 43758.5453
    return v - math.floor(v)


def vnoise(x, seed=0):
    i = math.floor(x)
    t = x - i
    t = t * t * (3.0 - 2.0 * t)
    a = rnd(seed, i) * 2.0 - 1.0
    b = rnd(seed, i + 1) * 2.0 - 1.0
    return a + (b - a) * t


def ring_area(pts):
    s = 0.0
    for i in range(len(pts)):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % len(pts)]
        s += x0 * y1 - x1 * y0
    return s / 2.0


def ring_normals(pts):
    """Normales hacia afuera de un anillo cerrado."""
    n = len(pts)
    sign = 1.0 if ring_area(pts) > 0 else -1.0
    out = []
    for i in range(n):
        x0, y0 = pts[i - 1]
        x1, y1 = pts[(i + 1) % n]
        tx, ty = x1 - x0, y1 - y0
        ln = math.hypot(tx, ty) or 1.0
        out.append((sign * ty / ln, -sign * tx / ln))
    return out


def ring_offset(pts, d, seed=0, irregular=0.28):
    """Anillo corrido hacia afuera 'd' px, con grosor apenas irregular (trazo a mano)."""
    nor = ring_normals(pts)
    n = len(pts)
    p1, p2 = rnd(seed, 7) * TAU, rnd(seed, 8) * TAU
    out = []
    for i, ((x, y), (nx, ny)) in enumerate(zip(pts, nor)):
        a = TAU * i / n
        k = 1.0 + irregular * (0.65 * math.sin(a + p1) + 0.35 * math.sin(2 * a + p2))
        out.append((x + nx * d * k, y + ny * d * k))
    return out


def ring_blob(r, n=28, seed=1, wob=0.055):
    """Círculo imperfecto."""
    p1, p2, p3 = rnd(seed, 1) * TAU, rnd(seed, 2) * TAU, rnd(seed, 3) * TAU
    pts = []
    for k in range(n):
        a = TAU * k / n
        rr = r * (1.0 + wob * (0.6 * math.sin(2 * a + p1) + 0.4 * math.sin(3 * a + p2) + 0.25 * math.sin(5 * a + p3)))
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    return pts


def ring_tear(r, n=30, tail=1.55):
    """Gota: panza redonda abajo, punta arriba. El centro de la panza queda en el origen."""
    pts = []
    for k in range(n):
        t = TAU * k / n
        s = abs(math.sin(t / 2.0))
        x = 1.12 * math.sin(t) * s ** 1.5
        y = math.cos(t)
        if y > 0:
            y *= tail
        pts.append((r * x, r * y))
    return pts


def ring_crescent(base, a_center, a_span, inset, thick, n=12):
    """Medialuna adentro de un anillo: sigue su borde (corrida 'inset' hacia adentro) y se afina en las puntas."""
    m = len(base)
    nor = ring_normals(base)
    cx = sum(p[0] for p in base) / m
    cy = sum(p[1] for p in base) / m

    def at(ang):
        best, bi = 9.0, 0
        for i, (x, y) in enumerate(base):
            d = abs(math.atan2(math.sin(math.atan2(y - cy, x - cx) - ang), math.cos(math.atan2(y - cy, x - cx) - ang)))
            if d < best:
                best, bi = d, i
        return bi

    outer, inner = [], []
    for k in range(n + 1):
        s = k / n
        i = at(a_center - a_span / 2.0 + a_span * s)
        x, y = base[i]
        nx, ny = nor[i]
        outer.append((x - nx * inset, y - ny * inset))
        w = inset + thick * math.sin(math.pi * s)
        inner.append((x - nx * w, y - ny * w))
    return outer + inner[::-1][1:-1]


class Strip:
    def __init__(self, name, coll, color, z, frames, xy=False):
        self.name, self.coll, self.color, self.z, self.frames, self.xy = name, coll, color, z, frames, xy


class Blob:
    def __init__(self, name, z, parts, track):
        # parts: [(sufijo, coleccion, color, dz, anillo)] — la primera es la raíz (lleva la animación)
        self.name, self.z, self.parts, self.track = name, z, parts, track


class Agua:
    def __init__(self, fmt):
        self.fmt = fmt
        self.W, self.H = FORMATS[fmt]
        W, H = self.W, self.H
        self.MX, self.MY = 96.0, 90.0
        n = int(round((W + 2 * self.MX) / 12.0))
        n += n % 2
        self.xs = [-(W / 2 + self.MX) + i * (W + 2 * self.MX) / n for i in range(n + 1)]
        self.AMP_IN, self.AMP_OUT = 145.0, 150.0
        self.Y_IN0, self.Y_IN1 = H / 2 + 60.0, -H / 2 - self.AMP_IN - 150.0
        self.Y_OUT0, self.Y_OUT1 = H / 2 + 56.0, -H / 2 - self.AMP_OUT - 60.0
        self.strips, self.blobs = [], []

    # --- frente que entra (borde de abajo) -----------------------------------------------------
    def u_in(self, f):
        return clamp((f - 6.0) / 14.0)

    @staticmethod
    def e_in(u):
        return 0.45 * smooth(u) + 0.55 * u ** 1.7

    def env_in(self, f):
        return smooth(self.u_in(f) / 0.22)

    @staticmethod
    def wave_in(x, f):
        return (84.0 * ssin(TAU * x / 700.0 + 0.9 + 0.16 * f) + 44.0 * ssin(TAU * x / 372.0 + 2.3 - 0.23 * f)
                + 17.0 * math.sin(TAU * x / 188.0 + 5.1 + 0.31 * f))

    def front_base(self, x, f):
        u = self.u_in(f)
        lag = 0.085 * vnoise(x / 520.0 + 3.1, 11) * math.sin(math.pi * u)
        return lerp(self.Y_IN0, self.Y_IN1, self.e_in(clamp(u - lag)))

    def front_y(self, x, f):
        return self.front_base(x, f) + self.wave_in(x, f) * self.env_in(f)

    # --- borde de arriba que se va --------------------------------------------------------------
    def v_out(self, f):
        return clamp((f - 28.0) / 18.5)

    @staticmethod
    def e_out(v):
        return 0.40 * v + 0.60 * v ** 2.0

    def env_out(self, f):
        return 0.32 + 0.83 * smooth(self.v_out(f) / 0.45)

    def deco_out(self, f):
        return smooth(self.v_out(f) / 0.28)

    @staticmethod
    def wave_out(x, f):
        return (72.0 * ssin(TAU * x / 820.0 + 4.0 - 0.14 * f) + 40.0 * ssin(TAU * x / 410.0 + 1.1 + 0.21 * f)
                + 16.0 * math.sin(TAU * x / 205.0 + 2.9 - 0.33 * f))

    def top_base(self, x, f):
        v = self.v_out(f)
        lag = 0.07 * vnoise(x / 600.0 + 7.7, 23) * math.sin(math.pi * v)
        return lerp(self.Y_OUT0, self.Y_OUT1, self.e_out(clamp(v - lag)))

    def top_y(self, x, f):
        return self.top_base(x, f) + self.wave_out(x, f) * self.env_out(f)

    # --- interior ------------------------------------------------------------------------------
    def mass_d(self, f):
        """Cuánto bajó toda la masa de agua en la salida (con un envión hacia arriba antes de caer)."""
        return (self.Y_OUT1 - self.Y_OUT0) * self.e_out(self.v_out(f)) + 16.0 * math.sin(math.pi * clamp((f - 26.0) / 5.0))

    def y_int(self, f):
        u2 = clamp((f - 6.0) / 15.0)
        enter = 0.5 * self.H * (1.0 - (0.3 * u2 + 0.7 * smooth(u2)))
        settle = -24.0 * math.sin((f - 20.0) * math.pi / 5.0) * math.exp(-(f - 20.0) / 3.5) if f > 20 else 0.0
        return enter + settle + 9.0 * math.sin(TAU * f / 19.0) + self.mass_d(f)

    def lo(self, x, f):
        return self.front_y(x, f) if f <= 20 else -1e9

    def hi(self, x, f):
        return self.top_y(x, f) if f >= 28 else 1e9

    def visible(self, f):
        return 7 <= f <= 46

    # --- tiras ---------------------------------------------------------------------------------
    def add_strip(self, name, coll, color, z, fn, xy=False):
        frames = [fn(f) if 1 <= f <= FRAMES else None for f in range(1, FRAMES + 1)]
        self.strips.append(Strip(name, coll, color, z + 0.0007 * len(self.strips), frames, xy))

    def clamped(self, f, top_fn, bot_fn):
        if not self.visible(f):
            return None
        A, B = [], []
        for x in self.xs:
            lo, hi = self.lo(x, f), self.hi(x, f)
            t, b = top_fn(x), bot_fn(x)
            if lo >= hi:
                t = b = lo
            else:
                t = clamp(t, lo, hi)
                b = clamp(b, lo, hi)
                if b > t:
                    b = t
            A.append((x, t))
            B.append((x, b))
        if max(a[1] - b[1] for a, b in zip(A, B)) < 0.5:
            return None
        return A, B

    @staticmethod
    def dash(x, f, wl, ph, sp, bias=0.3):
        """Máscara 0..1 que corta un trazo en tramos con las puntas afinadas."""
        return smooth(clamp(math.sin(TAU * x / wl + ph + sp * f) * 1.5 - bias))

    def steep(self, x, f, which):
        """Cuánto hay que estirar una medida vertical para que, a lo ancho del trazo, mida lo mismo."""
        fn = self.front_y if which == "in" else self.top_y
        slope = (fn(x + 6.0, f) - fn(x - 6.0, f)) / 12.0
        return min(2.2, math.sqrt(1.0 + slope * slope))

    def edge_points(self, f, which):
        fn = self.front_y if which == "in" else self.top_y
        return [(x, fn(x, f)) for x in self.xs]

    @staticmethod
    def edge_normals(pts, down):
        out = []
        n = len(pts)
        for i in range(n):
            x0, y0 = pts[max(0, i - 1)]
            x1, y1 = pts[min(n - 1, i + 1)]
            tx, ty = x1 - x0, y1 - y0
            ln = math.hypot(tx, ty) or 1.0
            nx, ny = ty / ln, -tx / ln          # apunta hacia abajo cuando la tira va de izquierda a derecha
            if not down:
                nx, ny = -nx, -ny
            out.append((nx, ny))
        return out

    def build_strips(self):
        W, H = self.W, self.H
        xs = self.xs

        # Cuerpo del agua
        def body(f):
            if not self.visible(f):
                return None
            A = [(x, self.top_y(x, f) if f >= 28 else H / 2 + self.MY) for x in xs]
            B = [(x, self.front_y(x, f) if f <= 20 else -H / 2 - self.MY) for x in xs]
            return A, B
        self.add_strip("cuerpo", "Agua principal", "agua", Z["cuerpo"], body)

        # Franjas claras del interior (agua secundaria): se mueven con la masa de agua
        bandas = [(0.30, 0.070, 1.3, 760.0, 34.0, 0.11, 1.00), (-0.07, 0.046, 4.4, 620.0, 28.0, -0.13, 1.05),
                  (-0.37, 0.058, 2.6, 880.0, 30.0, 0.09, 0.95)]
        for i, (yc, half, ph, wl, amp, sp, par) in enumerate(bandas):
            def band(f, yc=yc, half=half, ph=ph, wl=wl, amp=amp, sp=sp, par=par):
                yo = yc * H + self.y_int(f) * par
                hh = half * H
                top = lambda x: (yo + hh + amp * ssin(TAU * x / wl + ph + sp * f)
                                 + 0.35 * amp * math.sin(TAU * x / (wl * 0.43) + ph * 2.0 - sp * 1.7 * f))
                bot = lambda x: (yo - hh + 0.8 * amp * ssin(TAU * x / (wl * 1.17) + ph * 3.1 - sp * 0.8 * f)
                                 + 0.3 * amp * math.sin(TAU * x / (wl * 0.37) + ph + sp * 1.3 * f))
                return self.clamped(f, top, bot)
            self.add_strip("franja_%d" % (i + 1), "Agua principal", "agua2", Z["banda"], band)

            # Reflejo fino sobre el borde de arriba de cada franja
            def glint(f, yc=yc, half=half, ph=ph, wl=wl, amp=amp, sp=sp, par=par, i=i):
                yo = yc * H + self.y_int(f) * par
                hh = half * H
                line = lambda x: (yo + hh + amp * ssin(TAU * x / wl + ph + sp * f)
                                  + 0.35 * amp * math.sin(TAU * x / (wl * 0.43) + ph * 2.0 - sp * 1.7 * f) - 20.0)
                bot = lambda x: line(x) - 15.0 * self.dash(x, f, 430.0 + 60.0 * i, ph * 1.7, 0.10 * (1 if i % 2 else -1), 0.45)
                return self.clamped(f, line, bot)
            self.add_strip("reflejo_franja_%d" % (i + 1), "Reflejos", "reflejo", Z["reflejo"], glint)

        # Trazos de sombra del interior
        sombras = [(0.13, 0.9, 540.0, 0.12, 1.02, 30.0), (-0.22, 3.7, 470.0, -0.10, 0.98, 26.0)]
        for i, (yc, ph, wl, sp, par, th) in enumerate(sombras):
            def shade(f, yc=yc, ph=ph, wl=wl, sp=sp, par=par, th=th):
                yo = yc * H + self.y_int(f) * par
                line = lambda x: yo + 24.0 * ssin(TAU * x / 690.0 + ph - sp * f) + 9.0 * math.sin(TAU * x / 230.0 + ph * 2.0 + sp * 2.0 * f)
                bot = lambda x: line(x) - th * self.dash(x, f, wl, ph, sp, 0.2)
                return self.clamped(f, line, bot)
            self.add_strip("sombra_interior_%d" % (i + 1), "Sombras", "sombra", Z["sombra"], shade)

        # --- Frente que entra: labio de sombra, reflejo y contorno ---
        def lip(f):
            if not 7 <= f <= 20:
                return None
            e = self.env_in(f)
            A, B = [], []
            for x in xs:
                y = self.front_y(x, f)
                d = (42.0 + 21.0 * ssin(TAU * x / 330.0 + 1.7 + 0.2 * f) + 8.0 * math.sin(TAU * x / 97.0 + 0.4 * f)) * max(e, 0.35) * self.steep(x, f, "in")
                A.append((x, y + d))
                B.append((x, y))
            return A, B
        self.add_strip("labio_frente", "Sombras", "sombra", Z["sombra"], lip)

        def glint_in(f):
            if not 8 <= f <= 20:
                return None
            e = self.env_in(f)
            A, B = [], []
            for x in xs:
                k = self.steep(x, f, "in")
                y = self.front_y(x, f) + (88.0 + 10.0 * math.sin(TAU * x / 290.0 + 0.3 * f)) * e * k
                th = 16.0 * self.dash(x, f, 300.0, 0.8, -0.12, 0.35) * e * k * smooth((1.75 - k) / 0.45)
                A.append((x, y + th))
                B.append((x, y))
            return A, B
        self.add_strip("reflejo_frente", "Reflejos", "reflejo", Z["reflejo"], glint_in)

        def outline(which):
            def fn(f):
                if which == "in" and not 7 <= f <= 20:
                    return None
                if which == "out" and not 28 <= f <= 46:
                    return None
                pts = self.edge_points(f, which)
                nor = self.edge_normals(pts, down=(which == "in"))
                boil = math.floor(f / 2.0) * 7.3      # el trazo "tiembla" cada dos cuadros
                A, B = [], []
                for (x, y), (nx, ny) in zip(pts, nor):
                    if which == "in":
                        lobe = clamp(0.5 - self.wave_in(x, f) / (2.0 * self.AMP_IN))
                        t = 22.0 * (0.70 + 0.55 * lobe + 0.16 * vnoise(x / 70.0 + boil, 5)) * max(self.env_in(f), 0.5)
                    else:
                        lobe = clamp(0.5 + self.wave_out(x, f) / (2.0 * self.AMP_OUT))
                        t = 20.0 * (0.70 + 0.55 * lobe + 0.16 * vnoise(x / 70.0 + boil, 9))
                    A.append((x + nx * t, y + ny * t))
                    B.append((x - nx * 6.0, y - ny * 6.0))
                return A, B
            return fn
        self.add_strip("contorno_frente", "Contornos", "contorno", Z["contorno"], outline("in"), xy=True)
        self.add_strip("contorno_salida", "Contornos", "contorno", Z["contorno"], outline("out"), xy=True)

        # --- Borde de arriba en la salida: cresta clara, reflejo y sombra ---
        def crest(f):
            if not 28 <= f <= 46:
                return None
            g = self.deco_out(f)
            A, B = [], []
            for x in xs:
                y = self.top_y(x, f)
                d = (46.0 + 20.0 * ssin(TAU * x / 300.0 + 0.6 - 0.22 * f)) * g * self.steep(x, f, "out")
                A.append((x, y))
                B.append((x, y - d))
            return A, B
        self.add_strip("cresta_salida", "Agua principal", "agua2", Z["cresta"], crest)

        def glint_out(f):
            if not 29 <= f <= 46:
                return None
            g = self.deco_out(f)
            A, B = [], []
            for x in xs:
                k = self.steep(x, f, "out")
                y = self.top_y(x, f) - 15.0 * g * k
                A.append((x, y))
                B.append((x, y - 13.0 * g * k * self.dash(x, f, 340.0, 2.2, 0.14, 0.3) * smooth((1.9 - k) / 0.45)))
            return A, B
        self.add_strip("reflejo_salida", "Reflejos", "reflejo", Z["reflejo"], glint_out)

        def shade_out(f):
            if not 29 <= f <= 46:
                return None
            g = self.deco_out(f)
            A, B = [], []
            for x in xs:
                y = self.top_y(x, f) - (118.0 + 26.0 * math.sin(TAU * x / 420.0 + 2.2 + 0.1 * f)) * g
                A.append((x, y))
                B.append((x, y - 34.0 * g * self.dash(x, f, 520.0, 5.0, -0.09, 0.15)))
            return A, B
        self.add_strip("sombra_salida", "Sombras", "sombra", Z["sombra"], shade_out)

    # --- gotas, espuma y burbujas --------------------------------------------------------------
    def add_blob(self, name, zkey, parts, track):
        self.blobs.append(Blob(name, Z[zkey] + 0.0012 * len(self.blobs), parts, track))

    @staticmethod
    def drop_parts(r, seed, mini=False):
        tear = ring_tear(r, 30 if not mini else 20)
        parts = [("relleno", "Gotas", "agua", 0.0, tear),
                 ("contorno", "Contornos", "contorno", -0.0006, ring_offset(tear, 8.0 + 0.10 * r, seed))]
        if not mini:
            parts.append(("sombra", "Sombras", "sombra", 0.0002, ring_crescent(tear, math.radians(235), math.radians(120), 0.10 * r, 0.26 * r)))
        hl = ring_blob(0.17 * r, 12, seed + 3, 0.04)
        parts.append(("reflejo", "Reflejos", "reflejo", 0.0004, [(x * 0.8 + 0.27 * r, y * 1.4 + 0.02 * r) for x, y in hl]))
        return parts

    def build_blobs(self):
        W, H = self.W, self.H
        k = self.fmt == "desktop"

        # Lluvia inicial
        n = 14 if k else 12
        for i in range(n):
            r = 22.0 + 34.0 * rnd(31, i) ** 1.3
            x0 = -W / 2 + (i + 0.5 + 0.7 * (rnd(32, i) - 0.5)) * W / n
            f0 = -1.2 + 5.6 * rnd(33, (i * 5) % n)
            vy = (0.058 + 0.030 * rnd(34, i)) * H
            g = 0.0042 * H
            drift = (rnd(35, i) - 0.5) * 0.004 * H
            track = []
            for f in range(1, FRAMES + 1):
                t = f - f0
                y = H / 2 + 1.9 * r - vy * t - 0.5 * g * t * t
                if t < 0 or y < -H / 2 - 3.2 * r or f > 22:
                    track.append(None)
                    continue
                speed = vy + g * t
                sy = (1.0 + 0.40 * min(1.0, speed / (0.09 * H))) * (1.0 + 0.06 * math.sin(1.7 * f + i))
                pop = 0.62 + 0.38 * smooth(t / 1.6)
                track.append((x0 + drift * t, y, pop / math.sqrt(sy), pop * sy, math.atan2(drift, speed)))
            self.add_blob("gota_%02d" % (i + 1), "gota", self.drop_parts(r, 40 + i), track)

        # Salpicones que el frente tira hacia adelante
        n = 10 if k else 7
        for i in range(n):
            r = 15.0 + 14.0 * rnd(51, i)
            x0 = -W / 2 + (i + 0.5 + 0.8 * (rnd(52, i) - 0.5)) * W / n
            f0 = 8.6 + 4.6 * rnd(53, i)
            y0 = self.front_y(x0, f0) - 14.0
            vfront = self.front_y(x0, f0 + 0.5) - self.front_y(x0, f0 - 0.5)
            vx = (rnd(54, i) - 0.5) * 46.0
            vy = vfront - (26.0 + 44.0 * rnd(55, i))
            track = []
            for f in range(1, FRAMES + 1):
                t = f - f0
                y = y0 + vy * t - 3.0 * t * t
                if t < 0 or y < -H / 2 - 3.0 * r or f > 21:
                    track.append(None)
                    continue
                vyy = vy - 6.0 * t
                sy = 1.0 + 0.30 * min(1.0, abs(vyy) / 160.0)
                pop = smooth(t / 1.2)
                track.append((x0 + vx * t, y, pop / math.sqrt(sy), pop * sy, math.atan2(vx, -vyy)))
            self.add_blob("salpicon_%02d" % (i + 1), "gota", self.drop_parts(r, 60 + i, mini=True), track)

        # Gotas que saltan del borde de arriba cuando el agua se va (vuelven a caer adentro)
        n = 8 if k else 5
        for i in range(n):
            r = 16.0 + 14.0 * rnd(71, i)
            x0 = -W / 2 + (i + 0.5 + 0.7 * (rnd(72, i) - 0.5)) * W / n
            f0 = 30.0 + 6.0 * rnd(73, i)
            v0 = 26.0 + 14.0 * rnd(74, i)
            vx = (rnd(75, i) - 0.5) * 14.0
            track = []
            for f in range(1, FRAMES + 1):
                t = f - f0
                gap = 6.0 + v0 * t - 3.1 * t * t
                if t < 0 or gap < -2.0 * r or f > 46:
                    track.append(None)
                    continue
                x = x0 + vx * t
                rel = v0 - 6.2 * t
                sy = 1.0 + 0.22 * min(1.0, abs(rel) / 40.0)
                pop = smooth(t / 1.2)
                track.append((x, self.top_y(x, f) + gap, pop / math.sqrt(sy), pop * sy, math.atan2(vx, max(rel, 1.0)) * 0.6))
            self.add_blob("gota_salida_%02d" % (i + 1), "gota", self.drop_parts(r, 80 + i, mini=True), track)

        # Burbujas que suben mientras la pantalla está cubierta
        n = 11 if k else 8
        for i in range(n):
            r = 17.0 + 30.0 * rnd(121, i) ** 1.4
            col = (i * 3) % n
            xb = -W / 2 + (col + 0.5 + 0.6 * (rnd(122, i) - 0.5)) * W / n
            yb = (-0.36 + 0.62 * rnd(123, i)) * H
            fs = next((f for f in range(12, 26) if self.front_y(xb, f) < yb - r - 60.0), 25) + 2.0 * rnd(124, i)
            fp = 27.0 + 5.5 * rnd(125, i)
            rise = (0.0042 + 0.0038 * rnd(126, i)) * H
            fill = ring_blob(r, 26, 140 + i, 0.03)
            parts = [("relleno", "Burbujas", "agua2", 0.0, fill),
                     ("contorno", "Contornos", "contorno", -0.0006, ring_offset(fill, 6.5 + 0.06 * r, 140 + i)),
                     ("sombra", "Burbujas", "agua", 0.0002, ring_crescent(fill, math.radians(310), math.radians(130), 0.14 * r, 0.20 * r)),
                     ("reflejo", "Reflejos", "reflejo", 0.0004, ring_crescent(fill, math.radians(135), math.radians(95), 0.20 * r, 0.20 * r))]
            dot = ring_blob(0.11 * r, 10, 160 + i, 0.03)
            parts.append(("brillo", "Reflejos", "reflejo", 0.0005, [(x - 0.20 * r, y + 0.52 * r) for x, y in dot]))
            track = []
            for f in range(1, FRAMES + 1):
                t = f - fs
                if t < 0 or f > fp + 1.0:
                    track.append(None)
                    continue
                x = xb + 7.0 * math.sin(0.8 * f + i)
                y = yb + rise * t + self.mass_d(f)
                if self.hi(x, f) - (y + r + 16.0) < 0:
                    track.append(None)
                    continue
                s = 1.0 - math.exp(-1.1 * t) * math.cos(1.6 * t)
                if f > fp:
                    s *= 1.0 + 0.3 * (f - fp)            # se hincha un cuadro antes de reventar
                wob = 0.05 * math.sin(1.3 * f + 2.0 * i)
                track.append((x, y, s * (1.0 + wob), s * (1.0 - wob), 0.0))
            self.add_blob("burbuja_%02d" % (i + 1), "burbuja", parts, track)

    def build(self):
        self.build_strips()
        self.build_blobs()
        return self

    # --- comprobaciones ------------------------------------------------------------------------
    def check(self):
        W, H = self.W, self.H
        probs = []
        body = self.strips[0]
        for f in range(20, 29):
            A, B = body.frames[f - 1]
            if min(a[1] for a in A) < H / 2 or max(b[1] for b in B) > -H / 2:
                probs.append("cuadro %d: el agua no cubre toda la pantalla" % f)
        for s in self.strips:
            for f in (47, 48):
                if s.frames[f - 1] is not None:
                    probs.append("cuadro %d: %s sigue visible" % (f, s.name))
            for f in range(1, 7):
                fr = s.frames[f - 1]
                if fr is not None and min(min(p[1] for p in fr[0]), min(p[1] for p in fr[1])) < H / 2:
                    probs.append("cuadro %d: %s ya se ve" % (f, s.name))
        for b in self.blobs:
            for f in (47, 48):
                if b.track[f - 1] is not None:
                    probs.append("cuadro %d: %s sigue visible" % (f, b.name))
        lluvia = [b for b in self.blobs if b.name.startswith("gota_") and not b.name.startswith("gota_salida")]
        en_pantalla = sum(1 for b in lluvia if any(b.track[f - 1] is not None and abs(b.track[f - 1][1]) < H / 2 for f in range(1, 8)))
        return {"problemas": probs, "gotas_de_lluvia": len(lluvia), "gotas_en_pantalla_1_a_7": en_pantalla,
                "tiras": len(self.strips), "figuras": len(self.blobs), "columnas": len(self.xs)}

    # --- bake vectorial para la app ------------------------------------------------------------
    def bake(self, step=2):
        W, H = self.W, self.H
        ci = {name: i for i, name in enumerate(PAL_ORDER)}
        cols = list(range(0, len(self.xs), step))
        px = lambda x: int(round(x + W / 2))
        py = lambda y: int(round(H / 2 - y))
        layers, tracks = [], []
        for s in self.strips:
            fr = []
            for frame in s.frames:
                if frame is None:
                    fr.append(None)
                    continue
                A, B = frame
                if s.xy:
                    fr.append([v for i in cols for v in (px(A[i][0]), py(A[i][1]))] + [v for i in cols for v in (px(B[i][0]), py(B[i][1]))])
                else:
                    fr.append([py(A[i][1]) for i in cols] + [py(B[i][1]) for i in cols])
            layers.append((s.z, {"t": "xy" if s.xy else "y", "c": ci[s.color], "f": fr}))
        for b in self.blobs:
            tr = [None if t is None else [px(t[0]), py(t[1]), int(round(t[2] * 100)), int(round(t[3] * 100)), int(round(-math.degrees(t[4]) * 10))]
                  for t in b.track]
            tracks.append(tr)
            for (_suf, _coll, color, dz, ring) in b.parts:
                layers.append((b.z + dz, {"t": "b", "c": ci[color], "k": len(tracks) - 1,
                                          "r": [v for (x, y) in ring for v in (int(round(x * 4)), int(round(-y * 4)))]}))
        layers.sort(key=lambda it: it[0])
        return {"w": W, "h": H, "fps": FPS, "frames": FRAMES, "pal": [PAL[n] for n in PAL_ORDER],
                "x": [px(self.xs[i]) for i in cols], "layers": [l for _z, l in layers], "tracks": tracks}


# ----------------------------------------------------------------------------------------------
# Blender
# ----------------------------------------------------------------------------------------------
def srgb_to_linear(hexcol):
    out = []
    for i in (1, 3, 5):
        c = int(hexcol[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out + [1.0]


def get_material(bpy, key):
    name = "Agua · " + {"agua": "agua principal", "agua2": "agua secundaria", "sombra": "sombras",
                        "reflejo": "reflejos", "contorno": "contornos"}[key]
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = srgb_to_linear(PAL[key])
    em.inputs["Strength"].default_value = 1.0
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (220, 0)
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    mat.diffuse_color = srgb_to_linear(PAL[key])      # para la vista sólida
    return mat


def remove_scene(bpy, name):
    sc = bpy.data.scenes.get(name)
    if sc is None:
        return
    objs = list(sc.collection.all_objects)
    colls = list(sc.collection.children_recursive)
    datas = [o.data for o in objs if o.data is not None]
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    for d in datas:
        if d.users == 0:
            if d.__class__.__name__ == "Mesh":
                bpy.data.meshes.remove(d)
            elif d.__class__.__name__ == "Camera":
                bpy.data.cameras.remove(d)
    for c in colls:
        bpy.data.collections.remove(c)
    if len(bpy.data.scenes) > 1:
        bpy.data.scenes.remove(sc)


def build_scene(bpy, fmt, model):
    W, H = model.W, model.H
    sname = "Agua_" + fmt.capitalize()
    remove_scene(bpy, sname)
    scene = bpy.data.scenes.get(sname) or bpy.data.scenes.new(sname)
    tag = "M" if fmt == "mobile" else "D"

    colls = {}
    for i, cname in enumerate(COLECCIONES):
        c = bpy.data.collections.new("%s · %02d %s" % (tag, i + 1, cname))
        scene.collection.children.link(c)
        colls[cname] = c
    mats = {k: get_material(bpy, k) for k in PAL_ORDER}

    # Cámara ortográfica fija
    cam = bpy.data.cameras.new("%s.camara" % tag)
    cam.type = "ORTHO"
    cam.ortho_scale = max(W, H) * PX
    cam.clip_start, cam.clip_end = 0.1, 100.0
    cam_ob = bpy.data.objects.new("%s.camara" % tag, cam)
    cam_ob.location = (0.0, 0.0, 10.0)
    scene.collection.objects.link(cam_ob)
    scene.camera = cam_ob

    # Render
    r = scene.render
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            r.engine = eng
            break
        except Exception:
            continue
    r.resolution_x, r.resolution_y, r.resolution_percentage = W, H, 100
    r.fps, r.fps_base = FPS, 1.0
    r.film_transparent = True
    r.filter_size = 1.2
    r.dither_intensity = 0.0
    scene.frame_start, scene.frame_end = 1, FRAMES
    try:
        scene.eevee.taa_render_samples = 24
        scene.eevee.taa_samples = 8
    except Exception:
        pass
    scene.display_settings.display_device = "sRGB"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure, scene.view_settings.gamma = 0.0, 1.0

    hidden_co = (0.0, -3.0 * H * PX, 0.0)

    # Tiras: malla de dos filas con una shape key absoluta por cuadro
    for s in model.strips:
        first = next((fr for fr in s.frames if fr is not None), None)
        if first is None:
            continue
        m = len(first[0])
        mesh = bpy.data.meshes.new("%s.%s" % (tag, s.name))
        verts = [hidden_co] * (2 * m)
        faces = [(i, i + 1, m + i + 1, m + i) for i in range(m - 1)]
        mesh.from_pydata(verts, [], faces)
        mesh.materials.append(mats[s.color])
        ob = bpy.data.objects.new("%s.%s" % (tag, s.name), mesh)
        ob.location = (0.0, 0.0, s.z)
        colls[s.coll].objects.link(ob)
        ob.shape_key_add(name="base", from_mix=False)
        blocks = []
        for f in range(1, FRAMES + 1):
            kb = ob.shape_key_add(name="c%02d" % f, from_mix=False)
            fr = s.frames[f - 1]
            if fr is None:
                flat = list(hidden_co) * (2 * m)
            else:
                flat = []
                for (x, y) in fr[0]:
                    flat.extend((x * PX, y * PX, 0.0))
                for (x, y) in fr[1]:
                    flat.extend((x * PX, y * PX, 0.0))
            kb.data.foreach_set("co", flat)
            kb.interpolation = "KEY_LINEAR"
            blocks.append(kb)
        key = mesh.shape_keys
        key.use_relative = False
        for f, kb in enumerate(blocks, start=1):
            key.eval_time = kb.frame
            key.keyframe_insert("eval_time", frame=f)
        mesh.update()

    # Figuras: polígonos fijos; se anima la raíz (posición, escala y giro)
    for b in model.blobs:
        root = None
        for (suf, coll, color, dz, ring) in b.parts:
            mesh = bpy.data.meshes.new("%s.%s.%s" % (tag, b.name, suf))
            mesh.from_pydata([(x * PX, y * PX, dz) for (x, y) in ring], [], [tuple(range(len(ring)))])
            mesh.materials.append(mats[color])
            ob = bpy.data.objects.new("%s.%s.%s" % (tag, b.name, suf), mesh)
            colls[coll].objects.link(ob)
            if root is None:
                root = ob
            else:
                ob.parent = root
        for f in range(1, FRAMES + 1):
            t = b.track[f - 1]
            if t is None:
                root.location = (0.0, -3.0 * H * PX, b.z)
                root.scale = (0.0, 0.0, 1.0)
                root.rotation_euler = (0.0, 0.0, 0.0)
            else:
                root.location = (t[0] * PX, t[1] * PX, b.z)
                root.scale = (t[2], t[3], 1.0)
                root.rotation_euler = (0.0, 0.0, t[4])
            root.keyframe_insert("location", frame=f)
            root.keyframe_insert("scale", frame=f)
            root.keyframe_insert("rotation_euler", index=2, frame=f)
    scene.frame_set(24)
    return scene


def set_output_png(scene, path_prefix):
    r = scene.render
    try:
        r.image_settings.media_type = "IMAGE"
    except Exception:
        pass
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGBA"
    r.image_settings.color_depth = "8"
    r.image_settings.compression = 70
    r.filepath = path_prefix
    r.use_file_extension = True


def render_stills(bpy, scene, frames, outdir, percent=100):
    os.makedirs(outdir, exist_ok=True)
    scene.render.resolution_percentage = percent
    out = []
    set_output_png(scene, os.path.join(outdir, "%s_" % scene.name.lower()))
    for f in frames:
        scene.frame_start = scene.frame_end = f
        bpy.ops.render.render(animation=True, scene=scene.name)
        out.append("%s%04d.png" % (scene.render.filepath, f))
    scene.frame_start, scene.frame_end = 1, FRAMES
    scene.render.resolution_percentage = 100
    return out


def render_png_sequence(bpy, scene, outdir, fmt, percent=100):
    os.makedirs(outdir, exist_ok=True)
    scene.render.resolution_percentage = percent
    set_output_png(scene, os.path.join(outdir, "riego_%s_" % fmt))
    bpy.ops.render.render(animation=True, scene=scene.name)
    scene.render.resolution_percentage = 100


def render_webm(bpy, scene, path, crf="LOW"):
    r = scene.render
    r.resolution_percentage = 100
    try:
        r.image_settings.media_type = "VIDEO"
    except Exception:
        pass
    r.image_settings.file_format = "FFMPEG"
    r.ffmpeg.format = "WEBM"
    r.ffmpeg.codec = "WEBM"
    r.image_settings.color_mode = "RGBA"
    r.ffmpeg.constant_rate_factor = crf
    r.ffmpeg.ffmpeg_preset = "GOOD"
    r.ffmpeg.gopsize = 12
    r.ffmpeg.audio_codec = "NONE"
    r.filepath = path
    r.use_file_extension = False
    bpy.ops.render.render(animation=True, scene=scene.name)


def render_preview(bpy, fmt, png_dir, path):
    """Video opaco sobre un damero cálido, para ver bien la transparencia y los contornos."""
    import numpy as np
    W, H = FORMATS[fmt]
    cell = 60
    yy, xx = np.mgrid[0:H, 0:W]
    mask = ((xx // cell + yy // cell) % 2).astype(np.float32)[..., None]
    a = np.array(srgb_to_linear("#F4845F"), dtype=np.float32)
    b = np.array(srgb_to_linear("#F7B267"), dtype=np.float32)
    px = a * (1.0 - mask) + b * mask
    img = bpy.data.images.new("damero_" + fmt, W, H, alpha=False)
    img.pixels.foreach_set(px.ravel())
    bg_path = os.path.join(os.path.dirname(path), "damero_%s.png" % fmt)
    img.filepath_raw = bg_path
    img.file_format = "PNG"
    img.save()

    sc = bpy.data.scenes.new("preview_" + fmt)
    r = sc.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = W, H, 100
    r.fps, r.fps_base = FPS, 1.0
    sc.frame_start, sc.frame_end = 1, FRAMES
    sc.display_settings.display_device = "sRGB"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    se = sc.sequence_editor_create()
    strips = se.strips if hasattr(se, "strips") else se.sequences
    bg = strips.new_image("fondo", bg_path, 1, 1)
    bg.frame_final_duration = FRAMES
    names = ["riego_%s_%04d.png" % (fmt, f) for f in range(1, FRAMES + 1)]
    seq = strips.new_image("agua", os.path.join(png_dir, names[0]), 2, 1)
    for nme in names[1:]:
        seq.elements.append(nme)
    seq.blend_type = "ALPHA_OVER"
    try:
        seq.alpha_mode = "STRAIGHT"
    except Exception:
        pass
    try:
        r.image_settings.media_type = "VIDEO"
    except Exception:
        pass
    r.image_settings.file_format = "FFMPEG"
    r.ffmpeg.format = "MPEG4"
    r.ffmpeg.codec = "H264"
    r.ffmpeg.constant_rate_factor = "HIGH"
    r.ffmpeg.audio_codec = "NONE"
    r.filepath = path
    r.use_file_extension = False
    bpy.ops.render.render(animation=True, scene=sc.name)
    bpy.data.scenes.remove(sc)


def show_in_viewport(bpy, scene):
    """En un Blender abierto: muestra la escena desde la cámara, con los colores del material."""
    try:
        for win in bpy.context.window_manager.windows:
            win.scene = scene
            for area in win.screen.areas:
                if area.type == "VIEW_3D":
                    for space in area.spaces:
                        if space.type == "VIEW_3D":
                            space.region_3d.view_perspective = "CAMERA"
                            space.shading.type = "MATERIAL"
                            space.overlay.show_overlays = False
    except Exception as ex:                                   # sin ventana no hay nada que mostrar
        return str(ex)
    return "ok"


def main(mode, opts):
    import bpy
    prefs = bpy.context.preferences.edit
    old_interp = prefs.keyframe_new_interpolation_type
    prefs.keyframe_new_interpolation_type = "LINEAR"
    result = {"blender": bpy.app.version_string, "modo": mode, "formatos": {}}
    try:
        formats = opts.get("formats") or list(FORMATS)
        scenes = {}
        for fmt in formats:
            model = Agua(fmt).build()
            info = model.check()
            if opts.get("no_build"):
                scenes[fmt] = bpy.data.scenes["Agua_" + fmt.capitalize()]
            else:
                scenes[fmt] = build_scene(bpy, fmt, model)
            info["escena"] = scenes[fmt].name
            info["objetos"] = len(scenes[fmt].collection.all_objects)
            result["formatos"][fmt] = info
            if opts.get("bake"):
                os.makedirs(opts["bake"], exist_ok=True)
                p = os.path.join(opts["bake"], "riego-%s.bake.json" % fmt)
                with open(p, "w", encoding="utf-8") as fh:
                    json.dump(model.bake(), fh, separators=(",", ":"))
                info["bake"] = [p, os.path.getsize(p)]
    finally:
        prefs.keyframe_new_interpolation_type = old_interp

    if mode == "cli":
        # Archivo limpio: solo quedan las escenas del agua
        for sc in list(bpy.data.scenes):
            if sc.name not in [s.name for s in scenes.values()] and len(bpy.data.scenes) > 1:
                bpy.data.scenes.remove(sc)
        try:
            bpy.data.orphans_purge(do_recursive=True)
        except Exception:
            pass
        if opts.get("blend"):
            bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(opts["blend"]), compress=True)
            result["blend"] = os.path.abspath(opts["blend"])
    elif not opts.get("no_build"):
        result["vista"] = show_in_viewport(bpy, scenes[formats[0]])

    out = opts.get("out")
    render = opts.get("render") or []
    pct = int(opts.get("percent") or 100)
    for fmt in formats:
        sc = scenes[fmt]
        if opts.get("stills"):
            result["formatos"][fmt]["stills"] = render_stills(bpy, sc, opts["stills"], os.path.join(out, "prueba"), pct)
        if "png" in render:
            render_png_sequence(bpy, sc, os.path.join(out, fmt, "png" if pct == 100 else "png_%d" % pct), fmt, pct)
        if "webm" in render:
            render_webm(bpy, sc, os.path.join(out, "riego-%s.webm" % fmt), opts.get("crf") or "LOW")
        if "preview" in render:
            render_preview(bpy, fmt, os.path.join(out, fmt, "png"), os.path.join(out, "preview-%s.mp4" % fmt))
    return result


def parse_cli(argv):
    opts, it = {}, iter(argv)
    for a in it:
        if a == "--blend":
            opts["blend"] = next(it)
        elif a == "--out":
            opts["out"] = os.path.abspath(next(it))
        elif a == "--bake":
            opts["bake"] = os.path.abspath(next(it))
        elif a == "--render":
            opts["render"] = [s for s in next(it).split(",") if s]
        elif a == "--formats":
            opts["formats"] = [s for s in next(it).split(",") if s]
        elif a == "--stills":
            opts["stills"] = [int(s) for s in next(it).split(",") if s]
        elif a == "--crf":
            opts["crf"] = next(it)
        elif a == "--percent":
            opts["percent"] = int(next(it))
    return opts


AT_MODE = globals().get("AT_MODE") or ("cli" if "--" in sys.argv else "live")
if AT_MODE == "cli":
    RESULT = main("cli", parse_cli(sys.argv[sys.argv.index("--") + 1:]))
    print("RESULTADO " + json.dumps(RESULT, ensure_ascii=False))
elif AT_MODE == "live":
    RESULT = main("live", globals().get("AT_OPTS") or {})
