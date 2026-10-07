# Privacy and Data Handling Baseline

This is an engineering baseline, not legal advice. Before production use, the business owner must adapt it to the jurisdictions, contracts, and categories of personal data actually involved.

## Data handled

The system can hold identity/contact details, addresses and field locations, service history, messages, uploaded photos/videos/documents, audit metadata, staff assignments, and operational/financial records. Access must remain limited by role and delegated capability, with administrator access reviewed regularly.

## Required operating rules

- Collect only data needed for a declared service purpose and publish a clear privacy notice.
- Obtain and record an appropriate legal basis or consent where required.
- Never place secrets, passwords, tokens, MFA material, or full database URLs in tickets, logs, screenshots, or documentation.
- Use TLS in transit, provider encryption at rest, encrypted off-host backups, and MFA for administrator accounts.
- Define retention periods by record category. Delete or anonymize data when the purpose and legal retention period end, including exported files and backups under their lifecycle.
- Provide an authenticated process for access, correction, export, restriction, and deletion requests; preserve records that must legally be retained and explain the exception.
- Keep production access named, least-privileged, logged, reviewed, and removed promptly when staff leave or duties change.
- Use sanitized or synthetic data in development, demonstrations, load tests, and support investigations.
- Evaluate processors for database, media, email, maps, monitoring, and AI services; document data location, retention, subprocessors, and breach terms.
- Report suspected exposure through the incident process immediately; do not investigate by copying live data to personal devices.

## Pre-launch owner decisions

The owner must name the privacy contact, approve the privacy notice and retention schedule, document processors, decide whether location/media processing requires additional consent, and establish a tested request-handling and breach-notification process.
