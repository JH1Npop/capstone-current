"""Suggest fields for a finished Word design: find "Client Name: ______" style blanks and turn them into [Client Name].

Only labels that stand for an approved field of the document are offered, so ordinary text such as "Note:" is left alone.
Applying a suggestion never edits the uploaded file: it produces new bytes that are saved as a new draft version.
"""
import io
import re
from html import unescape
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

PARAGRAPH_RE = re.compile(r'<w:p[ >].*?</w:p>', re.S)
TEXT_RE = re.compile(r'(<w:t(?: [^>]*)?>)([^<]*)(</w:t>)')
# "Label:" then optionally a run of blank-line characters, and nothing else in the paragraph.
LABEL_BLANK_RE = re.compile(r'^(?P<lead>\s*)(?P<label>[A-Za-z][A-Za-z0-9 .\'/&-]{1,40}?)\s*:(?P<gap>\s*)(?P<filler>[_.…—-]{3,}\s*)?$')
MAX_SUGGESTIONS = 40


def _marker(label):
    return '[%s]' % ' '.join(label.split())


def _pieces(paragraph_xml):
    return [(m.start(2), m.end(2), unescape(m.group(2))) for m in TEXT_RE.finditer(paragraph_xml)]


def _match(paragraph_xml, allowed):
    from services.document_templates import resolve_plain_name

    text = ''.join(piece[2] for piece in _pieces(paragraph_xml))
    if '{{' in text or '[' in text:
        return None
    found = LABEL_BLANK_RE.match(text)
    if not found:
        return None
    label = found.group('label').strip().rstrip('.')
    key = resolve_plain_name(label, allowed)
    if not key:
        return None
    return {'label': label, 'key': key, 'text': text, 'filler': found.group('filler'), 'filler_start': found.start('filler') if found.group('filler') else None}


def find_blank_suggestions(document_xml, allowed):
    """[{'label': 'Client Name', 'key': 'client_name', 'marker': '[Client Name]', 'count': 2}] for the main document part."""
    seen = {}
    for paragraph in PARAGRAPH_RE.findall(document_xml):
        info = _match(paragraph, allowed)
        if not info:
            continue
        entry = seen.setdefault(info['label'], {'label': info['label'], 'key': info['key'], 'marker': _marker(info['label']), 'count': 0})
        entry['count'] += 1
    return list(seen.values())[:MAX_SUGGESTIONS]


def _fill_paragraph(paragraph_xml, info):
    marker = _marker(info['label'])
    if info['filler_start'] is None:
        run = '<w:r><w:t xml:space="preserve"> %s</w:t></w:r>' % escape(marker)
        return paragraph_xml[:paragraph_xml.rindex('</w:p>')] + run + '</w:p>'
    start = info['filler_start']
    end = start + len(info['filler'].rstrip())
    cursor = 0
    pieces = []
    inserted = False
    for match in TEXT_RE.finditer(paragraph_xml):
        raw = unescape(match.group(2))
        lo, hi = cursor, cursor + len(raw)
        cursor = hi
        if hi <= start or lo >= end:
            pieces.append((match, raw))
            continue
        kept_before = raw[:max(0, start - lo)]
        kept_after = raw[max(0, end - lo):] if hi > end else ''
        middle = marker if not inserted else ''
        inserted = True
        pieces.append((match, kept_before + middle + kept_after))
    out, last = [], 0
    for match, new_text in pieces:
        out.append(paragraph_xml[last:match.start(1)])
        if new_text == unescape(match.group(2)):
            out.append(match.group(0))
        else:
            out.append('<w:t xml:space="preserve">' + escape(new_text) + match.group(3))
        last = match.end(3)
    out.append(paragraph_xml[last:])
    return ''.join(out)


def apply_blank_suggestions(docx_bytes, allowed, labels):
    """New DOCX bytes with the chosen blanks replaced by [Label] fields, and the list of labels actually changed."""
    wanted = {label.strip() for label in labels}
    applied = set()
    source = ZipFile(io.BytesIO(docx_bytes))
    xml = source.read('word/document.xml').decode('utf-8')

    def replace(match):
        paragraph = match.group(0)
        info = _match(paragraph, allowed)
        if not info or info['label'] not in wanted:
            return paragraph
        applied.add(info['label'])
        return _fill_paragraph(paragraph, info)

    new_xml = PARAGRAPH_RE.sub(replace, xml)
    output = io.BytesIO()
    with ZipFile(output, 'w', ZIP_DEFLATED) as target:
        for entry in source.infolist():
            data = new_xml.encode('utf-8') if entry.filename == 'word/document.xml' else source.read(entry.filename)
            target.writestr(entry, data)
    source.close()
    return output.getvalue(), sorted(applied)
