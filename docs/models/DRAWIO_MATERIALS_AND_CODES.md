# Draw.io Materials And Codes

Use this file as your draw.io style guide for all Chapter III diagrams.

## Ready File

Open this in draw.io:

`docs/models/AFN_DRAWIO_MATERIALS.drawio`

It contains reusable shapes for:

- External Entity
- DFD Process
- DFD Data Store
- Use Case Oval
- ERD Entity
- Deployment Node
- Database Node
- Connector Arrow

## How To Use

1. Open draw.io.
2. Click **File**.
3. Click **Open From**.
4. Click **Device**.
5. Select `AFN_DRAWIO_MATERIALS.drawio`.
6. Copy the shapes you need.
7. Paste them into your real diagram.

## DFD Shape Codes

External entity:

```text
fillColor=#DDD6FE
strokeColor=#7C3AED
fontColor=#3B0764
rounded=1
arcSize=8
fontSize=13
fontStyle=1
```

Process:

```text
fillColor=#FDE8C8
strokeColor=#D97706
fontColor=#78350F
rounded=1
arcSize=8
fontSize=12
```

Data store:

```text
shape=partialRectangle
right=0
fillColor=#FFFFFF
strokeColor=#64748B
fontColor=#0F172A
fontSize=12
```

Connector:

```text
edgeStyle=orthogonalEdgeStyle
rounded=0
endArrow=block
endFill=1
strokeColor=#334155
strokeWidth=1.2
fontSize=10
fontColor=#475569
```

## Diagram Tool Mapping

- SDLC Model: use Figma AI or draw.io manual shapes.
- System Workflow: use draw.io or Mermaid.
- Use Case Diagram: use draw.io UML shapes.
- DFD: use draw.io manual layout.
- ERD: use dbdiagram.io first, then export image.
- Deployment Diagram: use draw.io nodes.

## Clean DFD Manual Layout

Use three columns:

```text
External Entity | Process | Data Store
```

Rows:

```text
Client -> 1.0 Manage User Access -> D1 User Records
Client -> 2.0 Manage Service Requests -> D2 Service Request Records
Admin / Superadmin -> 3.0 Manage Ticket Dispatch -> D3 Service Ticket Records
Technician -> 4.0 Manage Technician Job Completion -> D4 Checklist and Proof Records
Admin / Superadmin -> 5.0 Manage Inventory Usage -> D5 Inventory Records
Client/Admin/Technician -> 6.0 Manage After-Sales and Maintenance -> D6/D7
Client/Admin/Technician -> 7.0 Manage Messages and Notifications -> D8/D9
Admin / Superadmin -> 8.0 Generate Reports, Analytics, and Logs -> D10
```

