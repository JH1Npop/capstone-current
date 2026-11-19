"""Settings > Documents: the footer and the payment notice are printed on generated documents."""

import io
from zipfile import ZipFile

from django.test import SimpleTestCase

from services.dynamic_document_generation import render_template_bytes

BODY = '<w:p><w:r><w:t>{text}</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>'


def docx(body_text='Quotation for {{ client_name }}'):
    buffer = io.BytesIO()
    with ZipFile(buffer, 'w') as archive:
        archive.writestr('[Content_Types].xml', '<Types/>')
        archive.writestr('word/document.xml', (
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
            + BODY.format(text=body_text) + '</w:body></w:document>'
        ))
    buffer.seek(0)
    return buffer


def rendered_text(data):
    with ZipFile(io.BytesIO(data)) as archive:
        return archive.read('word/document.xml').decode('utf-8')


class DocumentSettingsTextTests(SimpleTestCase):
    context = {
        'client_name': 'Ana', 'document_footer': 'AFN & Co. | Thank you',
        'external_payment_notice': 'Pay by bank transfer only.',
    }

    def test_quotation_prints_the_notice_and_the_footer_before_the_page_settings(self):
        xml = rendered_text(render_template_bytes(docx(), self.context, document_type='quotation_proposal'))
        self.assertIn('Pay by bank transfer only.', xml)
        self.assertIn('AFN &amp; Co. | Thank you', xml)  # escaped for XML
        self.assertLess(xml.index('Pay by bank transfer only.'), xml.index('AFN &amp; Co.'))
        self.assertLess(xml.index('AFN &amp; Co.'), xml.index('<w:sectPr'))

    def test_other_documents_get_the_footer_but_not_the_payment_notice(self):
        xml = rendered_text(render_template_bytes(docx(), self.context, document_type='technical_data_sheet'))
        self.assertIn('AFN &amp; Co.', xml)
        self.assertNotIn('Pay by bank transfer only.', xml)

    def test_nothing_is_added_when_empty_or_when_the_template_places_it_itself(self):
        empty = {**self.context, 'document_footer': '', 'external_payment_notice': ''}
        xml = rendered_text(render_template_bytes(docx(), empty, document_type='quotation_proposal'))
        self.assertEqual(xml.count('<w:p>'), 1)

        placed = docx('{{ document_footer }} / {{ external_payment_notice }}')
        xml = rendered_text(render_template_bytes(placed, self.context, document_type='quotation_proposal'))
        self.assertEqual(xml.count('AFN &amp; Co.'), 1)
        self.assertEqual(xml.count('Pay by bank transfer only.'), 1)
