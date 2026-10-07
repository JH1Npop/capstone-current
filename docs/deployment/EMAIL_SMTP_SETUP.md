# Email Delivery Setup

The backend sends email through Django's email backend. Configure SMTP in the
root `.env` file when you want real emails to reach inboxes.

## Render free staging: Brevo HTTPS API

Render free web services block outbound SMTP ports 25, 465, and 587. Staging
therefore uses the repository's Brevo HTTPS backend instead of bypassing email
verification:

```env
EMAIL_BACKEND=afn_service_management.email_backends.BrevoEmailBackend
BREVO_API_KEY=your_brevo_api_key
BREVO_API_TIMEOUT_SECONDS=15
DEFAULT_FROM_EMAIL=AFN Service <the-exact-verified-sender@example.com>
```

Before deployment:

1. Create or select a Brevo account.
2. Register and verify the sender address or sending domain in Brevo.
3. Create a Brevo API key.
4. In the Render backend service, set `BREVO_API_KEY` as a secret and
   `DEFAULT_FROM_EMAIL` to the exact verified sender (a display name is allowed).
5. Deploy, register with an inbox you control, open the verification link, then
   confirm login and password reset.

Production startup fails closed if the Brevo key is missing or the sender is a
placeholder. Never place the API key in `.env.example`, `render.yaml`, frontend
variables, logs, screenshots, commits, or chat. Brevo's endpoint contract is
documented at https://developers.brevo.com/docs/send-a-transactional-email and
Render's SMTP restriction at
https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports.

## SMTP-capable environments

## Environment

```env
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your_email@gmail.com
EMAIL_HOST_PASSWORD=your_email_app_password
DEFAULT_FROM_EMAIL=AFN Service <your_email@gmail.com>
```

For local debugging without sending real email, use:

```env
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
```

For Gmail, `EMAIL_HOST_PASSWORD` should be an app password, not the normal
account password.

Production startup rejects the SMTP backend when the username or password is
empty. Keep both values in the hosting provider's secret manager. Also set only
one of `EMAIL_USE_TLS=True` (normally port 587) or `EMAIL_USE_SSL=True`
(normally port 465); enabling both is invalid.

## Use In New Functions

Use direct email when the message should not appear in the notification list:

```python
from notifications.notification_utils import send_user_email

send_user_email(
    user=client,
    subject='Service Request Received',
    body='We received your service request and will review it shortly.',
)
```

Use system notification when the message should be saved in-app and also sent
by email:

```python
from notifications.notification_utils import send_user_notification

send_user_notification(
    user=client,
    title='Service Request Approved',
    body='Your request has been approved and converted into a service ticket.',
    notification_type='success',
    request=service_request,
    send_email=True,
)
```

Use team email for operational messages that should go to a selected group:

```python
from notifications.notification_utils import send_team_email

send_team_email(
    'Technician Schedule Update',
    'Please review your schedule for today.',
    role='technician',
)
```

Use team notification when admins or technicians should get both in-app records
and emails:

```python
from notifications.notification_utils import send_team_notification

send_team_notification(
    'Low Stock Warning',
    'Some inventory items are below minimum stock.',
    role='admin',
    notification_type='warning',
    send_email=True,
)
```
