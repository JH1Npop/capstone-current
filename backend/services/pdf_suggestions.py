"""Suggest where AFN fields go on a text-based PDF: find "Client Name:" labels and propose a box right after each one.

Works only for PDFs that contain real text (saved from Word or another program). A scanned page is a photo with no
readable text, so nothing is suggested and the boxes are placed by hand as before. Boxes are estimates: widths of the
label text are approximated, so staff review and can nudge them in the field editor.
"""
import io
import re

from pypdf import PdfReader

MAX_PAGES = 20
MAX_SUGGESTIONS = 40
LABEL_RE = re.compile(r"(?:^|(?<=\s)|(?<=_))([A-Za-z][A-Za-z0-9 .'/&-]{1,40}?)\s*:")
BLANK_RE = re.compile(r'^[\s_.…—-]*$')
LINE_TOLERANCE = 2.5


def _collect_chunks(page):
    chunks = []

    def visitor(text, cm, tm, _font, font_size):
        if not text or not text.strip():
            return
        x = cm[0] * tm[4] + cm[2] * tm[5] + cm[4]
        y = cm[1] * tm[4] + cm[3] * tm[5] + cm[5]
        scale = (abs(tm[3]) or 1) * (abs(cm[3]) or 1)
        chunks.append({'text': text.replace('\n', ' '), 'x': x, 'y': y, 'size': max(6.0, min(24.0, float(font_size or 10) * scale))})

    page.extract_text(visitor_text=visitor)
    return chunks


def _lines(chunks):
    lines = []
    for chunk in sorted(chunks, key=lambda item: (-item['y'], item['x'])):
        for line in lines:
            if abs(line['y'] - chunk['y']) <= LINE_TOLERANCE:
                line['chunks'].append(chunk)
                break
        else:
            lines.append({'y': chunk['y'], 'chunks': [chunk]})
    for line in lines:
        line['chunks'].sort(key=lambda item: item['x'])
    return lines


def _line_text_with_positions(line):
    """The line as one string, with the estimated x position of every character."""
    text, positions = '', []
    for chunk in line['chunks']:
        char_width = chunk['size'] * 0.5
        if text and not text.endswith(' ') and not chunk['text'].startswith(' '):
            text += ' '
            positions.append(chunk['x'])
        for index, char in enumerate(chunk['text']):
            text += char
            positions.append(chunk['x'] + index * char_width)
    return text, positions


def find_pdf_field_suggestions(pdf_bytes, allowed):
    """[{'label', 'key', 'page', 'placement': {x, y, width, height}}] with y measured from the top, as fractions of the page."""
    from services.document_templates import COLLECTION_PLACEHOLDERS, resolve_plain_name

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes), strict=False)
        suggestions, used_keys = [], set()
        for page_index, page in enumerate(reader.pages[:MAX_PAGES]):
            if page.get('/Rotate', 0) not in (0, None):
                continue
            box = page.mediabox
            page_width, page_height = float(box.width), float(box.height)
            left, bottom = float(box.left), float(box.bottom)
            if page_width <= 0 or page_height <= 0:
                continue
            for line in _lines(_collect_chunks(page)):
                text, positions = _line_text_with_positions(line)
                size = max(chunk['size'] for chunk in line['chunks'])
                labels = list(LABEL_RE.finditer(text))
                for index, match in enumerate(labels):
                    rest_end = labels[index + 1].start() if index + 1 < len(labels) else len(text)
                    if not BLANK_RE.match(text[match.end():rest_end]):
                        continue
                    label = match.group(1).strip().rstrip('.')
                    key = resolve_plain_name(label, allowed)
                    if not key or key in used_keys or key in COLLECTION_PLACEHOLDERS:
                        continue
                    colon_x = positions[min(match.end() - 1, len(positions) - 1)] + size * 0.5
                    next_x = positions[labels[index + 1].start()] if index + 1 < len(labels) else left + page_width - 36
                    x = colon_x + 4
                    width = max(60.0, min(next_x - x - 6, page_width * 0.45))
                    if x + 30 > left + page_width:
                        continue
                    box_height = size * 1.5
                    top_from_bottom = line['y'] + size * 1.0
                    top = page_height - (top_from_bottom - bottom)
                    placement = {
                        'x': round(max(0.0, (x - left) / page_width), 4),
                        'y': round(max(0.0, top / page_height), 4),
                        'width': round(min(width / page_width, 1.0), 4),
                        'height': round(box_height / page_height, 4),
                    }
                    if placement['x'] + placement['width'] > 1 or placement['y'] + placement['height'] > 1:
                        continue
                    used_keys.add(key)
                    suggestions.append({'label': label, 'key': key, 'page': page_index + 1, 'placement': placement})
                    if len(suggestions) >= MAX_SUGGESTIONS:
                        return suggestions
        return suggestions
    except Exception:
        # Suggestions are a convenience. A PDF that cannot be read for text is still a valid, saved template.
        return []
