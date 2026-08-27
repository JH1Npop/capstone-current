# AFN Portal — OPERATIONS Section Audit Prompt

## Scope
Audit the **OPERATIONS** section, covering:
- Operations Dashboard
- Calendar
- Tickets
- Dispatch Board
- Live Map
- Services
- Inventory
- Job History

---

## Operations Dashboard

### Functionality Checklist
- [ ] All operational KPIs display live counts (active jobs, pending tickets, dispatched agents)
- [ ] Status indicators (active/inactive/pending) reflect real-time state
- [ ] Quick navigation links to sub-modules work
- [ ] Alerts or warnings surface correctly (e.g., overdue jobs)
- [ ] Data refreshes automatically or on-demand

### Common Issues to Flag
- Stale data not refreshing without full page reload
- Missing loading/error states for failed API calls
- Incorrect counts (e.g., closed jobs counted as active)

---

## Calendar

### Functionality Checklist
- [ ] Calendar loads with correct current date
- [ ] Events/jobs are displayed on correct dates
- [ ] Creating a new event opens a functional form (all fields work)
- [ ] Editing an existing event saves changes correctly
- [ ] Deleting an event removes it without page reload
- [ ] Day / Week / Month views all render correctly
- [ ] Events are color-coded by type/status
- [ ] Calendar syncs with tickets and dispatch assignments

### Common Issues to Flag
- Events appearing on wrong dates (timezone issues)
- Drag-and-drop reschedule not saving
- Modal/form not closing after submission
- Calendar not reflecting newly created tickets

---

## Tickets

### Functionality Checklist
- [ ] Ticket list loads with correct data and pagination
- [ ] Filters (status, priority, assignee, date) work correctly
- [ ] Creating a new ticket saves all fields and reflects in list
- [ ] Ticket detail view shows all relevant info (history, attachments, comments)
- [ ] Status changes (Open → In Progress → Closed) save and log correctly
- [ ] Assignment to a user/team works
- [ ] Priority levels (Low / Medium / High / Critical) are functional
- [ ] Attachments can be uploaded and downloaded
- [ ] Comments/notes can be added and are timestamped
- [ ] Ticket search returns accurate results

### Common Issues to Flag
- Ticket status not updating in real-time for other users
- File upload silently failing
- Comment timestamps showing wrong timezone
- Filters not combining correctly (AND logic vs OR logic)
- Duplicate ticket creation on double-click submit

---

## Dispatch Board

### Functionality Checklist
- [ ] Board loads all active dispatches and assignments
- [ ] Agents/drivers are listed with correct availability status
- [ ] Assigning a job to an agent updates their status
- [ ] Drag-and-drop assignment (if applicable) works and saves
- [ ] Unassigned jobs are clearly highlighted
- [ ] Real-time updates when an agent accepts/rejects a job
- [ ] Dispatch history is accessible
- [ ] Filters by zone, status, agent work correctly

### Common Issues to Flag
- Board not refreshing when a new job comes in
- Agent status not syncing from the mobile/field app
- Assigning a job to an unavailable agent without warning
- No confirmation step before dispatching

---

## Live Map

### Functionality Checklist
- [ ] Map loads without errors (API key valid, tiles rendering)
- [ ] Agent/driver pins display on correct GPS coordinates
- [ ] Pins update in real-time as agents move
- [ ] Clicking a pin shows agent details and current job
- [ ] Job location markers are displayed correctly
- [ ] Zoom and pan controls work
- [ ] Clustering works for dense areas
- [ ] Map is responsive on different screen sizes

### Common Issues to Flag
- Map tiles not loading (network or API key issue)
- Pins stuck at last known location (real-time feed broken)
- Map throwing console errors (e.g., invalid lat/lng values)
- Tooltip/popup not closing when clicking elsewhere

---

## Services

### Functionality Checklist
- [ ] Services list loads all available services
- [ ] Adding a new service works and appears in list
- [ ] Editing service details saves correctly
- [ ] Deleting a service triggers confirmation and removes it
- [ ] Services are categorized and filterable
- [ ] Services link correctly to tickets and jobs
- [ ] Pricing or rate fields (if any) validate numeric input
- [ ] Service status (Active / Inactive) toggle works

### Common Issues to Flag
- Deleted service still appearing in ticket/job dropdowns
- Service categories not loading in filter
- No duplicate check when creating a new service with the same name

---

## Inventory

### Functionality Checklist
- [ ] Inventory list loads with correct item counts and details
- [ ] Adding new inventory items works with all fields validating
- [ ] Editing quantity or details saves correctly
- [ ] Low-stock alerts trigger at correct thresholds
- [ ] Inventory linked to jobs deducts correctly when used
- [ ] Search and filter by category, SKU, or name work
- [ ] Export inventory list to CSV/Excel works
- [ ] Inventory history/audit log is available

### Common Issues to Flag
- Stock count not deducting when a job is completed
- Negative stock values allowed (no validation)
- Low-stock alert not triggering or alerting too early
- Import feature (if any) failing on CSV format mismatch

---

## Job History (Operations)

### Functionality Checklist
- [ ] All completed/closed jobs appear in history
- [ ] Each job record shows full details (assigned agent, time, service, notes)
- [ ] Filters (date range, agent, service type, status) work correctly
- [ ] Job records can be exported
- [ ] Searching by job ID or customer name works
- [ ] Pagination handles large datasets without performance issues
- [ ] Job details are read-only and not editable from history

### Common Issues to Flag
- Jobs missing from history after being closed
- Date filters not applying timezone correctly
- Export producing incomplete records
- Accidentally editable fields in a read-only view

---

## Output Format

```
### ❌ Issue #[N]: [Short Title]
- **Section:** OPERATIONS > [Sub-module]
- **Severity:** Critical / High / Medium / Low
- **Description:** [What is broken]
- **Steps to Reproduce:** [How to trigger]
- **Expected Behavior:** [What should happen]
- **Actual Behavior:** [What is happening]
- **✅ Recommended Fix:** [Solution]
```
