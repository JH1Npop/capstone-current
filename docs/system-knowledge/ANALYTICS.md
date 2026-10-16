# Analytics and Reporting

Admin Analytics uses a permission-scoped live-data endpoint implemented by `users/views/admin_services.py` and `users/analytics_service.py`, rendered by `AdminAnalytics.jsx` and its workspace panels. It provides operational pulse, requests/workload, technicians, inventory, after-sales/maintenance, and demand views with Asia/Manila period semantics and validated filters.

Reports in `services/views/reports.py` are distinct operational/export endpoints. Persistent models (`ServiceAnalytics`, `TechnicianPerformance`, `DemandForecast`, `ServiceTrend`) support scheduled aggregates and forecasts. Forecast generation includes rolling backtests, WAPE/bias/baseline evidence, freshness/history/volume gates, and withholds future quantities when publication criteria fail. Location projections allocate by recent historical density rather than claiming a geographic predictive model.

Current development data is insufficient for a publishable forecast; descriptive trends remain valid. Some landing/calculator defaults can be bundled fallbacks. Detailed formulas, filter mapping, response fields, limitations, and source lines are maintained in `docs/features/ANALYTICS_CURRENT.md`.
