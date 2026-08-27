import copy
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
XML_NS = 'http://www.w3.org/XML/1998/namespace'
NS = {'w': WORD_NS}
ET.register_namespace('w', WORD_NS)


def qn(name):
    prefix, local = name.split(':', 1)
    if prefix == 'w':
        return f'{{{WORD_NS}}}{local}'
    if prefix == 'xml':
        return f'{{{XML_NS}}}{local}'
    raise ValueError(name)


def child_text(element):
    return ''.join(node.text or '' for node in element.findall('.//w:t', NS)).strip()


def set_paragraph_text(paragraph, text):
    ppr = paragraph.find('w:pPr', NS)
    for child in list(paragraph):
        if child is not ppr:
            paragraph.remove(child)

    run = ET.Element(qn('w:r'))
    text_node = ET.SubElement(run, qn('w:t'))
    if text.startswith(' ') or text.endswith(' ') or '  ' in text:
        text_node.set(qn('xml:space'), 'preserve')
    text_node.text = text
    paragraph.append(run)


def first_paragraph(container):
    paragraph = container.find('w:p', NS)
    if paragraph is None:
        paragraph = ET.SubElement(container, qn('w:p'))
    return paragraph


def set_cell_text(cell, text):
    set_paragraph_text(first_paragraph(cell), text)


def extract_fsr_body_children(body):
    children = list(body)
    title_index = None
    for index, child in enumerate(children):
        if 'Field Service Report' in child_text(child):
            title_index = index
            break
    if title_index is None:
        raise RuntimeError('Field Service Report section not found in source DOCX.')

    start_index = title_index
    for index in range(max(0, title_index - 5), title_index):
        child = children[index]
        if child.tag == qn('w:tbl') and 'AFN SOLAR POWER ENGINEERING SERVICES' in child_text(child):
            start_index = index
            break

    section_children = children[start_index:-1]
    sect_pr = copy.deepcopy(children[-1])
    return [copy.deepcopy(child) for child in section_children], sect_pr


def patch_fsr_elements(elements):
    title_index = next(
        index for index, element in enumerate(elements)
        if element.tag == qn('w:p') and 'Field Service Report' in child_text(element)
    )

    if title_index + 1 < len(elements) and elements[title_index + 1].tag == qn('w:p'):
        set_paragraph_text(elements[title_index + 1], 'Ticket Number: {{ ticket_number }}')

    header_table = next(
        element for element in elements
        if element.tag == qn('w:tbl') and 'Client:' in child_text(element) and 'Date:' in child_text(element)
    )
    header_cells = header_table.findall('.//w:tr', NS)[0].findall('w:tc', NS)
    left_paragraphs = header_cells[0].findall('w:p', NS)
    set_paragraph_text(left_paragraphs[0], 'Client: {{ client_name }}')
    set_paragraph_text(left_paragraphs[1], 'Address: {{ client_address }}')
    set_paragraph_text(left_paragraphs[2], 'Contact Number: {{ client_contact_number }}')
    set_paragraph_text(left_paragraphs[3], 'Technician: {{ technician_name }}')
    set_paragraph_text(header_cells[1].findall('w:p', NS)[0], 'Date: {{ service_date }}')

    for element in elements:
        if element.tag == qn('w:p') and child_text(element) == 'Before Service:':
            set_paragraph_text(element, 'Before Service: {{ before_service_readings }}')
            break

    service_table = next(
        element for element in elements
        if element.tag == qn('w:tbl') and 'Brand / Model' in child_text(element) and 'Recommendation' in child_text(element)
    )
    rows = service_table.findall('w:tr', NS)
    in_row = rows[2].findall('w:tc', NS)
    out_row = rows[5].findall('w:tc', NS)

    row_placeholders = [
        '{{ brand_model }}',
        '{{ tr_hp }}',
        '{{ serial_number }}',
        '{{ indoor_temp }}',
        '{{ outdoor_temp }}',
        '{{ ampere }}',
        '{{ others_specify }}',
        '{{ recommendation }}',
    ]
    for cell, placeholder in zip(in_row, row_placeholders):
        set_cell_text(cell, placeholder)

    set_cell_text(out_row[3], '{{ in_reading }}')
    set_cell_text(out_row[4], '{{ out_reading }}')


def main(source_path, output_path):
    with zipfile.ZipFile(source_path, 'r') as source_zip:
        document_xml = source_zip.read('word/document.xml')
        root = ET.fromstring(document_xml)
        body = root.find('w:body', NS)
        fsr_children, sect_pr = extract_fsr_body_children(body)
        patch_fsr_elements(fsr_children)

        new_body = ET.Element(qn('w:body'))
        for child in fsr_children:
            new_body.append(child)
        new_body.append(sect_pr)

        root.remove(body)
        root.append(new_body)
        rendered_document_xml = ET.tostring(root, encoding='utf-8', xml_declaration=True)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(output_path, 'w', compression=zipfile.ZIP_DEFLATED) as output_zip:
            for entry in source_zip.infolist():
                content = source_zip.read(entry.filename)
                if entry.filename == 'word/document.xml':
                    content = rendered_document_xml
                output_zip.writestr(entry, content)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: extract_original_fsr.py <source_docx> <output_docx>')
    main(Path(sys.argv[1]), Path(sys.argv[2]))
