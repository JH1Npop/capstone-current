from django.core.management.base import BaseCommand

from services.after_sales_alerts import process_overdue_after_sales_cases, process_warranty_expiry_reminders


class Command(BaseCommand):
    help = 'Send warranty-ending reminders and overdue after-sales case alerts (once each).'

    def handle(self, *args, **options):
        from services.billing import process_overdue_billing_reminders

        warranty = process_warranty_expiry_reminders()
        overdue = process_overdue_after_sales_cases()
        billing = process_overdue_billing_reminders()
        self.stdout.write(
            self.style.SUCCESS(
                f"Processed after-sales alerts: {warranty['warranty_reminders']} warranty reminders "
                f"({warranty['warranty_emails']} emailed), {overdue['overdue_cases']} overdue cases, "
                f"{billing['billing_reminders']} overdue payment reminders."
            )
        )
