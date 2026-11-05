"""Search entity seats in the Chen ERD grid to minimise line crossings (documentation tool; no app code touched).

usage: optimize_erd.py [iterations] [seed] [start_temp] [resume]   writes erd_grid.json (best seat grid) which chen.py loads.
Objective = leg crossings measured on the generated XML (plus a tiny total-length term).
"""
import json
import math
import random
import re
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import generate_afn_chen_drawio as c  # noqa: E402

sys.path.insert(0, str(HERE))
import erd_source  # noqa: E402

ROOT = HERE.parents[2]
erd_source.prepare(c)


def measure(xml: str) -> tuple[int, int]:
    root = ET.fromstring(xml)
    cells = {e.get("id"): e for e in root.iter("mxCell")}
    geo = {}
    for i, e in cells.items():
        g = e.find("mxGeometry")
        if e.get("vertex") and g is not None and g.get("width"):
            geo[i] = (float(g.get("x")), float(g.get("y")), float(g.get("width")), float(g.get("height")))
    horizontal, vertical, total = [], [], 0

    def end(style, which, box):
        mx = re.search(which + r"X=([-\d.]+)", style)
        my = re.search(which + r"Y=([-\d.]+)", style)
        return (box[0] + float(mx.group(1)) * box[2], box[1] + float(my.group(1)) * box[3]) if mx and my else None

    for i, e in cells.items():
        if not re.match(r"re_\d+_(source|target)$", i or ""):
            continue
        st = e.get("style") or ""
        pts = [(float(p.get("x")), float(p.get("y"))) for p in e.iter("mxPoint") if p.get("as") != "offset"]
        a = end(st, "exit", geo[e.get("source")])
        b = end(st, "entry", geo[e.get("target")])
        path = [(round(x), round(y)) for x, y in (([a] if a else []) + pts + ([b] if b else []))]
        for u, v in zip(path, path[1:]):
            total += abs(u[0] - v[0]) + abs(u[1] - v[1])
            if u[1] == v[1] and u[0] != v[0]:
                horizontal.append((i, u[1], min(u[0], v[0]), max(u[0], v[0])))
            elif u[0] == v[0] and u[1] != v[1]:
                vertical.append((i, u[0], min(u[1], v[1]), max(u[1], v[1])))
    crossings = sum(1 for he, y, x0, x1 in horizontal for ve, x, y0, y1 in vertical
                    if he != ve and x0 < x < x1 and y0 < y < y1)
    return crossings, total


def score(grid):
    c.ENTITY_GRID = [row[:] for row in grid]
    xml = c.generate()
    crossings, length = measure(xml)
    return crossings + length / 1e6, crossings


def initial_grid():
    tables, relationships = c.parse_dbml(c.DBML_PATH.read_text(encoding="utf-8"))
    position = c.place_entities(tables, c.ordered_relationships(relationships))
    grid = [[None] * c.GRID_COLUMNS for _ in range(c.GRID_ROWS)]
    for table, (r, col) in position.items():
        grid[r][col] = table
    return grid


def main():
    iterations = int(sys.argv[1]) if len(sys.argv) > 1 else 800
    random.seed(int(sys.argv[2]) if len(sys.argv) > 2 else 1)
    t0_temp = float(sys.argv[3]) if len(sys.argv) > 3 else 6.0
    saved = HERE / "erd_grid.json"
    grid = json.loads(saved.read_text(encoding="utf-8")) if len(sys.argv) > 4 and sys.argv[4] == "resume" else initial_grid()
    cur, cur_x = score(grid)
    best, best_x, best_grid = cur, cur_x, [row[:] for row in grid]
    print("start crossings", cur_x, flush=True)
    cells = [(r, k) for r in range(c.GRID_ROWS) for k in range(c.GRID_COLUMNS)]
    t0 = time.time()
    for it in range(iterations):
        temp = t0_temp * (1 - it / iterations) + 0.3
        (r1, k1), (r2, k2) = random.sample(cells, 2)
        if grid[r1][k1] is None and grid[r2][k2] is None:
            continue
        grid[r1][k1], grid[r2][k2] = grid[r2][k2], grid[r1][k1]
        try:
            s, x = score(grid)
        except Exception:
            s, x = 1e9, 1e9
        if s <= cur or random.random() < math.exp((cur - s) / temp):
            cur, cur_x = s, x
            if s < best:
                best, best_x, best_grid = s, x, [row[:] for row in grid]
                (HERE / "erd_grid.json").write_text(json.dumps(best_grid), encoding="utf-8")
        else:
            grid[r1][k1], grid[r2][k2] = grid[r2][k2], grid[r1][k1]
        if it % 50 == 0:
            print(f"it {it} cur {cur_x} best {best_x} ({time.time() - t0:.0f}s)", flush=True)
    (HERE / "erd_grid.json").write_text(json.dumps(best_grid), encoding="utf-8")
    print("done best crossings", best_x, flush=True)


if __name__ == "__main__":
    main()
