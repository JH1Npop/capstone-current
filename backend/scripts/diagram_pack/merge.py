"""Merge four pages into one .drawio. usage: merge.py out.drawio"""
import sys, re, html
import xml.etree.ElementTree as ET

import os
S = os.path.dirname(os.path.abspath(__file__)) + os.sep


def model_from_cells(cells, W, H, grid=10):
    m = ET.Element('mxGraphModel', dx='1600', dy='1000', grid='1', gridSize=str(grid), guides='1', tooltips='1', connect='1',
                   arrows='1', fold='1', page='1', pageScale='1', pageWidth=str(W), pageHeight=str(H), math='0', shadow='0')
    root = ET.SubElement(m, 'root')
    ET.SubElement(root, 'mxCell', id='0')
    ET.SubElement(root, 'mxCell', id='1', parent='0')
    for c in cells:
        root.append(c)
    return m


def prefix(model, p):
    for c in model.iter('mxCell'):
        if c.get('id') in ('0', '1'):
            continue
        c.set('id', p + c.get('id'))
        for a in ('source', 'target'):
            if c.get(a):
                c.set(a, p + c.get(a))
        if c.get('parent') not in (None, '0', '1'):
            c.set('parent', p + c.get('parent'))
    return model


def cells_of(model):
    return [c for c in model.find('root') if c.get('id') not in ('0', '1')]


pages = []
# 1: Chen ERD (generated from the paper schema)
erd = ET.parse(S + 'erd.xml').getroot().find('diagram').find('mxGraphModel')
pages.append(('1 - Entity Relationship Diagram (Chen Notation)', 'erd', prefix(erd, 'erd_')))
# 3, 4: DFD fragments
for name, f, pid in (('2 - System Context Diagram', 'context.frag', 'ctx'), ('3 - Data Flow Diagram Level 0', 'level0.frag', 'l0'), ('4 - Data Flow Diagram Level 1 (Process 3.0 Manage Ticket Dispatch)', 'level1.frag', 'l1')):
    raw = open(S + f, encoding='utf-8').read()
    first, body = raw.split('\n', 1)
    W, H = map(int, first.split())
    cells = list(ET.fromstring('<r>' + body + '</r>'))
    for c in cells:
        c.set('parent', '1') if c.get('parent') is None else None
    pages.append((name, pid, prefix(model_from_cells(cells, W, H), pid + '_')))

for _, _, _model in pages:
    _model.set('background', '#FFFFFF')

# Line hops ("tunnels") where two lines cross, on every page that has crossings (Context has none).
for _, _pid, _model in pages:
    if _pid in ('erd', 'l0', 'l1'):
        for _c in _model.iter('mxCell'):
            if _c.get('edge') and 'jumpStyle' not in (_c.get('style') or ''):
                _c.set('style', (_c.get('style') or '') + 'jumpStyle=arc;jumpSize=8;')

mx = ET.Element('mxfile', host='app.diagrams.net', agent='AFN-SERVE diagram pack', version='24.0.0')
for name, pid, model in pages:
    d = ET.SubElement(mx, 'diagram', id='afn-' + pid, name=name)
    d.append(model)
ET.indent(mx, space=' ')
out = sys.argv[1]
# FINISH: draw.io dark mode turns a fixed white label background black, so use the theme-neutral 'default';
# connectors are black; fills stay flat and solid.
text = ET.tostring(mx, encoding='unicode')
for a, b in (('labelBackgroundColor=#FFFFFF', 'labelBackgroundColor=default'), ('strokeColor=#6B7280', 'strokeColor=#000000')):
    text = text.replace(a, b)
open(out, 'w', encoding='utf-8', newline='\n').write(text + '\n')
print('wrote', out, [p[0] for p in pages])
