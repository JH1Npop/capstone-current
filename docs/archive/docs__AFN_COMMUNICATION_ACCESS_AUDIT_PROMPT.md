# AFN Portal — COMMUNICATION & ACCESS Section Audit Prompt

## Scope
Audit the **COMMUNICATION** and **ACCESS** sections, covering:
- Messages
- User Management

---

# COMMUNICATION

## Messages

### Functionality Checklist
- [ ] Messages inbox loads with all conversations
- [ ] Unread message count is accurate and updates in real-time
- [ ] Sending a new message delivers successfully to the recipient
- [ ] Message threads are grouped correctly by conversation
- [ ] Messages display correct sender name, timestamp, and content
- [ ] Search across messages works (by sender, keyword, date)
- [ ] File/image attachments can be sent and received
- [ ] Attachments open or download correctly
- [ ] Message notifications appear (in-app and/or email)
- [ ] Messages can be deleted or archived
- [ ] Real-time or near-real-time message delivery (no manual refresh needed)
- [ ] Long message threads paginate or lazy-load correctly
- [ ] Typing indicators work (if applicable)
- [ ] Read receipts update correctly (if applicable)
- [ ] Messages are properly encrypted or secured in transit

### Common Issues to Flag
- Messages not delivered without page reload (no WebSocket or polling)
- Unread count not clearing when messages are opened
- Attachments failing to upload (size limit errors not shown)
- Search returning incorrect or no results
- Notifications not arriving for new messages
- Messages from deleted users throwing errors or blank sender names
- No empty state UI when inbox is empty
- Timestamp showing wrong timezone

---

# ACCESS

## User Management

### Functionality Checklist

#### User List
- [ ] All users load with correct details (name, role, email, status)
- [ ] User list is searchable by name, email, or role
- [ ] Filters by role, status (Active / Inactive), and department work
- [ ] Pagination works correctly on large user lists

#### Creating Users
- [ ] New user form captures all required fields
- [ ] Email validation prevents invalid formats
- [ ] Duplicate email check prevents creating users with existing emails
- [ ] Newly created user receives an invitation or onboarding email
- [ ] Role assignment works and applies correct permissions immediately
- [ ] Password setup / temp password flow works correctly

#### Editing Users
- [ ] Editing a user's details saves correctly
- [ ] Changing a user's role updates their permissions immediately
- [ ] Profile picture upload works (if applicable)
- [ ] Changes are logged in an audit trail

#### Deactivating / Deleting Users
- [ ] Deactivating a user blocks their login without deleting data
- [ ] Deleting a user triggers a confirmation dialog
- [ ] Deleted user's assigned tickets/cases are re-assigned or flagged
- [ ] Deleted user does not appear in assignment dropdowns across the portal

#### Role & Permission Management
- [ ] Role definitions are visible and editable (if Superadmin)
- [ ] Permission changes apply across all portal modules immediately
- [ ] No role escalation vulnerability (a lower-role user can't grant themselves Superadmin)
- [ ] At least one Superadmin must remain (system prevents deleting the last Superadmin)

#### Security Checks
- [ ] Password reset / force password change functionality works
- [ ] Two-factor authentication settings (if applicable) are configurable
- [ ] Session timeout settings apply correctly
- [ ] Login activity log is available per user
- [ ] Locked accounts can be unlocked from this panel

### Common Issues to Flag
- Deleting a user doesn't reassign their open tickets/cases (data orphaned)
- Role change not taking effect until user logs out and back in
- No duplicate email check on user creation
- Last Superadmin can be deleted (leaving system with no admin)
- Audit log missing for sensitive actions (role change, deletion)
- Password reset email not being sent or going to spam
- Inactive users still appearing in assignment dropdowns in other modules
- Bulk user import (if applicable) failing on certain CSV formats

---

## Cross-Section Concerns

| Concern | Detail |
|---|---|
| Message Permissions | Can all roles access Messages, or is it role-restricted? |
| User Deletion Cascade | When a user is deleted, are their messages, tickets, and cases handled gracefully? |
| Notification System | Is there a central notification configuration, or is it fragmented across Messages and other modules? |
| Audit Logging | All sensitive actions in User Management should be logged and reviewable |

---

## Output Format

```
### ❌ Issue #[N]: [Short Title]
- **Section:** COMMUNICATION > Messages  OR  ACCESS > User Management
- **Severity:** Critical / High / Medium / Low
- **Description:** [What is broken]
- **Steps to Reproduce:** [How to trigger]
- **Expected Behavior:** [What should happen]
- **Actual Behavior:** [What is happening]
- **✅ Recommended Fix:** [Solution]
```
