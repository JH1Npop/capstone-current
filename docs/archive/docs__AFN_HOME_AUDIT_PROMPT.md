# AFN Portal — HOME Section Audit Prompt

## Scope
Audit the **HOME** section of the AFN Portal, covering:
- Dashboard
- Analytics
- Reports

---

## Dashboard

### Functionality Checklist
- [ ] All KPI/metric cards load with real data (no hardcoded values)
- [ ] Charts and graphs render correctly (no blank canvases)
- [ ] Date range filters update all widgets simultaneously
- [ ] Quick-action buttons navigate to the correct pages
- [ ] Recent activity feed is live and sortable
- [ ] Widget layout is not broken at various screen sizes
- [ ] Refresh button (if any) reloads data without full page reload

### Common Issues to Flag
- KPI cards showing `null`, `undefined`, or `NaN`
- Charts that fail silently when data is empty
- Date filters that don't persist on page reload
- Widgets that load independently causing layout shift (CLS)

---

## Analytics

### Functionality Checklist
- [ ] All chart types (bar, line, pie, etc.) render without errors
- [ ] Filters (date range, category, user, region) apply correctly
- [ ] Exported data (CSV/PDF) matches what's shown on screen
- [ ] Drill-down interactions work (clicking a chart segment opens detail)
- [ ] Tooltips appear on hover with correct data
- [ ] Comparative period data (e.g., vs last month) is accurate
- [ ] Empty data states show a helpful message, not a broken chart

### Common Issues to Flag
- Chart library errors in console (e.g., invalid data format)
- Export producing blank or misformatted files
- Filters not resetting properly
- Analytics not reflecting real-time updates

---

## Reports

### Functionality Checklist
- [ ] Report list loads all available reports
- [ ] Each report can be opened/previewed without error
- [ ] Filters (date, type, status) narrow results correctly
- [ ] Reports can be downloaded (PDF, CSV, Excel) without errors
- [ ] Scheduled reports (if any) are configured and running
- [ ] Report generation doesn't time out for large datasets
- [ ] Pagination works correctly on long report lists

### Common Issues to Flag
- Download buttons returning 404 or empty files
- Report previews not rendering (broken iframe or viewer)
- Scheduled reports not sending to correct email
- No loading indicator during report generation

---

## Output Format

```
### ❌ Issue #[N]: [Short Title]
- **Section:** HOME > [Dashboard / Analytics / Reports]
- **Severity:** Critical / High / Medium / Low
- **Description:** [What is broken]
- **Steps to Reproduce:** [How to trigger]
- **Expected Behavior:** [What should happen]
- **Actual Behavior:** [What is happening]
- **✅ Recommended Fix:** [Solution]
```
