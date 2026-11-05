"""Make a routing variant of a DFD spec: add empty margin around the diagram and set the crossing cost.
usage: variant.py spec_in spec_out pad crossing_cost [shift_stores]"""
import re
import sys

src, dst, pad, cost = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
shift = len(sys.argv) > 5 and sys.argv[5] == 'shift_stores'
s = open(src, encoding='utf-8').read()
s = re.sub(r'^W = (\d+)', lambda m: f'W = {int(m.group(1)) + 2 * pad}', s, count=1, flags=re.M)
s = re.sub(r'^H = (\d+)', lambda m: f'H = {int(m.group(1)) + 2 * pad}', s, count=1, flags=re.M)
s = re.sub(r'^CROSSING_COST = \d+', f'CROSSING_COST = {cost}', s, count=1, flags=re.M)


def move(m):
    extra = 150 if shift and m.group(1) in ('d2', 'd7', 'd14', 'd16') else 0
    return f"    '{m.group(1)}': {m.group(2)}{int(m.group(3)) + pad + extra}, {int(m.group(4)) + pad}"


s = re.sub(r"    '(\w+)': (\((?:'[^']*'|\"[^\"]*\"), )(-?\d+), (-?\d+)", move, s)
open(dst, 'w', encoding='utf-8', newline='\n').write(s)
