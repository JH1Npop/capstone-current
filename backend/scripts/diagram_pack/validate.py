"""Structural + modeling validation of the four-page file. usage: validate.py file.drawio schema.dbml"""
import sys, re, html
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

path, dbml = sys.argv[1], sys.argv[2]
root = ET.parse(path).getroot()
pages = list(root.findall('diagram'))
fails = []
print('pages:', len(pages), [p.get('name') for p in pages])
if len(pages) != 4:
    fails.append('page count != 4')
ids_all = Counter(p.get('id') for p in pages)
if any(v > 1 for v in ids_all.values()):
    fails.append('duplicate page ids')


def parse(page):
    m = page.find('mxGraphModel')
    cells = {c.get('id'): c for c in m.iter('mxCell')}
    return m, cells


def geom(c):
    g = c.find('mxGeometry')
    return None if g is None or g.get('width') is None else (float(g.get('x') or 0), float(g.get('y') or 0), float(g.get('width')), float(g.get('height')))


def label(c):
    return re.sub(r'<[^>]+>', ' ', html.unescape(c.get('value') or '')).strip()


info = {}
for page in pages:
    m, cells = parse(page)
    all_ids = [c.get('id') for c in m.iter('mxCell')]
    dup = [k for k, v in Counter(all_ids).items() if v > 1]
    bad_ref = [c.get('id') for c in cells.values() if c.get('edge') and (c.get('source') not in cells or c.get('target') not in cells)]
    dangling = [c.get('id') for c in cells.values() if c.get('edge') and not (c.get('source') and c.get('target'))]
    W, H = float(m.get('pageWidth')), float(m.get('pageHeight'))
    verts = {i: c for i, c in cells.items() if c.get('vertex') and geom(c)}
    outside = [i for i, c in verts.items() if geom(c)[0] < 0 or geom(c)[1] < 0 or geom(c)[0] + geom(c)[2] > W or geom(c)[1] + geom(c)[3] > H]
    boxes = [(i, geom(c)) for i, c in verts.items() if 'text;' not in (c.get('style') or '')]
    overlaps = []
    for a in range(len(boxes)):
        ia, ga = boxes[a]
        for b in range(a + 1, len(boxes)):
            ib, gb = boxes[b]
            if ga[0] < gb[0] + gb[2] and gb[0] < ga[0] + ga[2] and ga[1] < gb[1] + gb[3] and gb[1] < ga[1] + ga[3]:
                overlaps.append((ia, ib))
    print(f"[{page.get('name')}] cells={len(cells)} vertices={len(verts)} edges={sum(1 for c in cells.values() if c.get('edge'))} "
          f"page={W:.0f}x{H:.0f} dup_ids={len(dup)} bad_refs={len(bad_ref)} unconnected_edges={len(dangling)} outside_page={len(outside)} shape_overlaps={len(overlaps)}")
    for lab, v in (('dup', dup), ('bad_ref', bad_ref), ('outside', outside), ('overlap', overlaps)):
        if v:
            fails.append(f"{page.get('name')}: {lab} {v[:5]}")
    if W <= H:
        fails.append(page.get('name') + ': not landscape')
    info[page.get('id')] = (m, cells, verts)

# ---- ERD vs schema ----
m, cells, verts = info['afn-erd']
sty = lambda c: c.get('style') or ''
legend = lambda c: '_legend_' in c.get('id')
ents = [c for c in verts.values() if 'fillColor=#B7E36D' in sty(c) and not legend(c)]
rels = [c for c in verts.values() if 'rhombus' in sty(c) and not legend(c)]
attrs = [c for c in verts.values() if 'ellipse' in sty(c) and 'fillColor=#FFD966' in sty(c) and not legend(c)]
text = open(dbml, encoding='utf-8').read()
tables = re.findall(r'^Table (\w+) \{', text, re.M)
cols = re.findall(r'^  \w+ [a-z(]', text, re.M)
refs = len(re.findall(r'ref: [->]', text))
print(f'ERD: entities={len(ents)} relationships={len(rels)} attributes={len(attrs)}  | schema: tables={len(tables)} columns={len(cols)} foreign-key refs={refs}')
if (len(ents), len(attrs), len(rels)) != (len(tables), len(cols), refs):
    fails.append('ERD and schema counts differ')
ent_names = sorted(label(c) for c in ents)
print('ERD sample entities:', ent_names[:4])

# ---- DFD checks ----
def directed(cells_):
    """(source, target, label) for every data flow; a two-way line (startArrow) counts as two flows."""
    out = []
    for c in cells_.values():
        if c.get('edge'):
            s_, t_, lab = c.get('source'), c.get('target'), c.get('value') or ''
            if 'startArrow=block' in (c.get('style') or ''):
                first, _, second = lab.partition('<br>')
                out += [(s_, t_, first), (t_, s_, second)]
            else:
                out.append((s_, t_, lab))
    return out



def kind(c):
    s = sty(c)
    if '#7E3FB8' in s or '#4C8C3A' in s: return 'e'   # actor (purple) or external provider (green)
    if '#B8860B' in s or '#B45454' in s: return 's'   # data store (yellow) or Context database cylinder (red)
    if '#1FA99A' in s or '#3B82C4' in s: return 'x' if 'dashed=1' in s else 'p'   # process (turquoise) or Context process (blue)
    return None


for pid in ('afn-l0', 'afn-l1'):
    m, cells, verts = info[pid]
    ks = {i: kind(c) for i, c in verts.items() if kind(c)}
    flows = directed(cells)
    bad = []
    inn, out = Counter(), Counter()
    for s, t, _lab in flows:
        a, b = ks[s], ks[t]
        out[s] += 1; inn[t] += 1
        if 'p' not in (a, b) and 'x' not in (a, b):
            bad.append((label(cells[s]), label(cells[t]), 'neither end is a process'))
    names = [label(cells[i]) for i, k in ks.items() if k == 'e']
    procs = [i for i, k in ks.items() if k == 'p']
    miracles = [label(cells[i]) for i in procs if not inn[i]]
    blackholes = [label(cells[i]) for i in procs if not out[i]]
    stores_nowrite = [label(cells[i]) for i, k in ks.items() if k == 's' and not inn[i]]
    stores_noread = [label(cells[i]) for i, k in ks.items() if k == 's' and not out[i]]
    dup_entities = [n for n, v in Counter(names).items() if v > 1]
    labels_c = Counter((cells[s].get('value'), cells[t].get('value'), lab) for s, t, lab in flows)
    dup_flow = [k for k, v in labels_c.items() if v > 1]
    print(f"[{pid}] entities={sum(1 for k in ks.values() if k=='e')} processes={len(procs)} stores={sum(1 for k in ks.values() if k=='s')} flows={len(flows)} "
          f"invalid_flows={len(bad)} miracles={miracles} black_holes={blackholes} stores_never_written={stores_nowrite} stores_never_read={stores_noread} "
          f"duplicate_entities={dup_entities} duplicate_flows={len(dup_flow)}")
    for b in bad: fails.append(f'{pid} invalid flow {b}')
    if miracles or blackholes or dup_entities: fails.append(f'{pid} process/entity rule violation')
    if pid == 'afn-l0':
        l0 = {(cells[s].get('id'), cells[t].get('id')): lab for s, t, lab in flows}
        l0_ents = set(names)
        l0_cells = cells
    else:
        l1_cells, l1_flows = cells, flows

# context vs L0 external entities and flow directions
cm, ccells, cverts = info['afn-ctx']
ck = {i: kind(c) for i, c in cverts.items() if kind(c)}
ctx_names = {label(ccells[i]) for i, k in ck.items() if k == 'e'}
sysid = [i for i, k in ck.items() if k == 'p']
print('context: external entities =', len(ctx_names), ' system processes =', len(sysid), ' flows =', sum(1 for c in ccells.values() if c.get('edge')))
if len(sysid) != 1: fails.append('context must have exactly one process')
print('context entities == L0 entities:', ctx_names == l0_ents)
if ctx_names != l0_ents: fails.append('context/L0 external entities differ: ' + str(ctx_names ^ l0_ents))
def dirs(cells_, kinds):
    d = defaultdict(set)
    for s_, t_, _lab in directed(cells_):
        if kinds.get(s_) == 'e': d[label(cells_[s_])].add('out-of-entity')
        if kinds.get(t_) == 'e': d[label(cells_[t_])].add('into-entity')
    return d
l0m, l0cells, l0verts = info['afn-l0']
l0k = {i: kind(c) for i, c in l0verts.items() if kind(c)}
dc, dl = dirs(ccells, ck), dirs(l0cells, l0k)
mism = [n for n in ctx_names if dc[n] != dl[n]]
print('context vs L0 per-entity flow directions match:', not mism, mism)
if mism: fails.append('direction mismatch ' + str(mism))
# L1 balance against L0 process 3.0
sub = {i for i in info['afn-l1'][2] if re.match(r'l1_p3\d$', i)}
stub_map = {'l1_s2': 'l0_p2', 'l1_s4': 'l0_p4', 'l1_s7': 'l0_p7'}
def to_l0(i):
    return stub_map.get(i, 'l0_' + i[3:])
b1 = Counter()
for s, t, _lab in l1_flows:
    if (s in sub) != (t in sub):
        if t in sub: b1[(to_l0(s), 'in')] += 1
        else: b1[(to_l0(t), 'out')] += 1
b0 = Counter()
for (s, t), v in l0.items():
    if t == 'l0_p3': b0[(s, 'in')] += 1
    if s == 'l0_p3': b0[(t, 'out')] += 1
b1k, b0k = set(b1), set(b0)
print('L1 boundary neighbours vs L0 process 3.0 neighbours: only-in-L0 =', sorted(b0k - b1k), ' only-in-L1 =', sorted(b1k - b0k))
if b0k != b1k: fails.append('L1 not balanced with L0 process 3.0')

print('\nFAILURES:' if fails else '\nALL STRUCTURAL CHECKS PASSED')
for f in fails: print(' -', f)
