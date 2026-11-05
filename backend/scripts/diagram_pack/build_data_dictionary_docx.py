"""Build AFN-SERVE-Data-Dictionary.docx from data_dictionary.json (see build_data_dictionary.py).

Layout follows the capstone sample: "Table N: Name", columns FieldName | DataType | PK | FK | Null | Description,
"Yes" in place of a check mark, and one description paragraph under each table. Uses python-docx (already installed).
"""
import json
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, Twips

HERE = Path(__file__).resolve().parent
TABLES = json.loads((HERE / "data_dictionary.json").read_text(encoding="utf-8"))
OUT = HERE.parents[2] / "docs/academic/final_diagrams/AFN-SERVE-Data-Dictionary.docx"

FONT = "Times New Roman"
WIDTHS = [2400, 1200, 600, 600, 700, 3860]   # twips; sums to 9360 = US Letter with 1 inch margins


def set_font(run, size, bold=False):
    run.font.name = FONT
    run.font.size = Pt(size)
    run.font.bold = bold
    run._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)


def paragraph(doc, text, size=12, bold=False, align=None, before=0, after=0, keep_next=False, line=None):
    p = doc.add_paragraph()
    run = p.add_run(text)
    set_font(run, size, bold)
    fmt = p.paragraph_format
    fmt.space_before, fmt.space_after, fmt.keep_with_next = Pt(before), Pt(after), keep_next
    if line:
        fmt.line_spacing = line
    if align is not None:
        p.alignment = align
    return p


def border_all(cell):
    props = cell._element.get_or_add_tcPr()
    borders = OxmlElement("w:tcBorders")
    for side in ("top", "left", "bottom", "right"):
        el = OxmlElement(f"w:{side}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), "4")
        el.set(qn("w:color"), "000000")
        borders.append(el)
    props.insert_element_before(borders, "w:shd", "w:noWrap", "w:tcMar", "w:textDirection", "w:tcFitText", "w:vAlign", "w:hideMark")


def set_cell(cell, text, width, bold=False, center=False):
    cell.width = Twips(width)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    border_all(cell)
    margins = OxmlElement("w:tcMar")
    for side, value in (("top", 70), ("left", 90), ("bottom", 70), ("right", 90)):
        el = OxmlElement(f"w:{side}")
        el.set(qn("w:w"), str(value))
        el.set(qn("w:type"), "dxa")
        margins.append(el)
    cell._element.get_or_add_tcPr().insert_element_before(margins, "w:textDirection", "w:tcFitText", "w:vAlign", "w:hideMark")
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    if center:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    set_font(run, 10, bold)


def row_flags(row, header=False):
    props = row._tr.get_or_add_trPr()
    props.append(OxmlElement("w:cantSplit"))
    if header:
        props.append(OxmlElement("w:tblHeader"))


def add_table(doc, entry):
    table = doc.add_table(rows=1, cols=6)
    table.autofit = False
    row_flags(table.rows[0], header=True)
    for i, label in enumerate(["FieldName", "DataType", "PK", "FK", "Null", "Description"]):
        set_cell(table.rows[0].cells[i], label, WIDTHS[i], bold=True, center=2 <= i <= 4)
    for r in entry["rows"]:
        row = table.add_row()
        row_flags(row)
        values = [r["field"], r["type"], "Yes" if r["pk"] else "", "Yes" if r["fk"] else "", "Yes" if r["null"] else "",
                  r["description"]]
        for i, value in enumerate(values):
            set_cell(row.cells[i], value, WIDTHS[i], center=2 <= i <= 4)
    grid = table._tbl.tblGrid
    for i, col in enumerate(grid.findall(qn("w:gridCol"))):
        col.set(qn("w:w"), str(WIDTHS[i]))


def main():
    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Inches(8.5), Inches(11)
    section.left_margin = section.right_margin = section.top_margin = section.bottom_margin = Inches(1)
    normal = doc.styles["Normal"]
    normal.font.name = FONT
    normal.font.size = Pt(12)
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    for zoom in doc.settings.element.findall(qn("w:zoom")):
        zoom.set(qn("w:percent"), "100")
    doc.core_properties.title = "The Data Dictionary from the Data Schema"
    doc.core_properties.author = "AFN-SERVE"
    paragraph(doc, "The Data Dictionary from the Data Schema", bold=True, after=12, keep_next=True)
    for entry in TABLES:
        paragraph(doc, f"Table {entry['number']}: {entry['name']}", bold=True, before=10, after=6, keep_next=True)
        add_table(doc, entry)
        paragraph(doc, entry["description"], align=WD_ALIGN_PARAGRAPH.JUSTIFY, before=8, after=12, line=1.15)
    doc.save(OUT)
    print("wrote", OUT, f"({len(TABLES)} tables)")


if __name__ == "__main__":
    main()
