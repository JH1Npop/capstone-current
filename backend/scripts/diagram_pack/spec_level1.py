W = 3400
H = 2300
G = 15
CROSSING_COST = 1500
TITLE = 'Data Flow Diagram - Level 1 (Process 3.0 Manage Ticket Dispatch)'
ENTITY = 'rounded=0;whiteSpace=wrap;html=1;fillColor=#DCCBF2;strokeColor=#7E3FB8;strokeWidth=2.5;fontStyle=1;fontSize=15;fontColor=#000000;'
PROCESS = 'rounded=0;whiteSpace=wrap;html=1;fillColor=#C3EFE8;strokeColor=#1FA99A;strokeWidth=2.5;fontSize=14;fontColor=#000000;'
STUB = 'rounded=0;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#1FA99A;strokeWidth=2;dashed=1;fontSize=13;fontColor=#000000;'
STORE = 'rounded=0;whiteSpace=wrap;html=1;fillColor=#FFEB99;strokeColor=#B8860B;strokeWidth=2.5;fontSize=13;fontColor=#000000;'
EDGE = 'edgeStyle=none;rounded=0;html=1;endArrow=block;endFill=1;endSize=7;strokeColor=#6B7280;strokeWidth=1.2;fontSize=11;fontColor=#000000;labelBackgroundColor=#FFFFFF;'
N = {
    'admin': ('Administrator', 1210, 1390, 240, 80, 'e'),
    'tech': ('Technician', 1150, 550, 220, 80, 'e'),
    'mapping': ('Mapping and Routing Services', 2020, 460, 280, 80, 'e'),
    's2': ('2.0 Manage Service Requests<br>and Scheduling', 1030, 1930, 290, 90, 'x'),
    's4': ('4.0 Manage Field Job<br>Completion', 2170, 1690, 290, 90, 'x'),
    's7': ('7.0 Manage Messages and<br>Notifications', 1690, 1570, 290, 90, 'x'),
    'p31': ('3.1 Review Service Request', 1030, 1690, 290, 90, 'p'),
    'p32': ('3.2 Create and Schedule Ticket', 790, 1360, 290, 90, 'p'),
    'p33': ('3.3 Verify Deposit Gate', 1270, 820, 290, 90, 'p'),
    'p34': ('3.4 Rank and Auto-Assign<br>Technician', 1780, 760, 290, 90, 'p'),
    'p35': ('3.5 Assign Crew Manually', 820, 970, 290, 90, 'p'),
    'p36': ('3.6 Decide Inspection Outcome', 2230, 1450, 290, 90, 'p'),
    'p37': ('3.7 Monitor SLA and Escalate', 1690, 1270, 290, 90, 'p'),
    'd2': ('D2 Service Type, SLA Reference, and Skill<br>Records', 2140, 1000, 280, 80, 's'),
    'd3': ('D3 Service Request, Location, and<br>Calendar Closure', 580, 1720, 260, 80, 's'),
    'd4': ('D4 Ticket, Crew, Schedule, and<br>Assignment', 1720, 1000, 260, 80, 's'),
    'd15': ('D15 Quotation, Sales, and<br>Payment Records', 730, 700, 260, 80, 's'),
}
F = [
    ('admin', 'p31', 'request approval or rejection', 'B', 'T'),
    ('s2', 'p31', 'new service request for review', 'T', 'B'),
    ('d3', 'p31', 'request records', 'R', 'L'),
    ('p31', 'd3', 'request decision status', 'L', 'R'),
    ('p31', 'p32', 'approved request', 'T', 'B'),
    ('admin', 'p32', 'schedule decision', 'L', 'R'),
    ('d3', 'p32', 'calendar closure and capacity records', 'T', 'B'),
    ('p32', 'd4', 'ticket and schedule data', 'R', 'L'),
    ('p32', 'p33', 'new ticket', 'T', 'B'),
    ('d15', 'p33', 'deposit and payment status', 'R', 'L'),
    ('p33', 'p34', 'ticket released for auto-dispatch', 'R', 'L'),
    ('p33', 'p35', 'ticket released for manual dispatch', 'L', 'R'),
    ('d2', 'p34', 'technician skill records', 'L', 'R'),
    ('d4', 'p34', 'technician workload and ticket records', 'T', 'B'),
    ('mapping', 'p34', 'route and distance estimate', 'B', 'T'),
    ('p34', 'mapping', 'route request', 'T', 'B'),
    ('p34', 'd4', 'auto-assignment data', 'B', 'T'),
    ('p34', 'tech', 'assigned job and schedule details', 'L', 'R'),
    ('admin', 'p35', 'manual dispatch and crew decision', 'T', 'B'),
    ('p35', 'd4', 'crew assignment data', 'R', 'L'),
    ('p35', 'tech', 'assigned job and schedule details', 'T', 'B'),
    ('s4', 'p36', 'inspection report and findings', 'T', 'B'),
    ('admin', 'p36', 'inspection decision', 'R', 'L'),
    ('p36', 'd4', 'inspection outcome and ticket status', 'T', 'B'),
    ('d4', 'p37', 'ticket and assignment records', 'B', 'T'),
    ('d2', 'p37', 'SLA rule records', 'L', 'R'),
    ('p37', 'admin', 'ticket queue and dispatch status', 'L', 'R'),
    ('p37', 's7', 'escalation notification events', 'B', 'T'),
]
