# Technical Background

## Server-Side Requirements

### Operating System

The backend system can run on Windows, Linux, or macOS during development. For deployment, a Linux-based server environment is recommended because it is commonly used for Django web application hosting.

| Requirement | Description |
| --- | --- |
| Development OS | Windows 10/11, Linux, or macOS |
| Recommended production OS | Linux server such as Ubuntu Server |
| Local environment | Python virtual environment |

### Backend Language / Framework

The backend of AFN Service Management is developed using Python, Django, and Django REST Framework. Django handles the server-side application logic, while Django REST Framework provides API endpoints consumed by the frontend.

| Requirement | Technology |
| --- | --- |
| Programming language | Python |
| Backend framework | Django |
| API framework | Django REST Framework |
| Authentication | DRF Token Authentication |
| Real-time support | Django Channels |
| Production server support | Daphne / Gunicorn |

### Database Management System

The system uses SQLite for local development and supports PostgreSQL as the production-ready database option.

| Environment | Database |
| --- | --- |
| Development | SQLite |
| Production-ready option | PostgreSQL |

SQLite is used during development because it is lightweight and easy to configure. PostgreSQL is recommended for production because it is more suitable for multi-user access, larger datasets, deployment environments, backups, and long-term system operation.

### API Integration Tools

The backend integrates with internal and external services to support routing, notifications, authentication, and frontend communication.

| Tool / Service | Purpose |
| --- | --- |
| Django REST Framework API | Provides backend endpoints for frontend features |
| DRF Token Authentication | Secures API requests using authentication tokens |
| OpenRouteService API | Provides route distance, duration, and route geometry for map and dispatch features |
| In-app notifications | Stores user alerts and read/unread notification records |
| SMTP email service | Sends selected account, request, and ticket alerts |
| Django Channels | Supports real-time communication features |

## Client-Side Requirements

### Frontend Technologies

The frontend is developed as a React application using Vite as the development and build tool. TailwindCSS is used for styling, while Axios handles API communication with the Django backend.

| Requirement | Technology |
| --- | --- |
| Frontend library | React |
| Build tool | Vite |
| Styling framework | TailwindCSS |
| API communication | Axios |
| Routing | React Router DOM |
| Map display | Leaflet and React-Leaflet |
| Icons | React Icons |
| Notification support | In-app notification API and browser PWA assets |

### Browser Compatibility

The system is designed to run on modern web browsers that support JavaScript, responsive layouts, and modern web APIs.

| Browser | Compatibility |
| --- | --- |
| Google Chrome | Supported |
| Microsoft Edge | Supported |
| Mozilla Firefox | Supported |
| Safari | Supported with modern versions |

For best results, users should access the system using an updated browser and a stable internet connection.

### Hardware Minimum Specs

The system is web-based, so client devices do not need high hardware specifications. The minimum specifications below are recommended for smooth browsing and map interaction.

| Component | Minimum Specification |
| --- | --- |
| Processor | Dual-core processor |
| Memory | 4 GB RAM |
| Storage | At least 500 MB free space for browser cache and downloads |
| Display | 1366 x 768 resolution or higher |
| Internet | Stable broadband or mobile data connection |
| Browser | Updated Chrome, Edge, Firefox, or Safari |

For administrators and technicians using map or tracking features, a stable internet connection and GPS/location-enabled device are recommended.

## Development Tools

### Design / Prototyping

Design and prototyping tools are used to plan the user interface, navigation flow, and layout before or during implementation.

| Tool | Purpose |
| --- | --- |
| Figma / Canva | UI layout planning, mockups, and presentation visuals |
| diagrams.net / dbdiagram.io | System diagrams, ERD, and database visualization |
| Mermaid Live Editor | Context diagram and data flow diagram rendering |

### Version Control

Version control is used to track project changes and manage source code during development.

| Tool | Purpose |
| --- | --- |
| Git | Tracks source code changes |
| GitHub / repository hosting | Stores and shares project source code |

### AI Assistance

AI assistance may be used as a supporting tool for documentation drafting, debugging guidance, code review, and diagram preparation. Final implementation, validation, and project decisions remain under the responsibility of the developers.

| Tool | Purpose |
| --- | --- |
| AI coding assistant | Helps review code, draft documentation, and identify possible improvements |
| AI documentation support | Helps organize technical explanations and capstone sections |

## Statistical Treatment

The evaluation of the system may use descriptive statistical methods to summarize the responses of users and evaluators. These methods help determine the acceptability and quality of the system based on the collected evaluation data.

### Frequency

Frequency is used to count how many respondents selected a specific answer or rating.

```text
Frequency = Number of responses per category
```

### Percentage

Percentage is used to show the proportion of responses in relation to the total number of respondents.

```text
Percentage = (Frequency / Total number of respondents) x 100
```

### Weighted Mean

Weighted mean is used to compute the average rating for each evaluation criterion.

```text
Weighted Mean = Sum of weighted responses / Total number of respondents
```

### Likert Scale Interpretation

The following scale may be used to interpret the evaluation results:

| Range | Interpretation |
| --- | --- |
| 4.21 - 5.00 | Strongly Agree / Excellent |
| 3.41 - 4.20 | Agree / Very Good |
| 2.61 - 3.40 | Neutral / Good |
| 1.81 - 2.60 | Disagree / Fair |
| 1.00 - 1.80 | Strongly Disagree / Poor |

## ISO/IEC/IEEE 25010 Evaluation

The system may be evaluated using selected software quality characteristics from ISO/IEC/IEEE 25010. This model helps assess whether the system meets functional, usability, reliability, performance, security, maintainability, and portability expectations.

| Quality Characteristic | Description | Application to the System |
| --- | --- | --- |
| Functional Suitability | Measures whether the system provides the required functions | The system supports service requests, dispatching, technician tracking, inventory management, and notifications |
| Performance Efficiency | Measures system responsiveness and resource usage | The system should load pages, process requests, and update data within acceptable response times |
| Compatibility | Measures whether the system works across supported environments | The frontend is designed for modern browsers and communicates with the backend through REST APIs |
| Usability | Measures ease of learning and operation | Role-based dashboards and navigation support clients, technicians, and administrators |
| Reliability | Measures stability and availability during use | The system should preserve records and continue operating correctly during normal usage |
| Security | Measures protection of data and access | Token authentication and role-based access control help restrict unauthorized access |
| Maintainability | Measures ease of modifying and improving the system | The project is separated into backend apps, frontend pages, API modules, and reusable components |
| Portability | Measures ease of deployment to another environment | The system supports local SQLite development and PostgreSQL-ready production configuration |

The ISO/IEC/IEEE 25010 model provides a structured basis for evaluating the quality of the AFN Service Management system during testing and user assessment.
