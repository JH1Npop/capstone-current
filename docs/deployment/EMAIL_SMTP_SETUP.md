# Email and SMTP Setup

The backend sends email through Django's email backend. Configure SMTP in the
root `.env` file when you want real emails to reach inboxes.

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
