"""Place DFD nodes by simulated annealing, then write a spec with ports chosen from geometry.
usage: anneal.py spec_in.py spec_out.py [iters] [seed] [start_temp]"""
import sys, random, math, importlib.util

spec_in, spec_out = sys.argv[1], sys.argv[2]
iters = int(sys.argv[3]) if len(sys.argv) > 3 else 60000
seed = int(sys.argv[4]) if len(sys.argv) > 4 else 1
random.seed(seed)
ns = {}
exec(open(spec_in, encoding='utf-8').read(), ns)
W, H, N, F = ns['W'], ns['H'], ns['N'], ns['F']
FIXED = ns.get('FIXED', {})  # node -> (cx, cy) pinned
SNAP = 30
MARGIN = 70
pairs = sorted({tuple(sorted((s, t))) for s, t, *_ in F})
ids = list(N)
pos = {n: [N[n][1], N[n][2]] for n in ids}
size = {n: (N[n][3] + 150, N[n][4] + 130) for n in ids}


def box(n, c=None):
    c = c or pos[n]
    w, h = size[n]
    return c[0] - w / 2, c[1] - h / 2, c[0] + w / 2, c[1] + h / 2


def inter(p1, p2, p3, p4):
    def o(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    d1, d2, d3, d4 = o(p3, p4, p1), o(p3, p4, p2), o(p1, p2, p3), o(p1, p2, p4)
    return d1 * d2 < 0 and d3 * d4 < 0


def seg_box(a, b, r):
    # does segment a-b pass through rect r (shrunk slightly)?
    x0, y0, x1, y1 = r[0] + 8, r[1] + 8, r[2] - 8, r[3] - 8
    lo, hi = 0.0, 1.0
    dx, dy = b[0] - a[0], b[1] - a[1]
    for p, q in ((-dx, a[0] - x0), (dx, x1 - a[0]), (-dy, a[1] - y0), (dy, y1 - a[1])):
        if p == 0:
            if q < 0:
                return False
        else:
            t = q / p
            if p < 0:
                lo = max(lo, t)
            else:
                hi = min(hi, t)
            if lo > hi:
                return False
    return True


def cost():
    c = 0.0
    segs = [(pos[a], pos[b], a, b) for a, b in pairs]
    for i in range(len(segs)):
        a1, b1, s1, t1 = segs[i]
        c += (2.2 if 's' in (N[s1][5], N[t1][5]) else 0.4) * (abs(a1[0] - b1[0]) + abs(a1[1] - b1[1]))
        for j in range(i + 1, len(segs)):
            a2, b2, s2, t2 = segs[j]
            if len({s1, t1, s2, t2}) == 4 and inter(a1, b1, a2, b2):
                c += 1500
        for n in ids:
            if n != s1 and n != t1 and seg_box(a1, b1, box(n)):
                c += 2500
    return c


def valid(n):
    x0, y0, x1, y1 = box(n)
    if x0 < 40 or x1 > W - 40 or y0 < 130 or y1 > H - 40:
        return False
    for m in ids:
        if m != n:
            a, b = box(n), box(m)
            if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                return False
    return True


# initial: random grid scatter
for n in ids:
    if n in FIXED:
        pos[n] = list(FIXED[n])
        continue
    for _ in range(500):
        pos[n] = [random.randrange(200, W - 200, SNAP), random.randrange(200, H - 150, SNAP)]
        if valid(n):
            break
cur = cost()
best = (cur, {n: list(p) for n, p in pos.items()})
T0 = float(sys.argv[5]) if len(sys.argv) > 5 else 4000.0   # start temperature; use a small value to refine a good layout
for it in range(iters):
    T = T0 * (1 - it / iters) ** 2 + 5
    n = random.choice(ids)
    if n in FIXED:
        continue
    old = list(pos[n])
    if random.random() < 0.1:
        m = random.choice(ids)
        if m in FIXED or m == n:
            continue
        om = list(pos[m])
        pos[n], pos[m] = om, old
        if valid(n) and valid(m):
            new = cost()
            if new < cur or random.random() < math.exp((cur - new) / T):
                cur = new
                if cur < best[0]:
                    best = (cur, {k: list(v) for k, v in pos.items()})
                continue
        pos[n], pos[m] = old, om
        continue
    if random.random() < 0.15:
        pos[n] = [random.randrange(200, W - 200, SNAP), random.randrange(200, H - 150, SNAP)]
    else:
        r = random.choice((60, 120, 300))
        pos[n] = [old[0] + random.randrange(-r, r + 1, SNAP), old[1] + random.randrange(-r, r + 1, SNAP)]
    if not valid(n):
        pos[n] = old
        continue
    new = cost()
    if new < cur or random.random() < math.exp((cur - new) / T):
        cur = new
        if cur < best[0]:
            best = (cur, {k: list(v) for k, v in pos.items()})
    else:
        pos[n] = old
    if it % 5000 == 0:
        print(it, round(cur), round(best[0]), flush=True)
pos = best[1]
print('best cost', round(best[0]))


def side(a, b):
    dx, dy = pos[b][0] - pos[a][0], pos[b][1] - pos[a][1]
    if abs(dx) * 0.7 >= abs(dy):
        return ('R', 'L') if dx > 0 else ('L', 'R')
    return ('B', 'T') if dy > 0 else ('T', 'B')


out = []
for k, v in ns.items():
    if k in ('N', 'F') or k.startswith('__') or k in ('random',):
        continue
    out.append(f'{k} = {v!r}')
out.append('N = {')
for n, (label, _, _, w, h, kind) in N.items():
    out.append(f'    {n!r}: ({label!r}, {pos[n][0]}, {pos[n][1]}, {w}, {h}, {kind!r}),')
out.append('}')
out.append('F = [')
for s, t, label, *_ in F:
    ss, ts = side(s, t)
    out.append(f'    ({s!r}, {t!r}, {label!r}, {ss!r}, {ts!r}),')
out.append(']')
open(spec_out, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
