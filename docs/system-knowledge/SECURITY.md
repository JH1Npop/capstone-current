# Security Architecture

Authentication uses a custom Django user and DRF tokens. Email verification gates login; reset/change flows use expiring tokens. Optional administrator RFC 6238 TOTP secrets are encrypted and recovery codes hashed. Authorization combines roles, delegated capabilities, endpoint permissions, ownership querysets, and Channels consumer checks. Frontend RBAC is defense-in-depth UX only.

Production settings fail closed for debug, weak secrets, hosts/origins, HTTPS, PostgreSQL, durable media, Redis, and email configuration. CORS/CSRF and secure-cookie/HSTS behavior are environment controlled. Request throttles cover anonymous/auth and sensitive scopes. Uploads check signatures, allowlists, and sizes. Activity/change/status histories provide audit evidence; request IDs correlate logs.

Known assurance gaps: no malware scanner, no completed external penetration test, no verified SAST baseline, no external log/alerting setup, and optional MFA is not yet fully enrolled/configured. Staging account cleanup/token revocation is pending. See `docs/security/AUTHENTICATION_ACCOUNT_SECURITY_CONTRACT.md`, privacy policy, capability matrix, and [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md).
