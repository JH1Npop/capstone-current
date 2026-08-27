# Firebase Push Notifications Removed

Firebase Cloud Messaging is no longer part of the active AFN Service Management implementation.

The current notification flow uses:

- In-app notification records through the Django notifications app
- SMTP email for selected account, service request, ticket, and SLA events
- Optional SMS/Twilio settings where configured
- PWA assets for installability and offline shell behavior, not Firebase push delivery

For current email configuration, see:

```text
docs/deployment/EMAIL_SMTP_SETUP.md
```

Historical Firebase notes may still exist in archived audit files and old diagram source exports. Those files are retained as historical references, not active setup instructions.
