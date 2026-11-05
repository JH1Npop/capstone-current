"""Hub-and-ring placement for a DFD spec: one hub entity in the centre, processes on an inner ring, data stores on a
middle ring, the other external entities on an outer ring. Angles are searched by simulated annealing against straight
line crossings, lines through boxes, overlapping boxes and total length. Writes a spec (positions only changed).

usage: ring_layout.py spec_in spec_out [iterations] [seed] [hub]
"""
import math
import random
import re
import sys

spec_in, spec_out = sys.argv[1], sys.argv[2]
iterations = int(sys.argv[3]) if len(sys.argv) > 3 else 60000
random.seed(int(sys.argv[4]) if len(sys.argv) > 4 else 1)
hub = sys.argv[5] if len(sys.argv) > 5 else 'admin'

ns = {}
exec(open(spec_in, encoding='utf-8').read(), ns)
N, F = ns['N'], ns['F']
kind = {n: v[5] for n, v in N.items()}
size = {n: (v[3], v[4]) for n, v in N.items()}
nodes = [n for n in N if n != hub]
pairs = sorted({tuple(sorted((s, t))) for s, t, *_ in F})
edges = [(a, b) for a, b in pairs]
incident = {n: [i for i, (a, b) in enumerate(edges) if n in (a, b)] for n in N}

RADIUS = {'p': 620.0, 's': 1080.0, 'e': 1500.0, 'x': 620.0}
SX = 1.55
CX = CY = 0.0
ang = {n: random.uniform(0, 2 * math.pi) for n in nodes}
pos = {hub: (CX, CY)}


def place(n):
    r = RADIUS[kind[n]]
    pos[n] = (CX + r * math.cos(ang[n]) * SX, CY + r * math.sin(ang[n]))


for n in nodes:
    place(n)


def seg_cross(p1, p2, p3, p4):
    d1 = (p2[0] - p1[0], p2[1] - p1[1])
    d2 = (p4[0] - p3[0], p4[1] - p3[1])
    den = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(den) < 1e-9:
        return False
    t = ((p3[0] - p1[0]) * d2[1] - (p3[1] - p1[1]) * d2[0]) / den
    u = ((p3[0] - p1[0]) * d1[1] - (p3[1] - p1[1]) * d1[0]) / den
    return 0.02 < t < 0.98 and 0.02 < u < 0.98


def hits_box(a, b, n):
    """Does the straight line a-b pass through the (padded) box of node n?"""
    cx, cy = pos[n]
    hw, hh = size[n][0] / 2 + 25, size[n][1] / 2 + 25
    for k in range(1, 12):
        f = k / 12
        x, y = a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f
        if abs(x - cx) < hw and abs(y - cy) < hh:
            return True
    return False


def overlap(n, m):
    return (abs(pos[n][0] - pos[m][0]) < (size[n][0] + size[m][0]) / 2 + 70 and
            abs(pos[n][1] - pos[m][1]) < (size[n][1] + size[m][1]) / 2 + 70)


def local_cost(m):
    """Cost terms that involve node m."""
    cost = 0.0
    inc = set(incident[m])
    for i in inc:
        a, b = edges[i]
        pa, pb = pos[a], pos[b]
        cost += 0.01 * (abs(pa[0] - pb[0]) + abs(pa[1] - pb[1]))
        for j, (c, d) in enumerate(edges):
            if j == i or (j in inc and j < i):
                continue
            if len({a, b, c, d}) == 4 and seg_cross(pa, pb, pos[c], pos[d]):
                cost += 100
        for n in N:
            if n not in (a, b) and hits_box(pa, pb, n):
                cost += 60
    for i, (c, d) in enumerate(edges):
        if i in inc or m in (c, d):
            continue
        if hits_box(pos[c], pos[d], m):
            cost += 60
    for n in N:
        if n != m and overlap(n, m):
            cost += 300
    return cost


def total_cost():
    cost = 0.0
    for i, (a, b) in enumerate(edges):
        pa, pb = pos[a], pos[b]
        cost += 0.01 * (abs(pa[0] - pb[0]) + abs(pa[1] - pb[1]))
        for j in range(i + 1, len(edges)):
            c, d = edges[j]
            if len({a, b, c, d}) == 4 and seg_cross(pa, pb, pos[c], pos[d]):
                cost += 100
        for n in N:
            if n not in (a, b) and hits_box(pa, pb, n):
                cost += 60
    names = list(N)
    for i, n in enumerate(names):
        for m in names[i + 1:]:
            if overlap(n, m):
                cost += 300
    return cost


def crossings():
    count = 0
    for i, (a, b) in enumerate(edges):
        for j in range(i + 1, len(edges)):
            c, d = edges[j]
            if len({a, b, c, d}) == 4 and seg_cross(pos[a], pos[b], pos[c], pos[d]):
                count += 1
    return count


cur = total_cost()
best, best_ang = cur, dict(ang)
for it in range(iterations):
    temp = 300 * (1 - it / iterations) ** 2 + 4
    if random.random() < 0.1:
        a_n, b_n = random.sample(nodes, 2)
        if kind[a_n] != kind[b_n]:
            continue
        ang[a_n], ang[b_n] = ang[b_n], ang[a_n]
        place(a_n)
        place(b_n)
        new = total_cost()
        if new <= cur or random.random() < math.exp((cur - new) / temp):
            cur = new
        else:
            ang[a_n], ang[b_n] = ang[b_n], ang[a_n]
            place(a_n)
            place(b_n)
    else:
        m = random.choice(nodes)
        before = local_cost(m)
        old = ang[m]
        ang[m] = old + random.gauss(0, 0.5 * (1 - it / iterations) + 0.05)
        place(m)
        after = local_cost(m)
        if after <= before or random.random() < math.exp((before - after) / temp):
            cur += after - before
        else:
            ang[m] = old
            place(m)
    if cur < best - 1e-6:
        best, best_ang = cur, dict(ang)
    if it % 5000 == 0:
        print(f'it {it} cost {cur:.0f} best {best:.0f}', flush=True)

for n in nodes:
    ang[n] = best_ang[n]
    place(n)
print('final crossings (straight lines):', crossings(), 'cost', round(best))

# write the spec with new centres, snapped to the routing grid, on a canvas with margin
xs = [pos[n][0] - size[n][0] / 2 for n in N]
xe = [pos[n][0] + size[n][0] / 2 for n in N]
ys = [pos[n][1] - size[n][1] / 2 for n in N]
ye = [pos[n][1] + size[n][1] / 2 for n in N]
MARGIN = 350
ox, oy = MARGIN - min(xs), MARGIN + 60 - min(ys)
text = open(spec_in, encoding='utf-8').read()
text = re.sub(r'^W = \d+', f'W = {int(max(xe) - min(xs) + 2 * MARGIN)}', text, count=1, flags=re.M)
text = re.sub(r'^H = \d+', f'H = {int(max(ye) - min(ys) + 2 * MARGIN + 120)}', text, count=1, flags=re.M)


def move(m):
    n = m.group(1)
    x = round((pos[n][0] + ox) / 30) * 30
    y = round((pos[n][1] + oy) / 30) * 30
    return f"    '{n}': {m.group(2)}{x}, {y}"


text = re.sub(r"    '(\w+)': (\((?:'[^']*'|\"[^\"]*\"), )(-?\d+), (-?\d+)", move, text)
open(spec_out, 'w', encoding='utf-8', newline='\n').write(text)
print('wrote', spec_out)
