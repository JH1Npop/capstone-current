"""Compatibility baseline for the legacy six-type DOCX generator.

These tests intentionally exercise the existing renderer before dynamic template
infrastructure is introduced. They protect document output without making the
template layer authoritative for quotation, deposit, or dispatch state.
"""

from datetime import timedelta
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import BadZipFile, ZipFile

from django.test import TestCase
from django.utils import timezone

from services.deposits import ticket_deposit_gate
from services.document_generation import (
    TEMPLATE_FILENAMES,
    build_commissioning_context,
    build_field_service_report_context,
    generate_document,
)
from services.models import (
    FieldServiceReport,
    GeneratedDocument,
    QuotationRecord,
    SolarCommissioningChecklist,
    ServiceRequest,
    ServiceTicket,
    ServiceType,
)
from services.serializers import FieldServiceReportSerializer, SolarCommissioningChecklistSerializer
from users.models import User


class LegacyDocumentGenerationBaselineTests(TestCase):
    maxDiff = None

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='document-baseline-admin',
            email='document-baseline-admin@example.test',
            password='pass',
            role='admin',
            first_name='Alex',
            last_name='Manager',
        )
        self.client_user = User.objects.create_user(
            username='document-baseline-client',
            email='document-baseline-client@example.test',
            password='pass',
            role='client',
            first_name='Jamie &',
            last_name='Customer',
        )
        self.service = ServiceType.objects.create(
            name='Solar Installation <Baseline>',
            estimated_duration=480,
            requires_site_inspection=False,
            deposit_policy='percentage',
            deposit_value=Decimal('30.00'),
        )
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service,
            description='Phase A document baseline',
            status='Approved',
        )
        self.ticket = ServiceTicket.objects.create(
            request=request_obj,
            status='Ready for Service',
            ticket_type='installation',
            scheduled_date=timezone.localdate() + timedelta(days=1),
            project_details={'system_capacity_kwp': '5.5'},
        )
        self.quotation = QuotationRecord.objects.create(
            ticket=self.ticket,
            client=self.client_user,
            quotation_number='QUO-BASELINE-001',
            total_amount='PHP 100,000.00',
            downpayment_amount='PHP 30,000.00',
            balance_amount='PHP 70,000.00',
            deposit_policy='percentage',
            deposit_value=Decimal('30.00'),
            required_deposit_amount=Decimal('30000.00'),
            status='Accepted',
            bill_of_materials=[{
                'itemNo': '1',
                'description': 'PV module & mounting kit',
                'unit': 'set',
                'qty': '1',
                'unitPrice': '100000.00',
                'amount': '100000.00',
            }],
        )

    def test_all_six_legacy_types_generate_valid_docx_without_unresolved_tokens(self):
        """Every current core type remains renderable during phased migration."""

        expected_types = {
            'technical_data_sheet',
            'quotation_proposal',
            'installation_contract',
            'commissioning_checklist',
            'turnover_acceptance',
            'field_service_report',
        }
        self.assertEqual(set(TEMPLATE_FILENAMES), expected_types)

        before_gate = ticket_deposit_gate(self.ticket)
        before_quotation = {
            'status': self.quotation.status,
            'total_amount': self.quotation.total_amount,
            'required_deposit_amount': self.quotation.required_deposit_amount,
            'bill_of_materials': self.quotation.bill_of_materials,
        }

        with TemporaryDirectory() as temporary_directory:
            output_directory = Path(temporary_directory)
            generated_paths = []

            # Patch the module-level output directory without altering Django's
            # configured storage or the repository's media directory.
            from services import document_generation

            original_generated_dir = document_generation.GENERATED_DIR
            document_generation.GENERATED_DIR = output_directory
            try:
                for document_type in sorted(expected_types):
                    output_path = generate_document(self.ticket, document_type)
                    generated_paths.append(output_path)
                    self.assertEqual(output_path.parent, output_directory)
                    self.assertTrue(output_path.exists())
                    self.assertGreater(output_path.stat().st_size, 0)

                    try:
                        with ZipFile(output_path, 'r') as archive:
                            self.assertIsNone(archive.testzip())
                            self.assertIn('[Content_Types].xml', archive.namelist())
                            self.assertIn('word/document.xml', archive.namelist())
                            rendered_xml = b'\n'.join(
                                archive.read(name)
                                for name in archive.namelist()
                                if name == 'word/document.xml'
                                or name.startswith('word/header')
                                or name.startswith('word/footer')
                            )
                    except BadZipFile as exc:  # pragma: no cover - clearer failure
                        self.fail(f'{document_type} did not produce a valid DOCX ZIP: {exc}')

                    self.assertNotIn(b'{{', rendered_xml, document_type)
                    self.assertNotIn(b'}}', rendered_xml, document_type)
            finally:
                document_generation.GENERATED_DIR = original_generated_dir

            self.assertEqual(len(generated_paths), len(expected_types))

        self.quotation.refresh_from_db()
        self.ticket.refresh_from_db()
        self.assertEqual(
            {
                'status': self.quotation.status,
                'total_amount': self.quotation.total_amount,
                'required_deposit_amount': self.quotation.required_deposit_amount,
                'bill_of_materials': self.quotation.bill_of_materials,
            },
            before_quotation,
        )
        self.assertEqual(ticket_deposit_gate(self.ticket), before_gate)
        self.assertFalse(GeneratedDocument.objects.filter(ticket=self.ticket).exists())

    def test_legacy_aliases_resolve_without_changing_the_core_type_registry(self):
        """Existing API aliases remain compatible while stable codes stay fixed."""

        aliases = {
            'solar_installation_contract': 'installation_contract',
            'pv_solar_commissioning_checklist': 'commissioning_checklist',
            'turnover_acceptance_form': 'turnover_acceptance',
        }
        from services.document_generation import canonical_document_type

        for alias, expected in aliases.items():
            with self.subTest(alias=alias):
                self.assertEqual(canonical_document_type(alias), expected)

        self.assertEqual(
            {value for value, _label in GeneratedDocument.DOCUMENT_TYPE_CHOICES},
            set(TEMPLATE_FILENAMES),
        )

    def test_field_service_report_versioned_printable_draft_preserves_rows_and_canonical_lock(self):
        """The schema snapshot is presentation data; technician acknowledgment remains authoritative."""

        report = FieldServiceReport.objects.create(
            ticket=self.ticket,
            brand_model='Canonical unit',
            before_service_readings='Before reading',
            after_service_readings='After reading',
            recommendation='Canonical recommendation',
            client_acknowledged=True,
        )
        GeneratedDocument.objects.create(
            ticket=self.ticket,
            document_type='field_service_report',
            title='Field Service Report',
            data_json={
                '_documentSchema': {'code': 'field_service_report', 'version': 1},
                'clientName': 'Printable client name',
                'rows': [
                    {'brandModel': 'Unit A', 'serialNumber': 'A-1', 'recommendation': 'Cleaned'},
                    {'brandModel': 'Unit B', 'serialNumber': 'B-2', 'recommendation': 'Monitor'},
                ],
            },
        )

        context = build_field_service_report_context(self.ticket, report_id=report.id)

        self.assertEqual(context['client_name'], 'Printable client name')
        self.assertEqual([row['brand_model'] for row in context['service_rows']], ['Unit A', 'Unit B'])
        self.assertEqual(context['service_rows'][1]['serial_number'], 'B-2')
        self.assertEqual(context['before_service_readings'], 'Before reading')
        self.assertEqual(context['after_service_readings'], 'After reading')

        locked_update = FieldServiceReportSerializer(
            report,
            data={'recommendation': 'Attempted overwrite'},
            partial=True,
        )
        self.assertFalse(locked_update.is_valid())
        self.assertIn('acknowledged', str(locked_update.errors).lower())
        report.refresh_from_db()
        self.assertEqual(report.recommendation, 'Canonical recommendation')

    def test_commissioning_context_preserves_all_items_and_finalized_record_lock(self):
        """Schema extraction must not truncate the canonical checklist or weaken finalization."""

        checklist_items = [
            {
                'item_no': item_no,
                'section': 'Schema checkpoint',
                'description': f'Commissioning item {item_no}',
                'check_status': 'Pass' if item_no == 1 else '',
                'remarks': 'Verified' if item_no == 54 else '',
            }
            for item_no in range(1, 55)
        ]
        checklist = SolarCommissioningChecklist.objects.create(
            ticket=self.ticket,
            site_name='Schema checkpoint site',
            status='finalized',
            checklist_items_json=checklist_items,
            readings_json={
                'inverter_display': {'phase_a_voltage': '230'},
                'field_measured': {'phase_a_voltage': '229'},
                'weather_condition': 'Sunny',
                'remarks': 'Canonical technician note',
            },
        )

        context = build_commissioning_context(self.ticket)

        self.assertEqual(context['site_name'], 'Schema checkpoint site')
        self.assertEqual(len(context['checklist_rows']), 54)
        self.assertEqual(context['checklist_rows'][0]['check_status'], 'Pass')
        self.assertEqual(context['checklist_rows'][53]['remarks'], 'Verified')
        self.assertEqual(context['reading_rows'][0]['inverter_display'], '230')
        self.assertEqual(context['reading_rows'][0]['field_measured'], '229')

        locked_update = SolarCommissioningChecklistSerializer(
            checklist,
            data={'site_name': 'Attempted overwrite'},
            partial=True,
        )
        self.assertFalse(locked_update.is_valid())
        self.assertIn('finalized', str(locked_update.errors).lower())
        checklist.refresh_from_db()
        self.assertEqual(checklist.site_name, 'Schema checkpoint site')
