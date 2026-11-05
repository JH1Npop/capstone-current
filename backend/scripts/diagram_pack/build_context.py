"""Build the System Context page (context.frag) in the style of the reference figure, on a white background.

Compact actor boxes, lines that fan out beside each box with small steps, tightly packed parallel rows, one small
process box in the centre and a cylinder database. Each group of lines is laid out in nested order so that lines of
one group do not cross; the step order is searched to keep the whole figure free of crossings.
usage: build_context.py [out.frag]
"""
import html
import itertools
import os
import sys

W, H = 2300, 1200
HERE = os.path.dirname(os.path.abspath(__file__))

ACTOR = 'rounded=0;whiteSpace=wrap;html=1;fillColor=#DCCBF2;strokeColor=#7E3FB8;strokeWidth=2;fontStyle=1;fontSize=14;fontColor=#000000;gradientColor=none;shadow=0;opacity=100;'
PROVIDER = 'rounded=0;whiteSpace=wrap;html=1;fillColor=#D0E9C6;strokeColor=#4C8C3A;strokeWidth=2;fontStyle=1;fontSize=14;fontColor=#000000;'
PROCESS = 'rounded=0;whiteSpace=wrap;html=1;fillColor=#C9DEF4;strokeColor=#3B82C4;strokeWidth=2.5;fontStyle=1;fontSize=22;fontColor=#000000;'
STORE = ('shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=14;whiteSpace=wrap;html=1;fillColor=#F6D0D0;strokeColor=#B45454;'
         'strokeWidth=2;fontStyle=1;fontSize=14;fontColor=#000000;')
EDGE = ('edgeStyle=none;rounded=0;html=1;endArrow=block;endFill=1;endSize=6;strokeColor=#000000;strokeWidth=1;'
        'fontSize=11;fontColor=#000000;labelBackgroundColor=default;')

# process box
BX, BY, BW, BH = 890, 470, 520, 230
BL, BR, BT, BB = BX, BX + BW, BY, BY + BH

STEP = 12      # spacing of the departure points on an actor box
LEAD = 22      # first step distance from the actor box
COL = 22       # spacing of lines on the process box
ROW = 28       # spacing of parallel rows
START = 46     # first line offset from the corner of the process box

CLIENT = [
    ('in', 'Registration, login, and profile data'),
    ('out', 'Account access and verification notice'),
    ('in', 'Service request, service type, location, and schedule preference'),
    ('out', 'Request decision, ticket status, and schedule'),
    ('in', 'Quotation decision and turnover acceptance'),
    ('out', 'Quotations, documents, deposit balance, and purchase history'),
    ('in', 'Messages, feedback, warranty concern, and support case'),
    ('out', 'Notifications, case updates, and maintenance reminders'),
]
TECH = [
    ('in', 'Login, profile, and availability'),
    ('out', 'Assigned jobs, schedule, and client and location details'),
    ('in', 'Location consent, GPS coordinates, and arrival'),
    ('out', 'Route, distance, and travel-time guidance'),
    ('in', 'Inspection report, checklist, job status, and proof of work'),
    ('out', 'Required equipment and material list'),
    ('in', 'Equipment request, material usage, and unused-equipment return'),
]
ADMIN = [
    ('in', 'Request approval, scheduling, and dispatch decisions'),
    ('out', 'Request and ticket queues, dispatch status, and calendar'),
    ('in', 'Service catalog, SLA rule, skill, and inventory configuration'),
    ('out', 'Stock levels, low-stock alerts, and reservations'),
    ('in', 'Quotation, deposit, payment, and document actions'),
    ('out', 'Quotation, payment, and document records'),
    ('in', 'After-sales, message, report, and audit requests'),
    ('out', 'Dashboards, SLA indicators, reports, notifications, and audit logs'),
]
SADMIN = [
    ('in', 'User, role, and capability configuration'),
    ('in', 'System settings, public content, and document template management'),
    ('out', 'System-wide records, permissions, and configuration status'),
    ('in', 'System-wide reporting requests'),
    ('out', 'Reports, analytics, activity logs, and change logs'),
]
MAPPING = [
    ('out', 'Address and coordinate queries'),
    ('in', 'Geocoding results'),
    ('out', 'Origin and destination for route request'),
    ('in', 'Route geometry, distance, and travel-time estimate'),
    ('in', 'Map tile images'),
]
EMAIL = [
    ('out', 'Verification, recovery, and account email requests'),
    ('out', 'Service-status and maintenance message requests'),
    ('in', 'Delivery result and provider failure'),
]
AI = [
    ('out', 'Analytics summary and administrator question'),
    ('in', 'Generated explanation or provider error'),
]
CLOUD = [
    ('out', 'Upload of profile photos, landing-page images, message images, proof media, and documents'),
    ('in', 'Private file references and file content'),
    ('out', 'File retrieval and deletion requests'),
    ('in', 'Upload, retrieval, and deletion results'),
]
DB = [
    ('out', 'Validated user, service, ticket, inventory, financial, and audit records'),
    ('in', 'Stored records, histories, and configurations for processing and reports'),
]


def eh_for(n):
    return max(64, STEP * n + 28)


# Each group: actor box, side the lines leave from, and for every line either a row (y) plus a column on the process
# box top/bottom, or a row on the process box side.
GROUPS = []


def group(gid, label, kind, ex, cy, ew, flows, side, entry, rows, cols=None):
    n = len(flows)
    GROUPS.append(dict(id=gid, label=label, kind=kind, ex=ex, ew=ew, eh=eh_for(n), cy=cy, flows=flows, side=side,
                       entry=entry, rows=rows, cols=cols))


LX = 60            # left actor boxes
RX = W - 60 - 250  # right actor boxes
n_c, n_s, n_m = len(CLIENT), len(SADMIN), len(MAPPING)
c0 = BL + START
rows_c = [110 + ROW * i for i in range(n_c)]
rows_s = [110 + ROW * i for i in range(n_s)]
rows_m = [290 + ROW * i for i in range(n_m)]
cols_c = [c0 + COL * (n_c - 1 - i) for i in range(n_c)]
s0 = c0 + COL * (n_c - 1) + 24
cols_s = [s0 + COL * i for i in range(n_s)]
m0 = s0 + COL * (n_s - 1) + 24
cols_m = [m0 + COL * i for i in range(n_m)]
mid = (BL + BR) // 2

group('client', 'Client', 'actor', LX, sum(rows_c) / n_c, 220, CLIENT, 'R', 'top', rows_c, cols_c)
group('sadmin', 'Superadministrator', 'actor', RX, sum(rows_s) / n_s, 250, SADMIN, 'L', 'top', rows_s, cols_s)
group('mapping', 'Mapping and Routing Services', 'provider', RX, sum(rows_m) / n_m, 250, MAPPING, 'L', 'top', rows_m, cols_m)
rows_t = [BT + 24 + 26 * i for i in range(len(TECH))]
group('tech', 'Technician', 'actor', LX, sum(rows_t) / len(rows_t), 220, TECH, 'R', 'left', rows_t)
rows_e = [BT + 30 + 26 * i for i in range(len(EMAIL))]
group('email', 'Email Delivery Service', 'provider', RX, 480, 250, EMAIL, 'L', 'right', rows_e)
rows_a = [BT + 30 + 26 * len(EMAIL) + 34 + 26 * i for i in range(len(AI))]
group('ai', 'AI Assistant Service (optional)', 'provider', RX, 660, 250, AI, 'L', 'right', rows_a)
rows_ad = [BB + 70 + ROW * i for i in range(len(ADMIN))]
cols_ad = [BL + START + COL * i for i in range(len(ADMIN))]
group('admin', 'Administrator', 'actor', LX, sum(rows_ad) / len(rows_ad), 220, ADMIN, 'R', 'bottom', rows_ad, cols_ad)
rows_cl = [BB + 70 + ROW * i for i in range(len(CLOUD))]
cols_cl = [BR - START - COL * i for i in range(len(CLOUD))]
group('cloud', 'Cloud File Storage', 'provider', RX, sum(rows_cl) / len(rows_cl), 250, CLOUD, 'L', 'bottom', rows_cl, cols_cl)

DB_BOX = (mid - 130, 1030, 260, 90)
DB_COLS = [mid - 22, mid + 22]


def actor_box(g):
    return g['ex'], g['cy'] - g['eh'] / 2, g['ew'], g['eh']


def build_path(g, i, ranks):
    """Path from the actor box to the process box for flow i."""
    n = len(g['flows'])
    ex, ey, ew, eh = actor_box(g)
    ye = g['cy'] - STEP * (n - 1) / 2 + STEP * i
    xe = ex + ew if g['side'] == 'R' else ex
    xj = xe + (LEAD + STEP * ranks[i]) * (1 if g['side'] == 'R' else -1)
    yr = g['rows'][i]
    if g['entry'] == 'top':
        pts = [(xe, ye), (xj, ye), (xj, yr), (g['cols'][i], yr), (g['cols'][i], BT)]
    elif g['entry'] == 'bottom':
        pts = [(xe, ye), (xj, ye), (xj, yr), (g['cols'][i], yr), (g['cols'][i], BB)]
    elif g['entry'] == 'left':
        pts = [(xe, ye), (xj, ye), (xj, yr), (BL, yr)]
    else:
        pts = [(xe, ye), (xj, ye), (xj, yr), (BR, yr)]
    clean = [pts[0]]
    for p in pts[1:]:
        if abs(p[0] - clean[-1][0]) > 0.01 or abs(p[1] - clean[-1][1]) > 0.01:
            clean.append(p)
    # drop collinear middle points
    out = [clean[0]]
    for k in range(1, len(clean) - 1):
        a, b, c = out[-1], clean[k], clean[k + 1]
        if (a[0] == b[0] == c[0]) or (a[1] == b[1] == c[1]):
            continue
        out.append(b)
    out.append(clean[-1])
    return out


def rank_options(g):
    n = len(g['flows'])
    ye = [g['cy'] - STEP * (n - 1) / 2 + STEP * i for i in range(n)]
    up = [i for i in range(n) if g['rows'][i] < ye[i] - 0.01]
    down = [i for i in range(n) if i not in up]
    opts = []
    for up_rev, down_rev in itertools.product((False, True), repeat=2):
        ranks = [0] * n
        u = list(reversed(up)) if up_rev else up
        d = list(reversed(down)) if down_rev else down
        for r, i in enumerate(u):
            ranks[i] = r
        for r, i in enumerate(d):
            ranks[i] = len(u) + r
        opts.append(ranks)
    return opts


def segments(pts):
    return list(zip(pts, pts[1:]))


def crossings(all_paths):
    count = 0
    for a in range(len(all_paths)):
        for b in range(a + 1, len(all_paths)):
            for p, q in segments(all_paths[a]):
                for r, s in segments(all_paths[b]):
                    if p[1] == q[1] and r[0] == s[0]:
                        h, v = (p, q), (r, s)
                    elif p[0] == q[0] and r[1] == s[1]:
                        h, v = (r, s), (p, q)
                    else:
                        continue
                    if min(h[0][0], h[1][0]) < v[0][0] < max(h[0][0], h[1][0]) and min(v[0][1], v[1][1]) < h[0][1] < max(v[0][1], v[1][1]):
                        count += 1
    return count


def db_paths():
    return [[(DB_COLS[i], DB_BOX[1]), (DB_COLS[i], BB)] for i in range(2)]


def solve():
    options = {g['id']: rank_options(g) for g in GROUPS}
    choice = {g['id']: options[g['id']][0] for g in GROUPS}

    def paths_for(ch):
        out = []
        for g in GROUPS:
            out += [build_path(g, i, ch[g['id']]) for i in range(len(g['flows']))]
        return out + db_paths()

    best = crossings(paths_for(choice))
    for _ in range(3):
        for g in GROUPS:
            for opt in options[g['id']]:
                trial = dict(choice)
                trial[g['id']] = opt
                c = crossings(paths_for(trial))
                if c < best:
                    best, choice = c, trial
    return choice, best


def seg_len(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def label_fraction(pts):
    lengths = [seg_len(a, b) for a, b in segments(pts)]
    k = max(range(len(lengths)), key=lambda j: lengths[j] if segments(pts)[j][0][1] == segments(pts)[j][1][1] else -1)
    return (sum(lengths[:k]) + lengths[k] / 2) / sum(lengths)


def fmt(v):
    return f'{v:.6f}'


def build():
    choice, remaining = solve()
    cells = ['<mxCell id="title" value="System Context Diagram" style="text;html=1;align=center;fontSize=28;fontStyle=1;'
             'fontColor=#000000;" vertex="1" parent="1"><mxGeometry x="750" y="20" width="800" height="50" as="geometry"/></mxCell>']
    style_of = {'actor': ACTOR, 'provider': PROVIDER}
    boxes = {}
    for g in GROUPS:
        x, y, w, h = actor_box(g)
        boxes[g['id']] = (x, y, w, h)
        cells.append(f'<mxCell id="{g["id"]}" value="{html.escape(g["label"], quote=True)}" style="{style_of[g["kind"]]}" vertex="1" parent="1">'
                     f'<mxGeometry x="{x:g}" y="{y:g}" width="{w}" height="{h:g}" as="geometry"/></mxCell>')
    cells.append(f'<mxCell id="system" value="AFN Service Management System" style="{PROCESS}" vertex="1" parent="1">'
                 f'<mxGeometry x="{BX}" y="{BY}" width="{BW}" height="{BH}" as="geometry"/></mxCell>')
    cells.append(f'<mxCell id="db" value="AFN-SERVE System Database" style="{STORE}" vertex="1" parent="1">'
                 f'<mxGeometry x="{DB_BOX[0]}" y="{DB_BOX[1]}" width="{DB_BOX[2]}" height="{DB_BOX[3]}" as="geometry"/></mxCell>')
    boxes['db'] = DB_BOX
    sysbox = (BX, BY, BW, BH)

    jobs = []
    for g in GROUPS:
        for i, (d, label) in enumerate(g['flows']):
            jobs.append((g['id'], d, label, build_path(g, i, choice[g['id']]), None))
    for i, (d, label) in enumerate(DB):
        jobs.append(('db', d, label, db_paths()[i], i))

    for n, (node, d, label, pts, db_index) in enumerate(jobs):
        bx, by, bw, bh = boxes[node]
        e_pt, s_pt = pts[0], pts[-1]
        efrac = ((e_pt[0] - bx) / bw, (e_pt[1] - by) / bh)
        sfrac = ((s_pt[0] - sysbox[0]) / sysbox[2], (s_pt[1] - sysbox[1]) / sysbox[3])
        way = pts[1:-1]
        offset = '<mxPoint x="0" y="-9" as="offset"/>'   # label sits just above its line
        if db_index is None:
            frac = label_fraction(pts)
        else:
            frac = 0.09 if db_index == 0 else 0.15
            width = len(label) * 5.9 + 12
            offset = f'<mxPoint x="{(-1 if db_index == 0 else 1) * (width / 2 + 10):.0f}" y="0" as="offset"/>'
        if d == 'in':
            src, dst, exit_f, entry_f, waypoints, rel = node, 'system', efrac, sfrac, way, frac
        else:
            src, dst, exit_f, entry_f, waypoints, rel = 'system', node, sfrac, efrac, way[::-1], 1 - frac
        style = (EDGE + f'exitX={fmt(exit_f[0])};exitY={fmt(exit_f[1])};exitDx=0;exitDy=0;exitPerimeter=0;'
                 f'entryX={fmt(entry_f[0])};entryY={fmt(entry_f[1])};entryDx=0;entryDy=0;entryPerimeter=0;')
        pts_xml = ''.join(f'<mxPoint x="{x:g}" y="{y:g}"/>' for x, y in waypoints)
        cells.append(f'<mxCell id="f{n}" value="{html.escape(label, quote=True)}" style="{style}" edge="1" parent="1" '
                     f'source="{src}" target="{dst}"><mxGeometry x="{2 * rel - 1:.4f}" relative="1" as="geometry">'
                     f'<Array as="points">{pts_xml}</Array>{offset}</mxGeometry></mxCell>')
    return f'{W} {H}\n' + ''.join(cells) + '\n', len(jobs), remaining


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'context.frag')
    text, flows, remaining = build()
    open(out, 'w', encoding='utf-8', newline='\n').write(text)
    print('wrote', out, flows, 'flows; crossings left after search:', remaining)
