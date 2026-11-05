"""Render a DFD fragment to SVG and run geometry checks. usage: check.py frag.txt out_prefix"""
import sys, re, html
import xml.etree.ElementTree as ET

raw = open(sys.argv[1], encoding='utf-8').read()
first, body = raw.split('\n', 1)
W, H = map(int, first.split())
root = ET.fromstring('<root>' + body + '</root>')
shapes, edges = {}, []
for c in root.iter('mxCell'):
    g = c.find('mxGeometry')
    st = c.get('style') or ''
    if c.get('vertex') and g is not None:
        shapes[c.get('id')] = dict(x=float(g.get('x')), y=float(g.get('y')), w=float(g.get('width')), h=float(g.get('height')),
                                   label=re.sub('<br>', ' ', html.unescape(c.get('value') or '')), style=st)
    elif c.get('edge'):
        edges.append(c)


def sval(st, k):
    m = re.search(k + r'=([^;]+)', st)
    return float(m.group(1)) if m else None


paths = []
for e in edges:
    s, t = shapes[e.get('source')], shapes[e.get('target')]
    st = e.get('style')
    p0 = (s['x'] + sval(st, 'exitX') * s['w'], s['y'] + sval(st, 'exitY') * s['h'])
    p1 = (t['x'] + sval(st, 'entryX') * t['w'], t['y'] + sval(st, 'entryY') * t['h'])
    pts = [p0] + [(float(p.get('x')), float(p.get('y'))) for p in e.iter('mxPoint') if p.get('as') != 'offset'] + [p1]
    pts = [(round(x), round(y)) for x, y in pts]
    g = e.find('mxGeometry')
    paths.append(dict(id=e.get('id'), src=e.get('source'), dst=e.get('target'), label=html.unescape(e.get('value') or ''), pts=pts,
                      rel=float(g.get('x') or 0)))


def segs(p):
    return list(zip(p['pts'], p['pts'][1:]))


# --- checks ---
issues = []
# edge passes through a shape that is neither endpoint
for p in paths:
    for (a, b) in segs(p):
        for sid, s in shapes.items():
            if sid in ('title',) or sid in (p['src'], p['dst']):
                if sid == 'title':
                    pass
                else:
                    continue
            x0, x1 = sorted((a[0], b[0])); y0, y1 = sorted((a[1], b[1]))
            if x0 < s['x'] + s['w'] and x1 > s['x'] and y0 < s['y'] + s['h'] and y1 > s['y']:
                issues.append(f"edge {p['id']} ({p['src']}->{p['dst']}) crosses shape {sid}")
# collinear overlap between different edges
def overlap(a, b, c, d):
    if a[0] == b[0] == c[0] == d[0]:
        lo, hi = max(min(a[1], b[1]), min(c[1], d[1])), min(max(a[1], b[1]), max(c[1], d[1]))
        return hi - lo > 1
    if a[1] == b[1] == c[1] == d[1]:
        lo, hi = max(min(a[0], b[0]), min(c[0], d[0])), min(max(a[0], b[0]), max(c[0], d[0]))
        return hi - lo > 1
    return False


def cross(a, b, c, d):
    # a-b horizontal, c-d vertical (or vice versa), proper interior intersection
    if a[1] == b[1] and c[0] == d[0]:
        return min(a[0], b[0]) < c[0] < max(a[0], b[0]) and min(c[1], d[1]) < a[1] < max(c[1], d[1])
    if a[0] == b[0] and c[1] == d[1]:
        return cross(c, d, a, b)
    return False


crossings = 0
for i in range(len(paths)):
    for j in range(i + 1, len(paths)):
        for (a, b) in segs(paths[i]):
            for (c, d) in segs(paths[j]):
                if overlap(a, b, c, d):
                    issues.append(f"overlap {paths[i]['id']} / {paths[j]['id']}")
                if cross(a, b, c, d):
                    crossings += 1
diag = sum(1 for p in paths for (a, b) in segs(p) if a[0] != b[0] and a[1] != b[1])
out = sum(1 for s in shapes.values() if s['x'] < 0 or s['y'] < 0 or s['x'] + s['w'] > W or s['y'] + s['h'] > H)
sh = list(shapes.items())
for i in range(len(sh)):
    for j in range(i + 1, len(sh)):
        a, b = sh[i][1], sh[j][1]
        if a['x'] < b['x'] + b['w'] and b['x'] < a['x'] + a['w'] and a['y'] < b['y'] + b['h'] and b['y'] < a['y'] + a['h']:
            issues.append(f"shape overlap {sh[i][0]} / {sh[j][0]}")
print(f"shapes={len(shapes)} flows={len(paths)} crossings={crossings} diagonal_segments={diag} outside_page={out}")
print('issues:', len(issues))
for x in sorted(set(issues))[:40]:
    print('  ', x)

# --- svg ---
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><rect width="100%" height="100%" fill="white"/>',
       '<defs><marker id="a" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#6B7280"/></marker></defs>']
for sid, s in shapes.items():
    st = s['style']
    fill = re.search(r'fillColor=(#[0-9A-Fa-f]+)', st); stroke = re.search(r'strokeColor=(#[0-9A-Fa-f]+)', st)
    if 'text;' in st:
        svg.append(f'<text x="{s["x"] + s["w"] / 2}" y="{s["y"] + 40}" text-anchor="middle" font-size="30" font-weight="bold" font-family="Arial">{html.escape(s["label"])}</text>')
        continue
    svg.append(f'<rect x="{s["x"]}" y="{s["y"]}" width="{s["w"]}" height="{s["h"]}" fill="{fill.group(1) if fill else "#fff"}" stroke="{stroke.group(1) if stroke else "#000"}" stroke-width="2.5"/>')
    words = s['label']
    mid = len(words) // 2
    if len(words) > 24:
        cut = words.rfind(' ', 0, mid + 8)
        lines = [words[:cut], words[cut + 1:]]
    else:
        lines = [words]
    for k, ln in enumerate(lines):
        svg.append(f'<text x="{s["x"] + s["w"] / 2}" y="{s["y"] + s["h"] / 2 + 5 + (k - (len(lines) - 1) / 2) * 16}" text-anchor="middle" font-size="13" font-family="Arial">{html.escape(ln)}</text>')
for p in paths:
    d = 'M' + ' L'.join(f'{x},{y}' for x, y in p['pts'])
    svg.append(f'<path d="{d}" fill="none" stroke="#6B7280" stroke-width="1.4" marker-end="url(#a)"/>')
for p in paths:
    total = [abs(b[0] - a[0]) + abs(b[1] - a[1]) for a, b in segs(p)]
    tgt = (p['rel'] + 1) / 2 * sum(total)
    acc = 0
    for (a, b), L in zip(segs(p), total):
        if acc + L >= tgt:
            f = (tgt - acc) / (L or 1)
            x, y = a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f
            break
        acc += L
    svg.append(f'<text x="{x}" y="{y + 4}" text-anchor="middle" font-size="11" font-family="Arial" stroke="white" stroke-width="4" paint-order="stroke">{html.escape(p["label"])}</text>')
svg.append('</svg>')
open(sys.argv[2] + '.svg', 'w', encoding='utf-8').write(''.join(svg))
