# AFN Portal — AFTER-SALES Section Audit Prompt

## Scope
Audit the **AFTER-SALES** section, covering:
- After Sales Cases
- Open Cases
- Overdue
- Job History

> ⚠️ **Note:** Badge counts are currently showing — After Sales Cases: **6**, Open Cases: **6**, Overdue: **3**. These must be validated as part of the audit.

---

## After Sales Cases

### Functionality Checklist
- [ ] All after-sales cases load with correct data
- [ ] Badge count (6) matches the actual number of unresolved cases in the list
- [ ] Creating a new case captures all required fields (customer, issue type, priority, description)
- [ ] Cases can be assigned to agents/teams
- [ ] Case status transitions work (New → In Progress → Resolved → Closed)
- [ ] Customers can be linked to cases without errors
- [ ] Attachments (photos, docs) can be uploaded to a case
- [ ] Internal notes/comments are saveable and timestamped
- [ ] SLA timers (if applicable) are counting correctly
- [ ] Cases can be escalated
- [ ] Filters (status, date, agent, priority) work correctly
- [ ] Search by case ID or customer name is functional

### Common Issues to Flag
- Badge count (6) doesn't match actual visible cases in the list
- Creating a case with missing required fields doesn't show proper validation errors
- Case assignment not notifying the assigned agent
- SLA breach not triggering an alert
- Status change not logging in audit trail

---

## Open Cases

### Functionality Checklist
- [ ] List shows only cases with "Open" or "In Progress" status
- [ ] Badge count (6) matches the actual number of open cases
- [ ] Sorting by date, priority, or assignee works
- [ ] Quick-action to close or escalate a case is available
- [ ] Cases can be bulk-assigned or bulk-closed
- [ ] Real-time update when a case is resolved (it disappears from the list)
- [ ] Pagination handles many open cases correctly

### Common Issues to Flag
- Closed or resolved cases still appearing in the Open Cases list
- Badge count not decrementing when a case is closed
- Bulk actions not working or applying to wrong records
- No confirmation prompt before bulk-closing cases

---

## Overdue

### Functionality Checklist
- [ ] List shows only cases that have exceeded their SLA or due date
- [ ] Badge count (3) matches the actual number of overdue items
- [ ] Overdue criteria is clearly defined (e.g., past due date, past SLA timer)
- [ ] Overdue cases are sorted by most overdue first
- [ ] Each overdue item shows how long it has been overdue
- [ ] Alerts or notifications are sent when a case becomes overdue
- [ ] Cases can be resolved directly from this view
- [ ] Overdue badge clears when all cases are resolved

### Common Issues to Flag
- Cases appearing as overdue incorrectly (timezone or SLA misconfiguration)
- Badge count (3) not matching the visible overdue list count
- No escalation workflow triggered for overdue cases
- Overdue items not disappearing from list when resolved

---

## Job History (After-Sales)

### Functionality Checklist
- [ ] Shows history of all after-sales jobs/cases (resolved and closed)
- [ ] Records include full details: customer, agent, resolution notes, timestamps
- [ ] Filters (date range, agent, case type) work correctly
- [ ] Job history is read-only (no accidental edits)
- [ ] Search by customer or case ID is functional
- [ ] Export to CSV/PDF is working and produces complete records

### Common Issues to Flag
- **Duplicate "Job History" in both Operations and After-Sales** — confirm if these are the same data source or separate. If the same, consider merging into one module to avoid confusion.
- Resolved cases missing from job history
- Export producing incomplete or malformatted data

---

## Cross-Section Concerns

| Concern | Detail |
|---|---|
| Duplicate Job History | "Job History" exists in both Operations and After-Sales. Is this intentional? |
| Badge Accuracy | All 3 badge counts (6, 6, 3) must be verified against live data |
| SLA Configuration | Confirm SLA rules are correctly configured and tied to overdue logic |
| Notification Routing | Verify that case assignments, escalations, and SLA breaches trigger correct notifications |

---

## Output Format

```
### ❌ Issue #[N]: [Short Title]
- **Section:** AFTER-SALES > [Sub-module]
- **Severity:** Critical / High / Medium / Low
- **Description:** [What is broken]
- **Steps to Reproduce:** [How to trigger]
- **Expected Behavior:** [What should happen]
- **Actual Behavior:** [What is happening]
- **✅ Recommended Fix:** [Solution]
```
