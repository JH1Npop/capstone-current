# Authentication and Account Security Contract

This is the current contract for API tokens, account state, email verification,
password recovery, and account-management authority.

## Account state

- An account may authenticate only when both Django `is_active` and the business
  `status` field are active.
- Account-management endpoints update those fields together. Deactivation also
  revokes existing API tokens through the user security signal.
- Email verification cannot reactivate an account disabled by an administrator.
- A configured administrator with `users.directory.manage` may manage client and
  technician accounts, but only the superadmin may manage another administrator.
- The superadmin cannot modify or deactivate their own account through generic
  user-management endpoints. Self-service profile and password endpoints remain
  available for safe fields.
- User deletion endpoints perform reversible deactivation rather than deleting
  business history.

## Tokens and sessions

- Login replaces any prior DRF token, so each account has one current API token.
- Password change and password reset revoke all current API tokens and require a
  fresh login.
- Role, status, and `is_active` changes revoke current tokens. Unrelated partial
  user saves must not be treated as privilege changes.
- WebSocket token authentication rejects accounts whose `is_active` or `status`
  state is inactive.

## Verification and recovery

- Public registration can create only client accounts. Admin and technician
  creation requires the superadmin workflow.
- New registrations reject case-insensitive duplicate email addresses. Legacy
  duplicates are preserved for manual reconciliation rather than rewritten.
- Unverified client registrations are retained for the configurable verification
  window (`EMAIL_VERIFICATION_EXPIRY_HOURS`, 24 hours by default), then cleaned up
  opportunistically by authentication and user-directory endpoints.
- Unverified clients may request another verification message. Resends share the
  registration throttle, enforce the configurable
  `EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS` interval (60 seconds by default),
  and return the same response whether or not an eligible account exists.
- Password-reset requests use the same response whether an account exists or not.
  Emails are sent only for active, verified accounts.
- Recovery and verification links always use configured `FRONTEND_BASE_URL`, not
  caller-controlled Origin or Referer headers.
- A recovery link cannot reset an account after that account is deactivated.

## WebSocket authorization

- Inventory WebSocket access follows the same inventory-view capability used by
  REST APIs; technicians retain their operational read access.
- Ticket messaging accepts assigned lead technicians, crew technicians, the
  owning client, and administrators with the relevant communication capability.
  A sender cannot select an unrelated receiver.
- Technician message REST and WebSocket access requires
  `technician.messages.view`. Administrator staff conversations require
  `communications.staff.view`; viewing client support requires
  `communications.support.view` or `.manage`, and replying or changing a case
  requires `.manage`.
- Typing indicators use the same ticket-participant validation as saved messages.
- Disabled accounts and invalid tokens are rejected before joining a channel group.

## Administrative feature isolation

- The full operations dashboard requires `supervisor.dashboard.view`; analytics,
  tracking, dispatch, support, or other unrelated capabilities do not unlock its
  cross-domain client, technician, inventory, SLA, and after-sales summaries.
- Coverage density and live technician coverage require
  `supervisor.tracking.view`; completed-job evidence requires the separate
  `admin.job_history.view` capability.
- Operational settings require `system.settings.view` or
  `system.settings.manage`; only manage authority may change them.
- Public-site access is independently assignable: `public_site.view` reads the
  editor, `public_site.publish` publishes content, `public_site.assets.upload`
  uploads validated images, and `public_site.assets.delete` removes unreferenced
  images. The legacy `public_site.manage` grant remains an umbrella for all
  three mutations. Any public-site-only administrator receives landing-page
  fields from the shared settings endpoint, not operational settings.
- Support notifications are delivered only to active administrators authorized
  to view support, preventing case subjects from leaking to restricted accounts.
- Direct REST ticket replies to clients are support actions and require
  `communications.support.manage`, matching the WebSocket rule.

Direct regression coverage is in `backend/users/tests.py` and
`backend/messages_app/tests.py`.
