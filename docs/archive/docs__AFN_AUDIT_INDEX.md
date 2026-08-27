# AFN Portal — Audit Prompt Index

A complete set of agent audit prompts for the AFN Portal (Superadmin).  
Use these files to run systematic QA scans across every module and feature.

---

## Files in This Audit Pack

| File | Covers |
|---|---|
| `AFN_MASTER_AUDIT_PROMPT.md` | Full portal overview, global checks, output format standard |
| `AFN_HOME_AUDIT_PROMPT.md` | Dashboard, Analytics, Reports |
| `AFN_OPERATIONS_AUDIT_PROMPT.md` | Operations Dashboard, Calendar, Tickets, Dispatch Board, Live Map, Services, Inventory, Job History |
| `AFN_AFTERSALES_AUDIT_PROMPT.md` | After Sales Cases, Open Cases, Overdue, Job History |
| `AFN_COMMUNICATION_ACCESS_AUDIT_PROMPT.md` | Messages, User Management |

---

## Recommended Audit Order

1. Start with `AFN_MASTER_AUDIT_PROMPT.md` for global/structural checks
2. Run `AFN_HOME_AUDIT_PROMPT.md` — foundational visibility for stakeholders
3. Run `AFN_OPERATIONS_AUDIT_PROMPT.md` — largest and most complex section
4. Run `AFN_AFTERSALES_AUDIT_PROMPT.md` — pay attention to badge count accuracy
5. Run `AFN_COMMUNICATION_ACCESS_AUDIT_PROMPT.md` — security-sensitive, audit carefully

---

## Severity Guide

| Level | Meaning |
|---|---|
| 🔴 Critical | Feature is broken, data is incorrect, security risk |
| 🟠 High | Major feature doesn't work as expected |
| 🟡 Medium | Minor feature broken or UX significantly impacted |
| 🟢 Low | Cosmetic, minor UX, or nice-to-have improvements |

---

## Known Flags to Prioritize

- **Duplicate "Job History"** — appears in both Operations and After-Sales
- **Badge Count Validation** — After Sales Cases (6), Open Cases (6), Overdue (3) need verification
- **Last Superadmin Protection** — ensure system prevents deleting the only admin
- **Real-time Sync** — Live Map, Dispatch Board, and Messages all require real-time checks
- **Data Orphaning** — when users or services are deleted, linked records must be handled
