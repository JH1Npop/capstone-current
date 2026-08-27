# System Development Life Cycle / Project Management Framework

The development of AFN Service Management follows an Agile Iterative Development approach. This framework allows the system to be developed in repeated cycles where features are planned, implemented, tested, reviewed, and improved based on feedback and project needs.

The Agile Iterative approach is suitable for the system because AFN Service Management includes several connected modules such as user management, service request handling, technician dispatch, inventory management, notifications, and reporting. Each module can be developed and refined in stages while ensuring that the overall system remains functional.

| Phase | Description |
| --- | --- |
| Planning | Identify the system objectives, scope, users, and required features |
| Requirements Analysis | Determine the functional and non-functional requirements of the system |
| Design | Prepare diagrams, database models, interface layouts, and system flow |
| Development | Build the backend, frontend, database structure, and API integrations |
| Testing | Check system functionality, usability, security, and data accuracy |
| Evaluation | Gather feedback from users or evaluators using evaluation instruments |
| Revision | Improve the system based on testing results and feedback |

# Requirements Analysis

## Functional Requirements

Functional requirements describe the features and operations that the AFN Service Management system must provide.

| Functional Requirement | Description |
| --- | --- |
| User Authentication | The system shall allow users to register, log in, and access the system based on their assigned role |
| Role-Based Access | The system shall provide different access levels for superadmin, admin, technician, and client users |
| Client Service Request | The system shall allow clients to submit service requests with service type, description, preferred schedule, and location |
| Service Location Mapping | The system shall store and display service location details using address, latitude, and longitude |
| Service Request Management | The system shall allow admins to view, approve, update, or manage client service requests |
| Ticket Creation and Dispatch | The system shall create service tickets and allow technician assignment for approved requests |
| Technician Dashboard | The system shall allow technicians to view assigned jobs, schedules, and job details |
| Job Progress Tracking | The system shall allow technicians to update job status, progress, and completion details |
| Inspection Checklist | The system shall allow technicians to submit checklist information and proof of completion |
| Inventory Management | The system shall allow admins to manage inventory items, stock levels, reservations, and transactions |
| Notification Management | The system shall send or store notifications for service updates, assignments, and inventory alerts |
| Messaging | The system shall allow users to communicate through ticket-related messages |
| After-Sales Follow-Up | The system shall allow authorized administrators to monitor and manage follow-up cases created after completed service work |
| Maintenance Monitoring | The system shall allow completed service work to generate maintenance schedules when the submitted checklist requires future maintenance |
| Reports and Monitoring | The system shall provide dashboard statistics and operational reports for administrators |

## Service Lifecycle

The AFN Service Management workflow follows a service lifecycle rather than a single one-way process. A client submits a service request, the administrator reviews and approves it, and the system creates a service ticket for technician assignment. The technician performs the job, updates the ticket status, submits checklist information, and uploads proof of completion.

After the ticket is completed, the system supports post-service monitoring through after-sales cases, warranty handoffs, notifications, and maintenance schedules. These records help administrators track follow-up work and planned maintenance. When a client needs another service or when maintenance requires a new visit, a new service request or ticket can be created through the normal service request process. The current implementation keeps this return step under user or administrator action instead of automatically creating a new request from every follow-up or maintenance record.

```text
Client Service Request
        -> Admin Review / Approval
        -> Service Ticket Creation
        -> Technician / Crew Assignment
        -> Job Execution and Status Updates
        -> Checklist and Proof Submission
        -> Job Completion
        -> After-Sales Follow-Up / Maintenance Monitoring
        -> New Service Need or Scheduled Maintenance
        -> New Request or Ticket when needed
```

## Non-Functional Requirements

Non-functional requirements describe the quality attributes and constraints of the system.

| Non-Functional Requirement | Description |
| --- | --- |
| Usability | The system should provide a clear and user-friendly interface for clients, technicians, and administrators |
| Security | The system should protect user accounts and restrict access through authentication and role-based permissions |
| Reliability | The system should correctly store and retrieve service requests, tickets, inventory records, and notifications |
| Performance Efficiency | The system should respond within an acceptable time when loading dashboards, records, and maps |
| Maintainability | The system should be organized into backend modules, frontend components, and API layers for easier updates |
| Compatibility | The system should run on modern web browsers and support desktop or mobile access |
| Portability | The system should support local development using SQLite and production-ready deployment using PostgreSQL |
| Availability | The system should remain accessible during normal operation when the server and network are available |

# Data Gathering Procedure and Techniques

The researchers may use interviews, observation, document review, and system evaluation questionnaires to gather information needed for the development and evaluation of AFN Service Management.

| Technique | Description |
| --- | --- |
| Interview | Used to gather information from stakeholders regarding service request handling, dispatch, inventory, and communication needs |
| Observation | Used to understand the current workflow for managing clients, technicians, requests, and service operations |
| Document Review | Used to review existing forms, records, reports, and workflow documents related to service management |
| System Testing | Used to check whether the system features function according to the requirements |
| Evaluation Questionnaire | Used to collect user feedback based on selected ISO/IEC/IEEE 25010 software quality characteristics |

The data gathered from these techniques serves as the basis for identifying system requirements, designing the database and workflows, developing the system features, and evaluating the completed system.

# Research Design and Instrument

## Research Design

This study may use a descriptive developmental research design. The descriptive component is used to identify and describe the existing service management process, user needs, and system requirements. The developmental component is used to design, develop, test, and evaluate the AFN Service Management system.

This research design is appropriate because the study focuses on developing a web-based service management system and evaluating its acceptability based on software quality characteristics.

## Research Instrument

The research instrument may include an evaluation questionnaire based on selected ISO/IEC/IEEE 25010 software quality characteristics. The questionnaire can be used to measure the respondents' perception of the system in terms of functional suitability, performance efficiency, compatibility, usability, reliability, security, maintainability, and portability.

| Instrument | Purpose |
| --- | --- |
| Requirements Checklist | Used to verify whether the required system features were implemented |
| System Testing Checklist | Used to test major system modules and workflows |
| ISO/IEC/IEEE 25010 Evaluation Questionnaire | Used to gather user evaluation results regarding system quality |

The responses from the evaluation questionnaire may be interpreted using frequency, percentage, and weighted mean.
