# Technical Background

## Server-Side Requirements

### Operating System

The AFN Service Management backend can run on Windows, Linux, or macOS during development. For deployment, a Linux-based server environment is recommended because it is commonly used for Django production hosting.

Recommended environment:

| Requirement | Description |
| --- | --- |
| Development OS | Windows 10/11, Linux, or macOS |
| Production OS | Linux server such as Ubuntu Server |
| Local project environment | Python virtual environment |

### Backend Language / Framework

The backend is built using Python and Django REST Framework. Django handles the main server-side application logic, while Django REST Framework provides API endpoints for the frontend.

| Requirement | Technology |
| --- | --- |
| Programming language | Python |
| Backend framework | Django |
| API framework | Django REST Framework |
| Authentication | DRF Token Authentication |
| Real-time support | Django Channels |

### Database Management System

The system uses SQLite for local development and supports PostgreSQL for production deployment.

| Environment | Database |
| --- | --- |
| Development | SQLite |
| Production-ready option | PostgreSQL |

SQLite is used during development because it is lightweight and easy to configure. PostgreSQL is recommended for production because it is more suitable for multi-user systems, larger datasets, backups, and deployment environments.

### API Integration Tools

The backend communicates with internal and external APIs to support authentication, service management, routing, notifications, and real-time updates.

| Tool / Service | Purpose |
| --- | --- |
| Django REST Framework API | Provides backend endpoints for frontend features |
| DRF Token Authentication | Secures API requests using authentication tokens |
| OpenRouteService API | Provides route distance, duration, and geometry for dispatch and maps |
| In-app notifications | Stores user alerts and read/unread notification records |
| SMTP email service | Sends selected account, request, and ticket alerts |
| SMS service | Optional alert channel when Twilio settings are configured |
| Django Channels | Supports real-time communication features |
