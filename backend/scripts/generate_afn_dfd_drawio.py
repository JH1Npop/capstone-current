r"""Generate the AFN Data Flow Diagram (draw.io) used as the paper's DFD figure.

Layout and styling follow the approved reference: yellow external entities, teal-outlined
processes 1.0-8.0, and purple-outlined data stores D1-D14. Every flow is routed orthogonally on a
15px grid with A* search that keeps lines out of shapes, the title, and each other's segments;
labels are placed where they clear every shape and label. Crossings are drawn with bridge arcs.

    .\venv\Scripts\python.exe backend\scripts\generate_afn_dfd_drawio.py [output.drawio]
"""
import heapq
import html
import sys
from collections import defaultdict
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPOSITORY_ROOT / 'docs' / 'models' / 'AFN_DETAILED_DFD_STRUCTURED.drawio'
W, H = 2800, 1980
G = 15  # routing grid in px
# A bridged crossing is accepted rather than a detour longer than about 60 grid steps (900px).
CROSSING_COST = 60

ENTITY = 'rounded=0;whiteSpace=wrap;html=1;fillColor=#E5C100;strokeColor=#5C4A00;strokeWidth=1.5;fontStyle=1;fontSize=15;fontColor=#1F1A00;'
PROCESS = 'rounded=0;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#1FA99A;strokeWidth=2.5;fontSize=14;fontColor=#0F172A;'
STORE = 'rounded=0;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#7E3FB8;strokeWidth=2.5;fontSize=13;fontColor=#0F172A;'
EDGE = ('edgeStyle=none;rounded=0;html=1;endArrow=block;endFill=1;endSize=7;strokeColor=#1F2937;strokeWidth=1.2;'
        'fontSize=11;fontColor=#1F2937;labelBackgroundColor=#FFFFFF;jumpStyle=arc;jumpSize=7;')

# id: (label, cx, cy, w, h, kind). Every entity and store appears once and every flow connects to it.
N = {
    'admin': ('Admin / Superadmin', 1340, 200, 240, 80, 'e'),
    'tech': ('Technician', 2380, 300, 220, 80, 'e'),
    'client': ('Client', 1800, 900, 220, 80, 'e'),
    'p1': ('1.0 Manage User Access', 1980, 210, 290, 90, 'p'),
    'p2': ('2.0 Manage Service<br>Requests', 1760, 1560, 290, 90, 'p'),
    'p3': ('3.0 Manage Ticket Dispatch', 1340, 1140, 290, 90, 'p'),
    'p4': ('4.0 Manage Technician Job<br>Completion', 2290, 1150, 290, 90, 'p'),
    'p5': ('5.0 Manage Inventory Usage', 760, 1320, 290, 90, 'p'),
    'p6': ('6.0 Manage After-Sales and<br>Maintenance', 1500, 560, 290, 90, 'p'),
    'p7': ('7.0 Manage Messages and<br>Notifications', 620, 600, 290, 90, 'p'),
    'p8': ('8.0 Generate Reports, Analytics, Logs, and<br>Assisted Responses', 330, 1010, 330, 90, 'p'),
    'd1': ('D1 User, Profile, and Role Records', 1990, 640, 260, 80, 's'),
    'd2': ('D2 Service Type, SLA Reference, and Skill<br>Records', 1780, 1250, 280, 80, 's'),
    'd3': ('D3 Service Request and<br>Location', 1760, 1860, 260, 80, 's'),
    'd4': ('D4 Ticket, Crew, Schedule, and<br>Assignment', 1340, 1500, 260, 80, 's'),
    'd5': ('D5 Ticket Progress and<br>Status History', 2300, 1450, 260, 80, 's'),
    'd6': ('D6 Checklist and Proof', 2330, 760, 240, 80, 's'),
    'd7': ('D7 Inventory Item and<br>Requirement', 540, 1620, 240, 80, 's'),
    'd8': ('D8 Inventory Reservation and<br>Transaction', 990, 1620, 260, 80, 's'),
    'd9': ('D9 After-Sales Case', 1460, 820, 240, 80, 's'),
    'd10': ('D10 Maintenance Schedule', 1640, 380, 260, 80, 's'),
    'd11': ('D11 Message Records', 170, 440, 240, 80, 's'),
    'd12': ('D12 Notification and<br>Delivery Log', 170, 760, 240, 80, 's'),
    'd13': ('D13 Activity, Change Log,<br>and Settings', 450, 1270, 240, 80, 's'),
    'd14': ('D14 Analytics, Performance,<br>and Trends', 150, 1270, 240, 80, 's'),
}

# (source, target, label, source side, target side); sides are T, B, L, R
F = [
    # 1.0 user access
    ('admin', 'p1', 'login, user, role, and capability updates', 'R', 'L'),
    ('p1', 'admin', 'account access and user records', 'L', 'R'),
    ('tech', 'p1', 'login, profile, and availability updates', 'T', 'T'),
    ('p1', 'tech', 'session and role access', 'R', 'L'),
    ('client', 'p1', 'login, registration, and profile updates', 'T', 'B'),
    ('p1', 'client', 'account access and verification notice', 'B', 'T'),
    ('p1', 'd1', 'user, profile, and role data', 'B', 'T'),
    ('d1', 'p1', 'user and role records', 'T', 'B'),
    # 2.0 service requests
    ('client', 'p2', 'service request, location, and schedule preference', 'R', 'R'),
    ('p2', 'client', 'request status and schedule confirmation', 'R', 'R'),
    ('p2', 'd3', 'service request and location data', 'B', 'T'),
    ('d3', 'p2', 'request and location records', 'T', 'B'),
    ('d2', 'p2', 'available services and SLA reference', 'B', 'T'),
    ('p2', 'p3', 'new service request for review', 'L', 'B'),
    # 3.0 dispatch
    ('admin', 'p3', 'approval, quotation, dispatch, and schedule decisions', 'B', 'T'),
    ('p3', 'admin', 'ticket queue, deposit, and dispatch status', 'T', 'B'),
    ('client', 'p3', 'quotation decision', 'L', 'T'),
    ('p3', 'client', 'quotation and ticket updates', 'R', 'L'),
    ('d2', 'p3', 'technician skill records', 'L', 'R'),
    ('p3', 'd4', 'ticket, crew, schedule, and assignment data', 'B', 'T'),
    ('d4', 'p3', 'ticket and assignment records', 'T', 'B'),
    ('p3', 'tech', 'assigned job and schedule details', 'R', 'B'),
    ('p4', 'p3', 'inspection report and findings', 'L', 'R'),
    # 4.0 field work
    ('tech', 'p4', 'job status, inspection report, checklist, and proof', 'R', 'R'),
    ('p4', 'client', 'job progress and completion status', 'T', 'R'),
    ('d6', 'p4', 'checklist requirements', 'B', 'T'),
    ('p4', 'd6', 'checklist and proof data', 'T', 'B'),
    ('p4', 'd5', 'progress, completion, and status history', 'B', 'T'),
    ('d5', 'p4', 'status history records', 'T', 'B'),
    # 5.0 inventory
    ('admin', 'p5', 'inventory, reservation, and return decisions', 'L', 'T'),
    ('p5', 'admin', 'stock levels and low-stock alerts', 'T', 'L'),
    ('tech', 'p5', 'equipment request and usage details', 'B', 'B'),
    ('p5', 'd7', 'inventory item and requirement data', 'B', 'T'),
    ('d7', 'p5', 'stock and requirement records', 'T', 'B'),
    ('p5', 'd8', 'reservation and transaction data', 'B', 'T'),
    ('d8', 'p5', 'reservation and transaction records', 'T', 'B'),
    # 6.0 after-sales
    ('admin', 'p6', 'after-sales and maintenance actions', 'B', 'L'),
    ('client', 'p6', 'feedback, inquiry, and warranty concern', 'T', 'R'),
    ('p6', 'client', 'case updates and maintenance reminders', 'R', 'T'),
    ('p6', 'd9', 'after-sales case data', 'B', 'T'),
    ('d9', 'p6', 'case records', 'T', 'B'),
    ('p6', 'd10', 'maintenance schedule data', 'T', 'B'),
    ('d10', 'p6', 'maintenance schedule records', 'B', 'T'),
    # 7.0 messages
    ('admin', 'p7', 'messages and notification actions', 'L', 'T'),
    ('p7', 'admin', 'messages and notifications', 'T', 'L'),
    ('tech', 'p7', 'messages and notification actions', 'T', 'T'),
    ('p7', 'tech', 'messages and notifications', 'T', 'T'),
    ('client', 'p7', 'messages and notification actions', 'L', 'R'),
    ('p7', 'client', 'messages and notifications', 'R', 'L'),
    ('p7', 'd11', 'message data', 'L', 'R'),
    ('d11', 'p7', 'message records', 'R', 'L'),
    ('p7', 'd12', 'delivery log entries', 'L', 'R'),
    ('d12', 'p7', 'delivery log records', 'R', 'L'),
    # 8.0 reports
    ('admin', 'p8', 'report, analytics, and audit requests', 'L', 'T'),
    ('p8', 'admin', 'dashboards, reports, and audit results', 'T', 'L'),
    ('client', 'p8', 'assistant questions', 'L', 'R'),
    ('p8', 'client', 'assisted responses', 'R', 'L'),
    ('d13', 'p8', 'activity, change log, and settings records', 'T', 'B'),
    ('p8', 'd13', 'report and audit log entries', 'B', 'T'),
    ('d14', 'p8', 'analytics, performance, forecast, and trend records', 'T', 'B'),
    ('p8', 'd14', 'analytics request data', 'B', 'T'),
]


def box(n):
    _, cx, cy, w, h, _ = N[n]
    return cx - w / 2, cy - h / 2, w, h


# ---- ports: spread every flow touching a side evenly along it ----
side_users = defaultdict(list)
for i, (s, t, _, ss, ts) in enumerate(F):
    side_users[(s, ss)].append((i, 'src', t))
    side_users[(t, ts)].append((i, 'dst', s))
# Grow a box when a side carries too many flows to keep each port on its own grid line.
for (n, side), users in side_users.items():
    label, cx, cy, w, h, kind = N[n]
    need = G * (len(users) + 1) + 10
    if side in 'LR' and h < need:
        h = need
    if side in 'TB' and w < need:
        w = need
    N[n] = (label, cx, cy, w, h, kind)
ports = {}
for (n, side), users in side_users.items():
    x, y, w, h = box(n)
    horizontal = side in 'TB'
    other_axis = lambda m: N[m][1] if horizontal else N[m][2]
    users.sort(key=lambda u: (other_axis(u[2]), u[0], u[1]))
    k = len(users)
    length = w if horizontal else h
    step = max(1, int(length / (k + 1) // G)) * G  # distinct grid lines, evenly spread when there is room
    centre = (x + w / 2) if horizontal else (y + h / 2)
    first = round((centre - step * (k - 1) / 2) / G) * G
    for j, (i, role, _) in enumerate(users):
        along = first + j * step
        if side == 'T':
            p = (along, round(y / G) * G)
        elif side == 'B':
            p = (along, round((y + h) / G) * G)
        elif side == 'L':
            p = (round(x / G) * G, along)
        else:
            p = (round((x + w) / G) * G, along)
        ports[(i, role)] = (p[0], p[1], side)
seen_ports = defaultdict(list)
for key, (px, py, side) in ports.items():
    seen_ports[(px, py)].append(key)
assert all(len(v) == 1 for v in seen_ports.values()), [v for v in seen_ports.values() if len(v) > 1]

# ---- grid router ----
cols, rows = W // G + 1, H // G + 1
blocked = [[False] * rows for _ in range(cols)]
for n in N:
    x, y, w, h = box(n)
    for cx in range(int((x - G) // G), int((x + w + G) // G) + 1):
        for cy in range(int((y - G) // G), int((y + h + G) // G) + 1):
            if 0 <= cx < cols and 0 <= cy < rows:
                blocked[cx][cy] = True
for cx in range(int(1000 // G), int(1640 // G) + 1):  # keep lines out of the title
    for cy in range(0, int(80 // G) + 1):
        blocked[cx][cy] = True
used_h = defaultdict(int)   # cell -> number of horizontal runs
used_v = defaultdict(int)
DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1)]
OUTWARD = {'T': (0, -1), 'B': (0, 1), 'L': (-1, 0), 'R': (1, 0)}


def route(a, b):
    """A* from cell a (leaving in dir da) to cell b on the free grid."""
    (ax, ay, da), (bx, by, db) = a, b
    start = (ax, ay, da)
    goal = (bx, by)
    frontier = [(0, 0, start, None)]
    best = {start: 0}
    parent = {}
    while frontier:
        f, g, state, prev = heapq.heappop(frontier)
        if state in parent:
            continue
        parent[state] = prev
        x, y, d = state
        if (x, y) == goal and d == db:
            path = [(x, y)]
            while parent[state] is not None:
                state = parent[state]
                path.append((state[0], state[1]))
            return path[::-1]
        for nd, (dx, dy) in enumerate(DIRS):
            if (dx, dy) == (-DIRS[d][0], -DIRS[d][1]):
                continue
            nx, ny = x + dx, y + dy
            if not (0 <= nx < cols and 0 <= ny < rows) or (blocked[nx][ny] and (nx, ny) != goal):
                continue
            cost = 1 + (10 if nd != d else 0) + history[(nx, ny)]
            if dx:
                cost += 6000 * used_h[(nx, ny)] + CROSSING_COST * used_v[(nx, ny)]
            else:
                cost += 6000 * used_v[(nx, ny)] + CROSSING_COST * used_h[(nx, ny)]
            ng = g + cost
            ns = (nx, ny, nd)
            if ng < best.get(ns, 1e18):
                best[ns] = ng
                heapq.heappush(frontier, (ng + abs(nx - bx) + abs(ny - by), ng, ns, state))
    raise RuntimeError(f'no route {a} -> {b}')


def dir_index(v):
    return DIRS.index(v)


history = defaultdict(int)
cell_paths = {}


def mark(i, delta):
    cells = cell_paths[i]
    for (x1, y1), (x2, y2) in zip(cells, cells[1:]):
        usage = used_h if y1 == y2 else used_v
        usage[(x1, y1)] += delta
        usage[(x2, y2)] += delta


def endpoints(i):
    sx, sy, ss = ports[(i, 'src')]
    tx, ty, ts = ports[(i, 'dst')]
    o = OUTWARD[ss]
    o2 = OUTWARD[ts]
    a = (int(sx // G) + o[0] * 2, int(sy // G) + o[1] * 2, dir_index(o))
    b = (int(tx // G) + o2[0] * 2, int(ty // G) + o2[1] * 2, dir_index((-o2[0], -o2[1])))
    for cell in ((a[0], a[1]), (b[0], b[1])):
        blocked[cell[0]][cell[1]] = False
    return a, b


def routed_cells(i):
    """Grid cells of a flow including the short stubs from each port to the routed path."""
    sx, sy, ss = ports[(i, 'src')]
    tx, ty, ts = ports[(i, 'dst')]
    o, o2 = OUTWARD[ss], OUTWARD[ts]
    start = (int(sx // G), int(sy // G))
    end = (int(tx // G), int(ty // G))
    middle = route(*endpoints(i))
    return [start, (start[0] + o[0], start[1] + o[1])] + middle + [(end[0] + o2[0], end[1] + o2[1]), end]


def conflicts():
    """Flows that share a cell with another flow (a crossing, overlap, or touching corner)."""
    owners = defaultdict(set)
    for i, cells in cell_paths.items():
        for cell in cells:
            owners[cell].add(i)
    bad = set()
    for cell, members in owners.items():
        if len(members) > 1:
            bad |= members
            history[cell] += 4
            ordered = sorted(members)
            for a_index, i in enumerate(ordered):
                for j in ordered[a_index + 1:]:
                    swap_pair_ports(i, j)
    return bad


swapped_pairs = set()


def swap_pair_ports(i, j):
    """A two-way pair whose lines cross is untangled by swapping their ports on one shape."""
    (si, ti), (sj, tj) = F[i][:2], F[j][:2]
    if (i, j) in swapped_pairs or {si, ti} != {sj, tj}:
        return
    swapped_pairs.add((i, j))
    key_i = (i, 'dst')
    key_j = (j, 'src') if sj == ti else (j, 'dst')
    if ports[key_i][2] == ports[key_j][2]:
        ports[key_i], ports[key_j] = ports[key_j], ports[key_i]


order = sorted(range(len(F)), key=lambda i: abs(N[F[i][0]][1] - N[F[i][1]][1]) + abs(N[F[i][0]][2] - N[F[i][1]][2]))
for i in order:
    cell_paths[i] = routed_cells(i)
    mark(i, 1)
def score():
    """(overlapping cells, crossing cells): parallel sharing is never accepted, crossings are minimised."""
    overlap = sum(1 for c, n in used_h.items() if n > 2) + sum(1 for c, n in used_v.items() if n > 2)
    crossing = 0
    owners = defaultdict(set)
    for i, cells in cell_paths.items():
        for cell in cells:
            owners[cell].add(i)
    for cell, members in owners.items():
        if len(members) > 1:
            crossing += len(members) - 1
    return overlap, crossing


best = (score(), {i: list(c) for i, c in cell_paths.items()}, dict(ports))
for round_number in range(30):
    bad = conflicts()
    if not bad:
        break
    for i in sorted(bad, key=lambda j: order.index(j)):
        mark(i, -1)
        cell_paths[i] = routed_cells(i)
        mark(i, 1)
    current = score()
    if current < best[0]:
        best = (current, {i: list(c) for i, c in cell_paths.items()}, dict(ports))
cell_paths = best[1]
ports = best[2]
print('routing: best (overlapping cells, shared crossing cells) =', best[0])

paths = {}
for i, cells in cell_paths.items():
    sx, sy, _ = ports[(i, 'src')]
    tx, ty, _ = ports[(i, 'dst')]
    pts = [(sx, sy)] + [(x * G, y * G) for x, y in cells] + [(tx, ty)]
    simple = [pts[0]]
    for p in pts[1:]:
        if len(simple) >= 2 and (simple[-2][0] == simple[-1][0] == p[0] or simple[-2][1] == simple[-1][1] == p[1]):
            simple[-1] = p
        else:
            simple.append(p)
    paths[i] = simple

# ---- labels: first spot along the path that is clear of boxes, other labels, and other lines' corners ----
placed_labels = []
node_rects = [(x - 6, y - 6, x + w + 6, y + h + 6) for x, y, w, h in (box(n) for n in N)]


def hits(r, rects):
    return any(r[0] < q[2] and q[0] < r[2] and r[1] < q[3] and q[1] < r[3] for q in rects)


def label_position(i, label, pts):
    segs = list(zip(pts, pts[1:]))
    lengths = [abs(b[0] - a[0]) + abs(b[1] - a[1]) for a, b in segs]
    total = sum(lengths) or 1
    lw, lh = len(label) * 6.1 + 10, 17
    others = [p for j, path in paths.items() if j != i for p in path[1:-1]]
    best = None
    for k in sorted(range(len(segs)), key=lambda j: -lengths[j]):
        a, b = segs[k]
        for frac in (0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9):
            x = a[0] + (b[0] - a[0]) * frac
            y = a[1] + (b[1] - a[1]) * frac
            r = (x - lw / 2, y - lh / 2, x + lw / 2, y + lh / 2)
            if r[0] < 10 or r[2] > W - 10:
                continue
            corner = any(r[0] - 4 < px < r[2] + 4 and r[1] - 4 < py < r[3] + 4 for px, py in others)
            if not hits(r, node_rects) and not hits(r, placed_labels) and not corner:
                placed_labels.append(r)
                return (sum(lengths[:k]) + lengths[k] * frac) / total * 2 - 1
            if best is None and not hits(r, node_rects) and not hits(r, placed_labels):
                best = (r, (sum(lengths[:k]) + lengths[k] * frac) / total * 2 - 1)
    if best:
        placed_labels.append(best[0])
        return best[1]
    print('label without a clear spot:', label)
    k = max(range(len(segs)), key=lambda j: lengths[j])
    return (sum(lengths[:k]) + lengths[k] / 2) / total * 2 - 1


# ---- emit ----
cells_xml = []
for n, (label, cx, cy, w, h, kind) in N.items():
    style = {'e': ENTITY, 'p': PROCESS, 's': STORE}[kind]
    cells_xml.append(
        f'<mxCell id="{n}" value="{html.escape(label)}" style="{style}" vertex="1" parent="1">'
        f'<mxGeometry x="{cx - w / 2:.0f}" y="{cy - h / 2:.0f}" width="{w}" height="{h}" as="geometry"/></mxCell>')
for i, (s, t, label, _, _) in enumerate(F):
    pts = paths[i]
    (sx, sy), (tx, ty) = pts[0], pts[-1]
    bx, by, bw, bh = box(s)
    ex, ey, ew, eh = box(t)
    rel = label_position(i, label, pts)
    style = (EDGE + f'exitX={(sx - bx) / bw:.4f};exitY={(sy - by) / bh:.4f};exitDx=0;exitDy=0;exitPerimeter=0;'
             f'entryX={(tx - ex) / ew:.4f};entryY={(ty - ey) / eh:.4f};entryDx=0;entryDy=0;entryPerimeter=0;')
    way = ''.join(f'<mxPoint x="{x:.0f}" y="{y:.0f}"/>' for x, y in pts[1:-1])
    cells_xml.append(
        f'<mxCell id="f{i}" value="{html.escape(label)}" style="{style}" edge="1" parent="1" source="{s}" target="{t}">'
        f'<mxGeometry x="{rel:.4f}" relative="1" as="geometry"><Array as="points">{way}</Array></mxGeometry></mxCell>')
cells_xml.insert(0, '<mxCell id="title" value="Data Flow Diagram" style="text;html=1;align=center;fontSize=30;fontStyle=1;fontColor=#0F172A;" vertex="1" parent="1"><mxGeometry x="1020" y="20" width="600" height="50" as="geometry"/></mxCell>')
xml = (f'<mxfile host="Electron" pages="1"><diagram id="afn-dfd" name="Data Flow Diagram"><mxGraphModel dx="1600" dy="1200" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{W}" pageHeight="{H}" math="0" shadow="0"><root>'
       '<mxCell id="0"/><mxCell id="1" parent="0"/>' + ''.join(cells_xml) + '</root></mxGraphModel></diagram></mxfile>\n')
OUT.write_text(xml, encoding='utf-8', newline='\n')
print(f'Generated {OUT} ({len(N)} shapes, {len(F)} flows)')
