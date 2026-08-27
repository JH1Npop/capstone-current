# AFN-SERVE System Updates

Date: June 15, 2026

This document summarizes the recent improvements added to the AFN-SERVE system for use in the capstone documentation. The updates focus on authentication security, analytics support, service workflow improvements, notification behavior, PWA identity, and API protection.

## 1. Email Verification for New Client Accounts

The registration process was improved so newly created client accounts must verify their email address before they can sign in. After registration, the system sends a verification email and shows a message instructing the user to verify the account first.

Unverified client accounts are not treated as active users in user management. If a newly registered client does not verify the email within five minutes, the account can be removed automatically. This prevents unverified or fake accounts from remaining in the system.

Purpose:
- Prevents unauthorized or fake account usage.
- Ensures that the email address provided by the client is reachable.
- Improves account security before allowing access to service request features.

## 2. Improved Registration Validation

The registration form and backend validation were improved to give clearer error messages. The system now shows the actual validation problem instead of only displaying a generic registration failure message.

The phone number input was also restricted to Philippine mobile number format. The accepted format is an 11-digit number starting with `09`.

Purpose:
- Helps users understand what they need to correct.
- Prevents invalid phone numbers from being stored.
- Improves data quality for future notifications and client contact records.

## 3. Structured Address Input

The registration address input was improved by separating the address into specific fields:

- Barangay
- City or Municipality
- Province

Purpose:
- Makes address input clearer for clients.
- Helps standardize location data.
- Supports cleaner records for service requests, technician dispatching, and reports.

## 4. PWA Branding Update

The Progressive Web App configuration was updated so the installed application uses the AFN-SERVE name and AFN logo. The manifest and app icon assets were adjusted for a more professional installed-app appearance.

Purpose:
- Makes the installed PWA look like the official AFN-SERVE application.
- Improves branding consistency across browser and mobile installation.
- Removes generic browser/default app identity where possible.

## 5. Login UI Improvements

The login page was redesigned to better match AFN Solar Power Engineering Services branding. The layout uses a left-side service/solar-themed visual area and a right-side login form. The design was adjusted to avoid excessive decorative effects while keeping the interface clean, professional, and mobile-friendly.

Purpose:
- Improves first impression of the system.
- Makes the login screen feel like an official AFN platform.
- Keeps the form readable and practical on desktop and mobile.

## 6. Client Request Submission Feedback

The client service request flow was improved so after submitting a request, the user receives a clear confirmation message indicating that the request has been submitted.

Purpose:
- Confirms successful submission to the client.
- Reduces confusion after pressing the submit button.
- Improves user experience in the service request process.

## 7. Customer Support Chat Cleanup

Customer support conversations were improved so resolved cases can be stored away and removed from the active chat list. This prevents old resolved conversations from piling up in the active support view.

Purpose:
- Keeps the customer support chat list organized.
- Helps admins focus on unresolved or active concerns.
- Preserves resolved records for reference without cluttering daily work.

## 8. Technician Checklist Photo Requirement

Checklist behavior was reviewed so checklist steps that require a photo should not be skipped. Required image steps are intended to force the technician to attach proof before proceeding.

Purpose:
- Ensures required proof is collected during work.
- Supports accountability for technician actions.
- Strengthens service completion documentation.

## 9. Technician Navigation and Arrival Notifications

Technician workflow actions were improved:

- Starting navigation can notify the client and admin/superadmin one time.
- Marking arrival at the site acts as the signal that the technician is ready to start the job.
- Marking arrival changes the ticket workflow toward active service progress.

Purpose:
- Keeps clients informed when the technician is on the way.
- Lets admins monitor field movement and job progress.
- Makes “arrived at site” a meaningful service workflow event.

## 10. Calendar Handling for Completed Jobs

Completed jobs are kept visible on the calendar as historical records instead of being immediately removed. Completed jobs can be visually distinguished, such as by using a gray style.

An additional improvement was planned so completed jobs remain visible normally for a recent period, such as the last 7 to 30 days. Older completed jobs can be hidden by default and shown only when the user enables a “Show Completed Jobs” option or views historical records.

Purpose:
- Preserves historical service records.
- Supports workload review and audit checking.
- Helps admins compare scheduled, completed, and pending work.
- Supports after-sales and service history tracking.

## 11. Analytics Assistant with Gemini API

The System Assistant was improved to focus on analytics and forecasting. Instead of answering general system questions, it now focuses on:

- Analytics summaries
- Forecast summaries
- Future demand by area
- Top service demand
- Monthly service trends
- Peak forecast days
- Technician performance
- SLA risks
- Inventory demand
- Maintenance forecasting
- After-sales trends
- Coverage heatmap
- Forecast risk

The assistant uses summarized analytics data from the Django backend and sends only the summarized JSON to the Gemini API. It does not send raw database records.

Purpose:
- Helps admins interpret analytics more easily.
- Provides natural-language explanations of system data.
- Keeps sensitive raw records inside the backend.
- Supports decision-making for dispatching, staffing, inventory, and service planning.

## 12. Analytics Assistant UI Improvement

The floating Analytics Assistant panel was improved to be larger and more readable. The quick question buttons were placed in a scrollable area, and the chat messages were formatted so AI responses do not appear clipped or raw.

Purpose:
- Makes AI-generated analytics explanations easier to read.
- Prevents long answers from being cut off visually.
- Improves usability for admins and superadmins.

## 13. Gemini Output Token Limit Update

The Gemini response limit for the System Assistant was increased to allow longer and more complete answers. The output token limit was changed to `1500`, and the response temperature was kept low for more stable and focused answers.

Purpose:
- Prevents the assistant from stopping mid-answer.
- Allows more complete analytics explanations.
- Keeps responses practical and dashboard-focused.

## 14. Inventory Demand Analytics Fix

The inventory demand analytics used by the assistant was corrected. The system now reads real inventory issue transactions when calculating inventory demand. It uses issued inventory records from service ticket usage to determine top consumed items and categories.

Purpose:
- Makes inventory demand analytics reflect actual stock usage.
- Prevents the assistant from incorrectly saying that inventory demand data is unavailable.
- Helps admins identify which inventory items are frequently used in services.

## 15. Backend API Rate Limiting

Backend rate limiting was added using Django REST Framework throttling. The limits protect important endpoints from abuse and accidental spam.

Current rate limits:

| Feature | Limit |
|---|---:|
| Login | 5 requests per minute |
| Register | 5 requests per hour |
| Password reset | 5 requests per minute |
| Service request creation | 5 requests per hour |
| Customer support case creation | 5 requests per hour |
| Messaging/chat send | 20 requests per minute |
| Notification actions | 60 requests per minute |
| Geocode/search map calls | 30 requests per minute |
| Route API calls | 20 requests per minute |

Purpose:
- Prevents brute-force login attempts.
- Reduces spam account registration.
- Prevents clients from submitting too many service requests quickly.
- Protects chat from rapid message spam.
- Protects external map/routing API quota.
- Improves system stability and security.

## 16. System Assistant Scope Control

The assistant was restricted to analytics and forecasting topics only. If a user asks something outside analytics, the assistant responds that it only handles analytics-related questions.

Purpose:
- Keeps the assistant aligned with its intended role.
- Prevents it from becoming a general-purpose chatbot.
- Makes the feature easier to explain in the capstone as an analytics assistant.

## 17. Testing and Verification

Several backend and frontend checks were performed after the updates.

Verified areas include:

- Django system checks
- User login and registration tests
- Email verification behavior
- Service request persistence
- Notification API behavior
- Message API behavior
- Analytics assistant fallback behavior
- Inventory demand analytics behavior
- Frontend production build

Purpose:
- Confirms that the new changes do not break existing workflows.
- Supports documentation claims with tested behavior.
- Improves reliability before presentation or deployment.

## Recommended Documentation Placement

These updates can be included in the following capstone sections:

- Security Features
- System Features and Modules
- Non-Functional Requirements
- System Architecture
- API Protection
- User Interface Improvements
- Testing and Evaluation
- Progressive Web Application Features
- Analytics and Forecasting Module

