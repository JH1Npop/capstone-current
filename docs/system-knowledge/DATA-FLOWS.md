# Data Flows

```text
User/account
  -> request + requested services + location
  -> approved service ticket + schedule + lead/crew
  -> reservations/issues + progress + messages + status history
  -> inspection/checklist/proof + generated/final documents
  -> completion + installed equipment + maintenance/after-sales
  -> sales/purchase record + operational analytics/reports
```

Creation inputs are validated by DRF serializers and view actions; ownership/capabilities scope reads and writes. Ticket transitions are the main fan-out point: they write status/history/progress and can create notifications, reservations, document eligibility, maintenance/after-sales evidence, and analytical inputs. Inventory state is derived from append-only transactions and reservations rather than a freely editable available-stock value. Analytics reads live operational data and separately persisted aggregate/forecast tables.

Media passes multipart parsers and signature/size/type validation before local or Cloudinary storage. Realtime payloads travel through Channels but durable truth remains relational records. External route/geocode/AI/email responses are not database authorities.
