"""Build a DFD page by reusing the existing router with a new node/flow spec (spec file defines W,H,TITLE,N,F)."""
import sys, re
from pathlib import Path
orig = Path(r'c:/Users/Iman/Desktop/current/finals-revision/capstone-1/backend/scripts/generate_afn_dfd_drawio.py').read_text(encoding='utf-8')
spec_path, out_path = sys.argv[1], sys.argv[2]
MERGE = len(sys.argv) > 3 and sys.argv[3] == 'merge'
spec = Path(spec_path).read_text(encoding='utf-8')
head = orig[:orig.index('REPOSITORY_ROOT')]
rest = orig[orig.index('def box(n):'):]
rest = rest[:rest.index('cells_xml.insert(0,')]
rest = rest.replace("{'e': ENTITY, 'p': PROCESS, 's': STORE}[kind]", "{'e': ENTITY, 'p': PROCESS, 's': STORE, 'x': globals().get('STUB', PROCESS)}[kind]")
rest = rest.replace('for cx in range(int(1000 // G), int(1640 // G) + 1):', 'for cx in range(int((W/2-400) // G), int((W/2+400) // G) + 1):')
rest = rest.replace('for cy in range(0, int(80 // G) + 1):', 'for cy in range(0, int(110 // G) + 1):')
MERGE_CODE = "\n# ---- merge request/response pairs into one two-way line (first label = flow into the process, second = flow out of it)\ndef _merge_pairs(flows, nodes):\n    index = {(f[0], f[1]): k for k, f in enumerate(flows)}\n    used, merged = set(), []\n    for k, (s_, t_, label, ps, pt) in enumerate(flows):\n        if k in used:\n            continue\n        j = index.get((t_, s_))\n        if j is None or j in used or j == k:\n            merged.append((s_, t_, label, ps, pt))\n            continue\n        a, b = flows[k], flows[j]\n        into, out = (a, b) if nodes[a[1]][5] == 'p' or nodes[b[1]][5] != 'p' else (b, a)\n        merged.append((into[0], into[1], into[2] + '<br>' + out[2], into[3], into[4]))\n        used.update((k, j))\n    return merged\n\n\nF = _merge_pairs(F, N)\n"
# the original shifts nothing else; emit fragment
tail = '''
cells_xml.insert(0, f'<mxCell id="title" value="{html.escape(TITLE)}" style="text;html=1;align=center;fontSize=30;fontStyle=1;fontColor=#0F172A;" vertex="1" parent="1"><mxGeometry x="{W/2-400:.0f}" y="20" width="800" height="60" as="geometry"/></mxCell>')
Path(OUTFILE).write_text(f'{W} {H}' + chr(10) + ''.join(cells_xml), encoding='utf-8')
print('cells', len(cells_xml))
'''
# two-line label boxes, and arrowheads at both ends of a merged (two-way) line
rest = rest.replace("lw, lh = len(label) * 6.1 + 10, 17", "_parts = label.split('<br>'); lw, lh = max(len(p) for p in _parts) * 6.1 + 10, 17 * len(_parts)")
rest = rest.replace("    way = ''.join(", "    if '<br>' in label:\n        style += 'startArrow=block;startFill=1;startSize=7;'\n    way = ''.join(", 1)
legend = '''
cells_xml.append('<mxCell id="legend" value="Two-way lines carry two labels: the first is the data flowing into the process, the second is the data flowing out of it." style="text;html=1;align=center;fontSize=14;fontColor=#000000;" vertex="1" parent="1"><mxGeometry x="%d" y="%d" width="1400" height="30" as="geometry"/></mxCell>' % (W / 2 - 700, H - 60))
'''
code = 'import sys\nOUTFILE=%r\n' % out_path + head + spec + ('\n' + MERGE_CODE if MERGE else '') + '\n' + rest + (legend if MERGE else '') + tail
Path(out_path + '.gen.py').write_text(code, encoding='utf-8')
