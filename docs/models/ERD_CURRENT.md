# AFN Current ERD — Complete Text Edition

This is the complete readable ERD derived from `AFN_ERD.dbml`.

- Entities: **52**
- Attributes: **707**
- Relationships: **107**

## Entity and Attribute Catalog

`pk` marks a primary key, `ref` marks a foreign key, `unique` marks a unique value, and `not null` marks a required value.

### Analytics

#### 1. SERVICE ANALYTICS

Database table: `services_serviceanalytics`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_analytics_id` | `bigint` | `pk, increment` |
| `date` | `date` | `not null` |
| `service_type_id` | `bigint` | `ref: > services_servicetype.service_type_id` |
| `total_requests` | `integer` | `not null` |
| `completed_requests` | `integer` | `not null` |
| `pending_requests` | `integer` | `not null` |
| `cancelled_requests` | `integer` | `not null` |
| `avg_response_time_hours` | `double` | `not null` |
| `avg_completion_time_hours` | `double` | `not null` |
| `technician_utilization_rate` | `double` | `not null` |
| `service_area_coverage` | `double` | `not null` |
| `popular_locations` | `text` | `not null` |
| `satisfaction_score` | `double` | `not null` |
| `created_at` | `timestamp` | `not null` |

#### 2. TECHNICIAN PERFORMANCE

Database table: `services_technicianperformance`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `technician_performance_id` | `bigint` | `pk, increment` |
| `technician_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `date` | `date` | `not null` |
| `tickets_assigned` | `integer` | `not null` |
| `tickets_completed` | `integer` | `not null` |
| `tickets_pending` | `integer` | `not null` |
| `total_work_hours` | `double` | `not null` |
| `avg_response_time_hours` | `double` | `not null` |
| `avg_completion_time_hours` | `double` | `not null` |
| `customer_satisfaction` | `double` | `not null` |
| `rework_rate` | `double` | `not null` |
| `distance_traveled_km` | `double` | `not null` |
| `fuel_efficiency` | `double` | `not null` |
| `created_at` | `timestamp` | `not null` |

#### 3. DEMAND FORECAST

Database table: `services_demandforecast`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `demand_forecast_id` | `bigint` | `pk, increment` |
| `service_type_id` | `bigint` | `not null, ref: > services_servicetype.service_type_id` |
| `forecast_date` | `date` | `not null` |
| `forecast_period` | `varchar(20)` | `not null` |
| `predicted_requests` | `integer` | `not null` |
| `confidence_level` | `double` | `not null` |
| `weather_impact` | `double` | `not null` |
| `seasonal_trend` | `double` | `not null` |
| `historical_average` | `integer` | `not null` |
| `actual_requests` | `integer` | `nullable` |
| `forecast_accuracy` | `double` | `nullable` |
| `generated_at` | `timestamp` | `not null` |

#### 4. SERVICE TREND

Database table: `services_servicetrend`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_trend_id` | `bigint` | `pk, increment` |
| `service_type_id` | `bigint` | `not null, ref: > services_servicetype.service_type_id` |
| `trend_type` | `varchar(20)` | `not null` |
| `period_start` | `date` | `not null` |
| `period_end` | `date` | `not null` |
| `average_requests` | `double` | `not null` |
| `peak_day` | `varchar(20)` | `not null` |
| `peak_hour` | `integer` | `nullable` |
| `growth_rate` | `double` | `not null` |
| `trend_direction` | `varchar(20)` | `not null` |
| `standard_deviation` | `double` | `not null` |
| `confidence_interval` | `text` | `not null` |
| `created_at` | `timestamp` | `not null` |

### After-Sales and Communication

#### 5. AFTER-SALES CASE

Database table: `services_aftersalescase`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `after_sales_case_id` | `bigint` | `pk, increment` |
| `service_ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `client_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `assigned_to_id` | `bigint` | `ref: > users_user.user_id` |
| `created_by_id` | `bigint` | `ref: > users_user.user_id` |
| `case_type` | `varchar(20)` | `not null` |
| `status` | `varchar(20)` | `not null` |
| `priority` | `varchar(20)` | `not null` |
| `creation_source` | `varchar(30)` | `not null` |
| `summary` | `varchar(255)` | `not null` |
| `details` | `text` | `nullable` |
| `resolution_notes` | `text` | `nullable` |
| `requires_revisit` | `boolean` | `not null` |
| `customer_satisfaction` | `smallint` | `nullable` |
| `due_date` | `date` | `nullable` |
| `resolved_at` | `timestamp` | `nullable` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 6. AFTER-SALES CASE EVENT

Database table: `services_aftersalescaseevent`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `after_sales_case_event_id` | `bigint` | `pk, increment` |
| `case_id` | `bigint` | `not null, ref: > services_aftersalescase.after_sales_case_id` |
| `actor_id` | `bigint` | `ref: > users_user.user_id` |
| `event_type` | `varchar(30)` | `not null` |
| `from_status` | `varchar(20)` | `not null` |
| `to_status` | `varchar(20)` | `not null` |
| `notes` | `text` | `not null` |
| `metadata` | `jsonb` | `not null` |
| `created_at` | `timestamp` | `not null` |

#### 7. MAINTENANCE SCHEDULE

Database table: `services_maintenanceschedule`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `maintenance_schedule_id` | `bigint` | `pk, increment` |
| `service_ticket_id` | `bigint` | `not null, unique, ref: - services_serviceticket.service_ticket_id` |
| `client_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `service_type_id` | `bigint` | `not null, ref: > services_servicetype.service_type_id` |
| `maintenance_profile` | `varchar(30)` | `not null` |
| `interval_days` | `integer` | `not null` |
| `follow_up_window_days` | `integer` | `not null` |
| `last_service_date` | `date` | `not null` |
| `next_due_date` | `date` | `not null` |
| `notify_on_date` | `date` | `not null` |
| `status` | `varchar(20)` | `not null` |
| `maintenance_notes` | `text` | `nullable` |
| `due_soon_notified_at` | `timestamp` | `nullable` |
| `three_day_notified_at` | `timestamp` | `nullable` |
| `due_notified_at` | `timestamp` | `nullable` |
| `client_notified_at` | `timestamp` | `nullable` |
| `client_three_day_notified_at` | `timestamp` | `nullable` |
| `client_due_notified_at` | `timestamp` | `nullable` |
| `risk_level` | `varchar(20)` | `not null` |
| `risk_score` | `double` | `not null` |
| `prediction_notes` | `text` | `nullable` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 8. CUSTOMER SUPPORT CASE

Database table: `messages_app_customersupportcase`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `customer_support_case_id` | `bigint` | `pk, increment` |
| `client_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `ticket_id` | `bigint` | `ref: > services_serviceticket.service_ticket_id` |
| `group_key` | `varchar(80)` | `not null, unique` |
| `subject` | `varchar(160)` | `not null` |
| `category` | `varchar(30)` | `not null` |
| `priority` | `varchar(20)` | `not null` |
| `status` | `varchar(20)` | `not null` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |
| `resolved_at` | `timestamp` | `nullable` |

#### 9. MESSAGE

Database table: `messages_app_message`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `message_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `ref: > services_serviceticket.service_ticket_id` |
| `sender_id` | `bigint` | `ref: > users_user.user_id` |
| `receiver_id` | `bigint` | `ref: > users_user.user_id` |
| `room_type` | `varchar(20)` | `not null` |
| `group_key` | `varchar(50)` | `nullable` |
| `message_text` | `text` | `not null` |
| `image` | `varchar(100)` | `nullable` |
| `is_deleted` | `boolean` | `not null` |
| `edited_at` | `timestamp` | `nullable` |
| `deleted_at` | `timestamp` | `nullable` |
| `updated_at` | `timestamp` | `not null` |
| `created_at` | `timestamp` | `not null` |

#### 10. NOTIFICATION

Database table: `notifications_notification`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `notification_id` | `bigint` | `pk, increment` |
| `user_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `ticket_id` | `bigint` | `ref: > services_serviceticket.service_ticket_id` |
| `request_id` | `bigint` | `ref: > services_servicerequest.service_request_id` |
| `message` | `text` | `not null` |
| `title` | `varchar(255)` | `not null` |
| `type` | `varchar(50)` | `not null` |
| `status` | `varchar(50)` | `not null` |
| `created_at` | `timestamp` | `not null` |
| `read_at` | `timestamp` | `nullable` |
| `send_email` | `boolean` | `not null` |
| `email_sent` | `boolean` | `not null` |

### Identity, Access, Configuration and Audit

#### 11. USER

Database table: `users_user`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `password` | `varchar(128)` | `not null` |
| `last_login` | `timestamp` | `nullable` |
| `is_superuser` | `boolean` | `not null` |
| `username` | `varchar(150)` | `not null, unique` |
| `first_name` | `varchar(150)` | `not null` |
| `last_name` | `varchar(150)` | `not null` |
| `email` | `varchar(254)` | `not null` |
| `is_staff` | `boolean` | `not null` |
| `is_active` | `boolean` | `not null` |
| `date_joined` | `timestamp` | `not null` |
| `user_id` | `bigint` | `pk, increment` |
| `role` | `varchar(20)` | `not null` |
| `middle_name` | `varchar(150)` | `not null` |
| `phone` | `varchar(20)` | `nullable` |
| `landline` | `varchar(50)` | `nullable` |
| `address` | `text` | `nullable` |
| `profile_image` | `varchar(100)` | `nullable` |
| `status` | `varchar(10)` | `not null` |
| `email_verified` | `boolean` | `not null` |
| `email_verification_sent_at` | `timestamp` | `nullable` |
| `pending_email` | `varchar(254)` | `nullable` |
| `pending_email_verification_sent_at` | `timestamp` | `nullable` |
| `mfa_enabled` | `boolean` | `not null` |
| `mfa_secret_encrypted` | `text` | `not null` |
| `mfa_recovery_code_hashes` | `jsonb` | `not null` |
| `mfa_confirmed_at` | `timestamp` | `nullable` |
| `created_at` | `timestamp` | `nullable` |
| `updated_at` | `timestamp` | `nullable` |

#### 12. CLIENT PROFILE

Database table: `users_clientprofile`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `client_profile_id` | `bigint` | `pk, increment` |
| `user_id` | `bigint` | `not null, unique, ref: - users_user.user_id` |
| `client_type` | `varchar(20)` | `not null` |
| `company_name` | `varchar(255)` | `nullable` |
| `company_registration` | `varchar(100)` | `nullable` |
| `billing_address` | `text` | `nullable` |
| `preferred_contact_method` | `varchar(20)` | `not null` |
| `credit_limit` | `decimal(10,2)` | `not null` |
| `account_balance` | `decimal(10,2)` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 13. TECHNICIAN PROFILE

Database table: `users_technicianprofile`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `technician_profile_id` | `bigint` | `pk, increment` |
| `user_id` | `bigint` | `not null, unique, ref: - users_user.user_id` |
| `current_latitude` | `decimal(9,6)` | `nullable` |
| `current_longitude` | `decimal(9,6)` | `nullable` |
| `last_location_update` | `timestamp` | `nullable` |
| `last_seen_at` | `timestamp` | `nullable` |
| `is_available` | `boolean` | `not null` |
| `skill_level` | `varchar(20)` | `not null` |
| `preferred_work_areas` | `text` | `not null` |
| `max_daily_assignments` | `smallint` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 14. MANAGEMENT PROFILE

Database table: `users_managementprofile`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `management_profile_id` | `bigint` | `pk, increment` |
| `user_id` | `bigint` | `not null, unique, ref: - users_user.user_id` |
| `admin_scope` | `varchar(50)` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 15. USER CAPABILITY GRANT

Database table: `users_usercapabilitygrant`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `user_capability_grant_id` | `bigint` | `pk, increment` |
| `user_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `capability_code` | `varchar(100)` | `not null` |
| `granted_by_id` | `bigint` | `ref: > users_user.user_id` |
| `granted_at` | `timestamp` | `not null` |

#### 16. ADMIN SETTINGS

Database table: `users_adminsettings`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `admin_settings_id` | `bigint` | `pk, increment` |
| `system_name` | `varchar(255)` | `not null` |
| `support_email` | `varchar(254)` | `not null` |
| `enable_notifications` | `boolean` | `not null` |
| `enable_in_app_notifications` | `boolean` | `not null` |
| `enable_email_notifications` | `boolean` | `not null` |
| `auto_dispatch_enabled` | `boolean` | `not null` |
| `allow_overtime_dispatch` | `boolean` | `not null` |
| `overtime_daily_capacity_minutes` | `smallint` | `not null` |
| `default_time_zone` | `varchar(100)` | `not null` |
| `max_technician_assignments` | `smallint` | `not null` |
| `business_days` | `jsonb` | `not null` |
| `business_open_time` | `time` | `not null` |
| `business_close_time` | `time` | `not null` |
| `holiday_dates` | `jsonb` | `not null` |
| `maintenance_reminder_days` | `smallint` | `not null` |
| `company_name` | `varchar(255)` | `not null` |
| `company_address` | `text` | `not null` |
| `document_footer` | `text` | `not null` |
| `currency_code` | `varchar(3)` | `not null` |
| `quotation_validity_days` | `smallint` | `not null` |
| `require_quotation_acceptance` | `boolean` | `not null` |
| `default_warranty_days` | `integer` | `not null` |
| `external_payment_notice` | `varchar(255)` | `not null` |
| `landing_page_content` | `jsonb` | `not null` |
| `solar_calculator_settings` | `jsonb` | `not null` |
| `landing_page_promotions` | `jsonb` | `not null` |
| `landing_page_projects` | `jsonb` | `not null` |
| `location_validation_enabled` | `boolean` | `not null` |
| `arrival_radius_meters` | `smallint` | `not null` |
| `location_validation_disabled_reason` | `text` | `not null` |
| `location_validation_updated_at` | `timestamp` | `nullable` |
| `location_validation_updated_by_id` | `bigint` | `ref: > users_user.user_id` |
| `updated_at` | `timestamp` | `not null` |
| `updated_by_id` | `bigint` | `ref: > users_user.user_id` |

#### 17. LANDING PAGE ASSET

Database table: `users_landingpageasset`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `landing_page_asset_id` | `bigint` | `pk, increment` |
| `file` | `varchar(100)` | `not null` |
| `original_name` | `varchar(255)` | `not null` |
| `content_type` | `varchar(100)` | `not null` |
| `uploaded_by_id` | `bigint` | `ref: > users_user.user_id` |
| `created_at` | `timestamp` | `not null` |

#### 18. ACTIVITY LOG

Database table: `users_activitylog`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `activity_log_id` | `bigint` | `pk, increment` |
| `actor_id` | `bigint` | `ref: > users_user.user_id` |
| `actor_role` | `varchar(20)` | `not null` |
| `actor_display_name` | `varchar(150)` | `not null` |
| `category` | `varchar(30)` | `not null` |
| `action` | `varchar(30)` | `not null` |
| `target_app_label` | `varchar(100)` | `not null` |
| `target_model` | `varchar(100)` | `not null` |
| `target_id` | `integer` | `nullable` |
| `target_label` | `varchar(255)` | `not null` |
| `message` | `varchar(255)` | `not null` |
| `metadata` | `text` | `not null` |
| `ip_address` | `varchar(39)` | `nullable` |
| `user_agent` | `text` | `not null` |
| `created_at` | `timestamp` | `not null` |

#### 19. CHANGE LOG

Database table: `users_changelog`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `change_log_id` | `bigint` | `pk, increment` |
| `content_type_id` | `integer` | `not null, note: 'References framework table django_content_type.id outside this application diagram'` |
| `object_id` | `integer` | `not null` |
| `action` | `varchar(20)` | `not null` |
| `field_name` | `varchar(100)` | `not null` |
| `old_value` | `text` | `nullable` |
| `new_value` | `text` | `nullable` |
| `changed_by_id` | `bigint` | `ref: > users_user.user_id` |
| `changed_at` | `timestamp` | `not null` |
| `summary` | `varchar(255)` | `not null` |

### Service Intake, Dispatch and Progress

#### 20. SERVICE TYPE

Database table: `services_servicetype`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_type_id` | `bigint` | `pk, increment` |
| `name` | `varchar(255)` | `not null` |
| `description` | `text` | `nullable` |
| `category` | `varchar(100)` | `not null` |
| `color` | `varchar(20)` | `not null` |
| `icon` | `varchar(50)` | `not null` |
| `display_order` | `integer` | `not null` |
| `estimated_duration` | `integer` | `not null` |
| `estimated_cost` | `decimal(10,2)` | `not null` |
| `max_daily_assignments` | `integer` | `not null` |
| `procedures` | `text` | `not null` |
| `required_equipment` | `text` | `not null` |
| `is_active` | `boolean` | `not null` |
| `requires_site_inspection` | `boolean` | `not null` |
| `deposit_policy` | `varchar(20)` | `not null` |
| `deposit_value` | `decimal(12,2)` | `not null` |

#### 21. SLA RULE

Database table: `services_slarule`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `sla_rule_id` | `bigint` | `pk, increment` |
| `key` | `varchar(40)` | `not null, unique` |
| `warning_minutes` | `integer` | `not null` |
| `overdue_minutes` | `integer` | `not null` |
| `is_active` | `boolean` | `not null` |
| `notes` | `text` | `nullable` |
| `updated_at` | `timestamp` | `not null` |

#### 22. SERVICE REQUEST

Database table: `services_servicerequest`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_request_id` | `bigint` | `pk, increment` |
| `client_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `service_type_id` | `bigint` | `not null, ref: > services_servicetype.service_type_id` |
| `description` | `text` | `not null` |
| `priority` | `varchar(50)` | `not null` |
| `status` | `varchar(50)` | `not null` |
| `preferred_date` | `date` | `nullable` |
| `preferred_time_slot` | `varchar(20)` | `nullable` |
| `request_source` | `varchar(30)` | `not null` |
| `scheduling_notes` | `text` | `nullable` |
| `request_date` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |
| `idempotency_key` | `varchar(128)` | `nullable` |
| `auto_ticket_created` | `boolean` | `not null` |

#### 23. SERVICE REQUEST SERVICE

Database table: `services_servicerequestservice`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_request_service_id` | `bigint` | `pk, increment` |
| `request_id` | `bigint` | `not null, ref: > services_servicerequest.service_request_id` |
| `service_type_id` | `bigint` | `not null, ref: > services_servicetype.service_type_id` |
| `notes` | `text` | `nullable` |
| `status` | `varchar(50)` | `not null` |
| `sort_order` | `integer` | `not null` |
| `created_at` | `timestamp` | `not null` |

#### 24. SERVICE LOCATION

Database table: `services_servicelocation`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_location_id` | `bigint` | `pk, increment` |
| `request_id` | `bigint` | `not null, unique, ref: - services_servicerequest.service_request_id` |
| `address` | `text` | `not null` |
| `city` | `varchar(100)` | `not null` |
| `province` | `varchar(100)` | `not null` |
| `latitude` | `decimal(9,6)` | `nullable` |
| `longitude` | `decimal(9,6)` | `nullable` |

#### 25. SOLAR ESTIMATE

Database table: `services_solarestimate`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `solar_estimate_id` | `bigint` | `pk, increment` |
| `client_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `service_request_id` | `bigint` | `unique, ref: - services_servicerequest.service_request_id` |
| `calculation_mode` | `varchar(20)` | `not null` |
| `monthly_consumption` | `decimal(10,2)` | `nullable` |
| `appliances` | `jsonb` | `not null` |
| `peak_sun_hours` | `decimal(4,2)` | `not null` |
| `system_loss_percent` | `decimal(5,2)` | `not null` |
| `panel_wattage` | `integer` | `not null` |
| `electricity_rate` | `decimal(8,2)` | `not null` |
| `desired_offset_percent` | `decimal(5,2)` | `not null` |
| `available_roof_area` | `decimal(10,2)` | `nullable` |
| `selected_promotion` | `jsonb` | `not null` |
| `result_snapshot` | `jsonb` | `not null` |
| `calculation_version` | `varchar(20)` | `not null` |
| `status` | `varchar(20)` | `not null` |
| `submitted_at` | `timestamp` | `nullable` |
| `converted_at` | `timestamp` | `nullable` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 26. SERVICE TICKET

Database table: `services_serviceticket`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_ticket_id` | `bigint` | `pk, increment` |
| `request_id` | `bigint` | `not null, ref: > services_servicerequest.service_request_id` |
| `ticket_type` | `varchar(20)` | `not null` |
| `technician_id` | `bigint` | `ref: > users_user.user_id` |
| `assigned_admin_id` | `bigint` | `ref: > users_user.user_id` |
| `scheduled_date` | `date` | `not null` |
| `scheduled_time` | `time` | `nullable` |
| `scheduled_time_slot` | `varchar(20)` | `nullable` |
| `start_time` | `timestamp` | `nullable` |
| `end_time` | `timestamp` | `nullable` |
| `completed_date` | `timestamp` | `nullable` |
| `status` | `varchar(50)` | `not null` |
| `priority` | `varchar(50)` | `not null` |
| `notes` | `text` | `nullable` |
| `client_rating` | `integer` | `nullable` |
| `client_feedback` | `text` | `nullable` |
| `auto_assigned` | `boolean` | `not null` |
| `assigned_at` | `timestamp` | `nullable` |
| `smart_assignment_score` | `double` | `nullable` |
| `smart_assignment_summary` | `varchar(255)` | `nullable` |
| `project_details` | `text` | `not null` |
| `reschedule_requested` | `boolean` | `not null` |
| `reschedule_reason` | `text` | `nullable` |
| `reschedule_requested_at` | `timestamp` | `nullable` |
| `warranty_status` | `varchar(20)` | `not null` |
| `warranty_period_days` | `integer` | `nullable` |
| `warranty_start_date` | `date` | `nullable` |
| `warranty_end_date` | `date` | `nullable` |
| `warranty_notes` | `text` | `nullable` |
| `route_geometry` | `text` | `nullable` |
| `route_distance` | `double` | `nullable` |
| `route_duration` | `double` | `nullable` |
| `completion_proof_images` | `text` | `not null` |
| `completion_notes` | `text` | `nullable` |
| `created_at` | `timestamp` | `nullable` |
| `updated_at` | `timestamp` | `nullable` |

#### 27. TICKET CREW ASSIGNMENT

Database table: `services_ticketcrewassignment`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `ticket_crew_assignment_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `technician_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `created_at` | `timestamp` | `not null` |

#### 28. SERVICE STATUS HISTORY

Database table: `services_servicestatushistory`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_status_history_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `status` | `varchar(50)` | `not null` |
| `changed_by_id` | `bigint` | `ref: > users_user.user_id` |
| `notes` | `text` | `nullable` |
| `timestamp` | `timestamp` | `not null` |

#### 29. TICKET PROGRESS

Database table: `progress_ticketprogress`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `ticket_progress_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `updated_by_id` | `bigint` | `ref: > users_user.user_id` |
| `progress_status` | `varchar(100)` | `not null` |
| `comment` | `text` | `nullable` |
| `updated_at` | `timestamp` | `not null` |

#### 30. TECHNICIAN SKILL

Database table: `services_technicianskill`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `technician_skill_id` | `bigint` | `pk, increment` |
| `technician_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `service_type_id` | `bigint` | `not null, ref: > services_servicetype.service_type_id` |
| `skill_level` | `varchar(50)` | `not null` |

#### 31. TECHNICIAN LOCATION HISTORY

Database table: `services_technicianlocationhistory`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `technician_location_history_id` | `bigint` | `pk, increment` |
| `technician_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `latitude` | `decimal(9,6)` | `not null` |
| `longitude` | `decimal(9,6)` | `not null` |
| `timestamp` | `timestamp` | `not null` |
| `accuracy` | `double` | `not null` |

#### 32. ARRIVAL VALIDATION LOG

Database table: `services_arrivalvalidationlog`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `arrival_validation_log_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `technician_id` | `bigint` | `ref: > users_user.user_id` |
| `performed_by_id` | `bigint` | `ref: > users_user.user_id` |
| `action` | `varchar(30)` | `not null` |
| `technician_latitude` | `decimal(9,6)` | `nullable` |
| `technician_longitude` | `decimal(9,6)` | `nullable` |
| `service_latitude` | `decimal(9,6)` | `nullable` |
| `service_longitude` | `decimal(9,6)` | `nullable` |
| `distance_meters` | `double` | `nullable` |
| `validation_result` | `varchar(20)` | `not null` |
| `validation_enabled` | `boolean` | `not null` |
| `radius_meters` | `smallint` | `not null` |
| `remarks` | `text` | `not null` |
| `created_at` | `timestamp` | `not null` |

### Field Evidence and Documents

#### 33. INSPECTION CHECKLIST

Database table: `services_inspectionchecklist`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `inspection_checklist_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, unique, ref: - services_serviceticket.service_ticket_id` |
| `created_at` | `timestamp` | `not null` |
| `completed_at` | `timestamp` | `nullable` |
| `completed_by_id` | `bigint` | `ref: > users_user.user_id` |
| `submitted_by_id` | `bigint` | `ref: > users_user.user_id` |
| `submitted_at` | `timestamp` | `nullable` |
| `is_completed` | `boolean` | `not null` |
| `site_accessible` | `boolean` | `not null` |
| `site_accessible_notes` | `text` | `nullable` |
| `electrical_available` | `boolean` | `not null` |
| `electrical_adequate` | `boolean` | `not null` |
| `electrical_notes` | `text` | `nullable` |
| `roof_condition` | `varchar(100)` | `nullable` |
| `structural_assessment` | `text` | `nullable` |
| `safety_equipment_present` | `boolean` | `not null` |
| `safety_hazards` | `text` | `nullable` |
| `recommendation` | `varchar(100)` | `nullable` |
| `additional_notes` | `text` | `nullable` |
| `maintenance_required` | `boolean` | `not null` |
| `maintenance_profile` | `varchar(30)` | `nullable` |
| `maintenance_interval_days` | `integer` | `nullable` |
| `maintenance_notes` | `text` | `nullable` |
| `service_type_label` | `varchar(255)` | `nullable` |
| `procedure_source` | `varchar(30)` | `nullable` |
| `checklist_items` | `text` | `not null` |
| `required_equipment_snapshot` | `text` | `not null` |
| `proof_media` | `text` | `not null` |
| `warranty_provided` | `boolean` | `not null` |
| `warranty_period_days` | `integer` | `nullable` |
| `warranty_notes` | `text` | `nullable` |
| `follow_up_required` | `boolean` | `not null` |
| `follow_up_case_type` | `varchar(20)` | `nullable` |
| `follow_up_due_date` | `date` | `nullable` |
| `follow_up_summary` | `varchar(255)` | `nullable` |
| `follow_up_details` | `text` | `nullable` |

#### 34. GENERATED DOCUMENT

Database table: `services_generateddocument`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `generated_document_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `document_type` | `varchar(64)` | `not null` |
| `title` | `varchar(255)` | `not null` |
| `status` | `varchar(32)` | `not null` |
| `data_json` | `text` | `not null` |
| `source_snapshot_json` | `text` | `not null` |
| `generated_by_id` | `bigint` | `ref: > users_user.user_id` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 35. TECHNICAL DATA SHEET

Database table: `services_technicaldatasheet`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `tds_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, unique, ref: - services_serviceticket.service_ticket_id` |
| `status` | `varchar(20)` | `not null` |
| `premise_type` | `varchar(100)` | `nullable` |
| `premise_category` | `varchar(100)` | `nullable` |
| `ownership_type` | `varchar(100)` | `nullable` |
| `private_or_government_type` | `varchar(100)` | `nullable` |
| `primary_electric_supply` | `varchar(100)` | `nullable` |
| `ac_phase_power_supply` | `varchar(100)` | `nullable` |
| `solar_panel_installation_location` | `varchar(100)` | `nullable` |
| `rooftop_type` | `varchar(100)` | `nullable` |
| `average_monthly_electric_bill` | `varchar(100)` | `nullable` |
| `electricity_required_hours_per_day` | `varchar(100)` | `nullable` |
| `brownout_frequency` | `varchar(100)` | `nullable` |
| `battery_preference` | `varchar(100)` | `nullable` |
| `purpose_of_going_solar` | `text` | `not null` |
| `load_schedule_json` | `text` | `not null` |
| `generator_details_json` | `text` | `not null` |
| `attachments_json` | `text` | `not null` |
| `client_confirmation_date` | `date` | `nullable` |
| `client_confirmed_name` | `varchar(255)` | `nullable` |
| `prepared_by_id` | `bigint` | `ref: > users_user.user_id` |
| `reviewed_by_id` | `bigint` | `ref: > users_user.user_id` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |
| `submitted_at` | `timestamp` | `nullable` |
| `reviewed_at` | `timestamp` | `nullable` |

#### 36. SOLAR COMMISSIONING CHECKLIST

Database table: `services_solarcommissioningchecklist`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `solar_commissioning_checklist_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, unique, ref: - services_serviceticket.service_ticket_id` |
| `site_name` | `varchar(255)` | `not null` |
| `inverter_type` | `varchar(255)` | `not null` |
| `system_designation` | `varchar(255)` | `not null` |
| `inverter_serial_number` | `varchar(255)` | `not null` |
| `commissioned_date` | `date` | `nullable` |
| `irradiance` | `varchar(100)` | `not null` |
| `ambient_temperature` | `varchar(100)` | `not null` |
| `readings_json` | `text` | `not null` |
| `checklist_items_json` | `text` | `not null` |
| `status` | `varchar(20)` | `not null` |
| `completed_by_id` | `bigint` | `ref: > users_user.user_id` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 37. TURNOVER ACCEPTANCE

Database table: `services_turnoveracceptance`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `turnover_acceptance_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, unique, ref: - services_serviceticket.service_ticket_id` |
| `generated_document_id` | `bigint` | `ref: > services_generateddocument.generated_document_id` |
| `turnover_date` | `date` | `nullable` |
| `accepted_by_client_name` | `varchar(255)` | `not null` |
| `accepted_by_client_contact` | `varchar(255)` | `not null` |
| `warranty_start_date` | `date` | `nullable` |
| `status` | `varchar(20)` | `not null` |
| `finalized_by_id` | `bigint` | `ref: > users_user.user_id` |
| `finalized_at` | `timestamp` | `nullable` |
| `client_confirmed_at` | `timestamp` | `nullable` |
| `client_confirmed_by_id` | `bigint` | `ref: > users_user.user_id` |
| `client_confirmation_note` | `text` | `not null` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 38. QUOTATION RECORD

Database table: `services_quotationrecord`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `quotation_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, unique, ref: - services_serviceticket.service_ticket_id` |
| `client_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `quotation_number` | `varchar(100)` | `nullable` |
| `total_amount` | `varchar(255)` | `nullable` |
| `downpayment_amount` | `varchar(255)` | `nullable` |
| `balance_amount` | `varchar(255)` | `nullable` |
| `deposit_policy` | `varchar(20)` | `not null` |
| `deposit_value` | `decimal(12,2)` | `not null` |
| `required_deposit_amount` | `decimal(14,2)` | `not null` |
| `payment_terms` | `text` | `nullable` |
| `warranty_terms` | `text` | `nullable` |
| `validity_days` | `integer` | `not null` |
| `status` | `varchar(20)` | `not null` |
| `bill_of_materials` | `text` | `not null` |
| `client_responded_at` | `timestamp` | `nullable` |
| `client_response_note` | `text` | `not null` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 39. INSTALLATION CONTRACT

Database table: `services_installationcontract`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `contract_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, unique, ref: - services_serviceticket.service_ticket_id` |
| `scope_of_work` | `text` | `nullable` |
| `start_date` | `date` | `nullable` |
| `estimated_completion_days` | `integer` | `nullable` |
| `total_contract_amount` | `decimal(12,2)` | `nullable` |
| `payment_terms_upfront` | `decimal(12,2)` | `nullable` |
| `payment_terms_completion` | `decimal(12,2)` | `nullable` |
| `payment_terms_final` | `decimal(12,2)` | `nullable` |
| `warranty_period` | `varchar(100)` | `nullable` |
| `status` | `varchar(20)` | `not null` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 40. SOLAR PROJECT PROFILE

Database table: `services_solarprojectprofile`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `project_profile_id` | `bigint` | `pk, increment` |
| `location_id` | `bigint` | `not null, unique, ref: - services_servicelocation.service_location_id` |
| `original_ticket_id` | `bigint` | `unique, ref: - services_serviceticket.service_ticket_id` |
| `system_capacity` | `varchar(100)` | `nullable` |
| `panel_brand` | `varchar(100)` | `nullable` |
| `number_of_panels` | `integer` | `nullable` |
| `inverter_brand` | `varchar(100)` | `nullable` |
| `number_of_inverters` | `integer` | `nullable` |
| `battery_brand` | `varchar(100)` | `nullable` |
| `mounting_structure` | `varchar(100)` | `nullable` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 41. FIELD SERVICE REPORT

Database table: `services_fieldservicereport`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `fsr_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `indoor_temp` | `varchar(50)` | `nullable` |
| `outdoor_temp` | `varchar(50)` | `nullable` |
| `ampere_reading` | `varchar(50)` | `nullable` |
| `voltage_reading` | `varchar(50)` | `nullable` |
| `before_service_readings` | `text` | `nullable` |
| `after_service_readings` | `text` | `nullable` |
| `brand_model` | `varchar(100)` | `nullable` |
| `serial_number` | `varchar(100)` | `nullable` |
| `recommendation` | `text` | `nullable` |
| `client_acknowledged` | `boolean` | `not null` |
| `client_signature_date` | `date` | `nullable` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 42. INSTALLED EQUIPMENT

Database table: `services_installedequipment`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `installed_equipment_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `ref: > services_serviceticket.service_ticket_id` |
| `client_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `brand_model` | `varchar(255)` | `not null` |
| `equipment_type` | `varchar(100)` | `not null` |
| `serial_number` | `varchar(255)` | `nullable` |
| `capacity` | `varchar(100)` | `nullable` |
| `location` | `varchar(255)` | `nullable` |
| `warranty_start` | `date` | `nullable` |
| `warranty_end` | `date` | `nullable` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

### Inventory, Returns and Sales

#### 43. INVENTORY CATEGORY

Database table: `inventory_inventorycategory`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `inventory_category_id` | `bigint` | `pk, increment` |
| `name` | `varchar(100)` | `not null` |
| `description` | `text` | `nullable` |
| `parent_id` | `bigint` | `ref: > inventory_inventorycategory.inventory_category_id` |

#### 44. INVENTORY ITEM

Database table: `inventory_inventoryitem`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `inventory_item_id` | `bigint` | `pk, increment` |
| `name` | `varchar(200)` | `not null` |
| `sku` | `varchar(50)` | `not null, unique` |
| `description` | `text` | `nullable` |
| `category_id` | `bigint` | `not null, ref: > inventory_inventorycategory.inventory_category_id` |
| `item_type` | `varchar(20)` | `not null` |
| `brand` | `varchar(100)` | `not null` |
| `model` | `varchar(100)` | `not null` |
| `size` | `varchar(100)` | `not null` |
| `unit_of_measurement` | `varchar(50)` | `not null` |
| `capacity` | `varchar(100)` | `not null` |
| `quantity` | `integer` | `not null` |
| `minimum_stock` | `integer` | `not null` |
| `reserved_quantity` | `integer` | `not null` |
| `warehouse_location` | `varchar(100)` | `nullable` |
| `unit_price` | `decimal(10,2)` | `not null` |
| `total_value` | `decimal(12,2)` | `not null` |
| `status` | `varchar(20)` | `not null` |
| `supplier` | `varchar(200)` | `nullable` |
| `supplier_contact` | `text` | `nullable` |
| `purchase_date` | `date` | `nullable` |
| `warranty_expiry` | `date` | `nullable` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |
| `low_stock_threshold` | `integer` | `not null` |
| `notes` | `text` | `nullable` |
| `last_notification_sent` | `timestamp` | `nullable` |

#### 45. SERVICE TYPE INVENTORY REQUIREMENT

Database table: `inventory_servicetypeinventoryrequirement`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_type_inventory_requirement_id` | `bigint` | `pk, increment` |
| `service_type_id` | `bigint` | `not null, ref: > services_servicetype.service_type_id` |
| `item_id` | `bigint` | `not null, ref: > inventory_inventoryitem.inventory_item_id` |
| `quantity` | `integer` | `not null` |
| `auto_reserve` | `boolean` | `not null` |
| `notes` | `text` | `nullable` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 46. INVENTORY RESERVATION

Database table: `inventory_inventoryreservation`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `inventory_reservation_id` | `bigint` | `pk, increment` |
| `item_id` | `bigint` | `not null, ref: > inventory_inventoryitem.inventory_item_id` |
| `technician_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `quantity` | `integer` | `not null` |
| `required_date` | `date` | `not null` |
| `service_ticket_id` | `bigint` | `ref: > services_serviceticket.service_ticket_id` |
| `notes` | `text` | `nullable` |
| `status` | `varchar(20)` | `not null` |
| `created_at` | `timestamp` | `not null` |

#### 47. INVENTORY TRANSACTION

Database table: `inventory_inventorytransaction`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `inventory_transaction_id` | `bigint` | `pk, increment` |
| `item_id` | `bigint` | `not null, ref: > inventory_inventoryitem.inventory_item_id` |
| `transaction_type` | `varchar(20)` | `not null` |
| `quantity` | `integer` | `not null` |
| `technician_id` | `bigint` | `ref: > users_user.user_id` |
| `service_ticket_id` | `bigint` | `ref: > services_serviceticket.service_ticket_id` |
| `reference_number` | `varchar(50)` | `nullable` |
| `notes` | `text` | `nullable` |
| `transaction_date` | `timestamp` | `not null` |
| `performed_by_id` | `bigint` | `ref: > users_user.user_id` |

#### 48. EQUIPMENT RETURN REQUEST

Database table: `inventory_equipmentreturnrequest`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `equipment_return_request_id` | `bigint` | `pk, increment` |
| `service_ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `technician_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `submitted_by_id` | `bigint` | `ref: > users_user.user_id` |
| `condition` | `varchar(20)` | `not null` |
| `notes` | `text` | `not null` |
| `status` | `varchar(20)` | `not null` |
| `created_at` | `timestamp` | `not null` |
| `reviewed_by_id` | `bigint` | `ref: > users_user.user_id` |
| `reviewed_at` | `timestamp` | `nullable` |
| `reviewed_condition` | `varchar(20)` | `not null` |
| `review_notes` | `text` | `not null` |

#### 49. EQUIPMENT RETURN REQUEST ITEM

Database table: `inventory_equipmentreturnrequestitem`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `equipment_return_request_item_id` | `bigint` | `pk, increment` |
| `return_request_id` | `bigint` | `not null, ref: > inventory_equipmentreturnrequest.equipment_return_request_id` |
| `item_id` | `bigint` | `not null, ref: > inventory_inventoryitem.inventory_item_id` |
| `quantity` | `integer` | `not null` |

#### 50. SALES RECORD

Database table: `services_salesrecord`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `sales_record_id` | `bigint` | `pk, increment` |
| `record_number` | `varchar(32)` | `not null, unique` |
| `ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `client_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `quotation_id` | `bigint` | `ref: > services_quotationrecord.quotation_id` |
| `status` | `varchar(20)` | `not null` |
| `sale_date` | `date` | `nullable` |
| `currency_code` | `varchar(3)` | `not null` |
| `agreed_total` | `decimal(14,2)` | `nullable` |
| `notes` | `text` | `not null` |
| `source_snapshot` | `jsonb` | `not null` |
| `created_by_id` | `bigint` | `ref: > users_user.user_id` |
| `confirmed_by_id` | `bigint` | `ref: > users_user.user_id` |
| `confirmed_at` | `timestamp` | `nullable` |
| `voided_by_id` | `bigint` | `ref: > users_user.user_id` |
| `voided_at` | `timestamp` | `nullable` |
| `void_reason` | `text` | `not null` |
| `replaces_id` | `bigint` | `unique, ref: - services_salesrecord.sales_record_id` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 51. SALES RECORD LINE

Database table: `services_salesrecordline`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `sales_record_line_id` | `bigint` | `pk, increment` |
| `sales_record_id` | `bigint` | `not null, ref: > services_salesrecord.sales_record_id` |
| `line_type` | `varchar(20)` | `not null` |
| `service_type_id` | `bigint` | `ref: > services_servicetype.service_type_id` |
| `inventory_item_id` | `bigint` | `ref: > inventory_inventoryitem.inventory_item_id` |
| `installed_equipment_id` | `bigint` | `ref: > services_installedequipment.installed_equipment_id` |
| `name` | `varchar(255)` | `not null` |
| `sku` | `varchar(80)` | `not null` |
| `quantity` | `decimal(12,3)` | `not null` |
| `unit` | `varchar(50)` | `not null` |
| `unit_price` | `decimal(14,2)` | `nullable` |
| `line_total` | `decimal(14,2)` | `nullable` |
| `source_snapshot` | `jsonb` | `not null` |
| `sort_order` | `integer` | `not null` |

#### 52. SALES PAYMENT

Database table: `services_salespayment`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `sales_payment_id` | `bigint` | `pk, increment` |
| `sales_record_id` | `bigint` | `ref: > services_salesrecord.sales_record_id` |
| `quotation_id` | `bigint` | `ref: > services_quotationrecord.quotation_id` |
| `amount` | `decimal(14,2)` | `not null` |
| `paid_on` | `date` | `not null` |
| `method` | `varchar(20)` | `not null` |
| `reference` | `varchar(120)` | `not null` |
| `notes` | `text` | `not null` |
| `recorded_by_id` | `bigint` | `ref: > users_user.user_id` |
| `recorded_at` | `timestamp` | `not null` |
| `is_voided` | `boolean` | `not null` |
| `voided_at` | `timestamp` | `nullable` |
| `voided_by_id` | `bigint` | `ref: > users_user.user_id` |
| `void_reason` | `text` | `not null` |

## Relationship Map

Each relationship follows this format:

`(SOURCE ENTITY) ---- source cardinality ---- VERB ---- target cardinality ---- (TARGET ENTITY)`

`N` means many, `1` means exactly one, and `0..1` means optional one. The field mapping identifies the exact foreign-key and referenced fields.

Total relationships: **107**

### Analytics

1. (DEMAND FORECAST) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
2. (SERVICE ANALYTICS) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
3. (SERVICE TREND) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
4. (TECHNICIAN PERFORMANCE) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]

### After-Sales and Communication

5. (AFTER-SALES CASE) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`assigned_to_id` -> `user_id`]
6. (AFTER-SALES CASE) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
7. (AFTER-SALES CASE) ---- N ---- CREATED BY ---- 1 ---- (USER)  [`created_by_id` -> `user_id`]
8. (AFTER-SALES CASE) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
9. (AFTER-SALES CASE EVENT) ---- N ---- PERFORMED BY ---- 1 ---- (USER)  [`actor_id` -> `user_id`]
10. (AFTER-SALES CASE EVENT) ---- N ---- FOR CASE ---- 1 ---- (AFTER-SALES CASE)  [`case_id` -> `after_sales_case_id`]
11. (CUSTOMER SUPPORT CASE) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
12. (CUSTOMER SUPPORT CASE) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
13. (MAINTENANCE SCHEDULE) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
14. (MAINTENANCE SCHEDULE) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
15. (MAINTENANCE SCHEDULE) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
16. (MESSAGE) ---- N ---- RECEIVED BY ---- 1 ---- (USER)  [`receiver_id` -> `user_id`]
17. (MESSAGE) ---- N ---- SENT BY ---- 1 ---- (USER)  [`sender_id` -> `user_id`]
18. (MESSAGE) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
19. (NOTIFICATION) ---- N ---- FOR REQUEST ---- 1 ---- (SERVICE REQUEST)  [`request_id` -> `service_request_id`]
20. (NOTIFICATION) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
21. (NOTIFICATION) ---- N ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]

### Identity, Access, Configuration and Audit

22. (ACTIVITY LOG) ---- N ---- PERFORMED BY ---- 1 ---- (USER)  [`actor_id` -> `user_id`]
23. (ADMIN SETTINGS) ---- N ---- LOCATION SETTINGS UPDATED BY ---- 1 ---- (USER)  [`location_validation_updated_by_id` -> `user_id`]
24. (ADMIN SETTINGS) ---- N ---- UPDATED BY ---- 1 ---- (USER)  [`updated_by_id` -> `user_id`]
25. (CHANGE LOG) ---- N ---- CHANGED BY ---- 1 ---- (USER)  [`changed_by_id` -> `user_id`]
26. (CLIENT PROFILE) ---- 1 ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]
27. (LANDING PAGE ASSET) ---- N ---- UPLOADED BY ---- 1 ---- (USER)  [`uploaded_by_id` -> `user_id`]
28. (MANAGEMENT PROFILE) ---- 1 ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]
29. (TECHNICIAN PROFILE) ---- 1 ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]
30. (USER CAPABILITY GRANT) ---- N ---- GRANTED BY ---- 1 ---- (USER)  [`granted_by_id` -> `user_id`]
31. (USER CAPABILITY GRANT) ---- N ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]

### Service Intake, Dispatch and Progress

32. (ARRIVAL VALIDATION LOG) ---- N ---- PERFORMED BY ---- 1 ---- (USER)  [`performed_by_id` -> `user_id`]
33. (ARRIVAL VALIDATION LOG) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
34. (ARRIVAL VALIDATION LOG) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
35. (SERVICE LOCATION) ---- 1 ---- FOR REQUEST ---- 1 ---- (SERVICE REQUEST)  [`request_id` -> `service_request_id`]
36. (SERVICE REQUEST) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
37. (SERVICE REQUEST) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
38. (SERVICE REQUEST SERVICE) ---- N ---- FOR REQUEST ---- 1 ---- (SERVICE REQUEST)  [`request_id` -> `service_request_id`]
39. (SERVICE REQUEST SERVICE) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
40. (SERVICE STATUS HISTORY) ---- N ---- CHANGED BY ---- 1 ---- (USER)  [`changed_by_id` -> `user_id`]
41. (SERVICE STATUS HISTORY) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
42. (SERVICE TICKET) ---- N ---- MANAGED BY ---- 1 ---- (USER)  [`assigned_admin_id` -> `user_id`]
43. (SERVICE TICKET) ---- N ---- FOR REQUEST ---- 1 ---- (SERVICE REQUEST)  [`request_id` -> `service_request_id`]
44. (SERVICE TICKET) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
45. (SOLAR ESTIMATE) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
46. (SOLAR ESTIMATE) ---- 0..1 ---- FROM REQUEST ---- 1 ---- (SERVICE REQUEST)  [`service_request_id` -> `service_request_id`]
47. (TECHNICIAN LOCATION HISTORY) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
48. (TECHNICIAN SKILL) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
49. (TECHNICIAN SKILL) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
50. (TICKET CREW ASSIGNMENT) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
51. (TICKET CREW ASSIGNMENT) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
52. (TICKET PROGRESS) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
53. (TICKET PROGRESS) ---- N ---- UPDATED BY ---- 1 ---- (USER)  [`updated_by_id` -> `user_id`]

### Field Evidence and Documents

54. (FIELD SERVICE REPORT) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
55. (GENERATED DOCUMENT) ---- N ---- GENERATED BY ---- 1 ---- (USER)  [`generated_by_id` -> `user_id`]
56. (GENERATED DOCUMENT) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
57. (INSPECTION CHECKLIST) ---- N ---- COMPLETED BY ---- 1 ---- (USER)  [`completed_by_id` -> `user_id`]
58. (INSPECTION CHECKLIST) ---- N ---- SUBMITTED BY ---- 1 ---- (USER)  [`submitted_by_id` -> `user_id`]
59. (INSPECTION CHECKLIST) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
60. (INSTALLATION CONTRACT) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
61. (INSTALLED EQUIPMENT) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
62. (INSTALLED EQUIPMENT) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
63. (QUOTATION RECORD) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
64. (QUOTATION RECORD) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
65. (SOLAR COMMISSIONING CHECKLIST) ---- N ---- COMPLETED BY ---- 1 ---- (USER)  [`completed_by_id` -> `user_id`]
66. (SOLAR COMMISSIONING CHECKLIST) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
67. (SOLAR PROJECT PROFILE) ---- 1 ---- AT LOCATION ---- 1 ---- (SERVICE LOCATION)  [`location_id` -> `service_location_id`]
68. (SOLAR PROJECT PROFILE) ---- 0..1 ---- ORIGINATES FROM ---- 1 ---- (SERVICE TICKET)  [`original_ticket_id` -> `service_ticket_id`]
69. (TECHNICAL DATA SHEET) ---- N ---- PREPARED BY ---- 1 ---- (USER)  [`prepared_by_id` -> `user_id`]
70. (TECHNICAL DATA SHEET) ---- N ---- REVIEWED BY ---- 1 ---- (USER)  [`reviewed_by_id` -> `user_id`]
71. (TECHNICAL DATA SHEET) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
72. (TURNOVER ACCEPTANCE) ---- N ---- HAS CLIENT CONFIRMED BY ---- 1 ---- (USER)  [`client_confirmed_by_id` -> `user_id`]
73. (TURNOVER ACCEPTANCE) ---- N ---- FINALIZED BY ---- 1 ---- (USER)  [`finalized_by_id` -> `user_id`]
74. (TURNOVER ACCEPTANCE) ---- N ---- USES DOCUMENT ---- 1 ---- (GENERATED DOCUMENT)  [`generated_document_id` -> `generated_document_id`]
75. (TURNOVER ACCEPTANCE) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]

### Inventory, Returns and Sales

76. (EQUIPMENT RETURN REQUEST) ---- N ---- REVIEWED BY ---- 1 ---- (USER)  [`reviewed_by_id` -> `user_id`]
77. (EQUIPMENT RETURN REQUEST) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
78. (EQUIPMENT RETURN REQUEST) ---- N ---- SUBMITTED BY ---- 1 ---- (USER)  [`submitted_by_id` -> `user_id`]
79. (EQUIPMENT RETURN REQUEST) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
80. (EQUIPMENT RETURN REQUEST ITEM) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`item_id` -> `inventory_item_id`]
81. (EQUIPMENT RETURN REQUEST ITEM) ---- N ---- CONTAINS ---- 1 ---- (EQUIPMENT RETURN REQUEST)  [`return_request_id` -> `equipment_return_request_id`]
82. (INVENTORY CATEGORY) ---- N ---- HAS PARENT ---- 1 ---- (INVENTORY CATEGORY)  [`parent_id` -> `inventory_category_id`]
83. (INVENTORY ITEM) ---- N ---- IN CATEGORY ---- 1 ---- (INVENTORY CATEGORY)  [`category_id` -> `inventory_category_id`]
84. (INVENTORY RESERVATION) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`item_id` -> `inventory_item_id`]
85. (INVENTORY RESERVATION) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
86. (INVENTORY RESERVATION) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
87. (INVENTORY TRANSACTION) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`item_id` -> `inventory_item_id`]
88. (INVENTORY TRANSACTION) ---- N ---- PERFORMED BY ---- 1 ---- (USER)  [`performed_by_id` -> `user_id`]
89. (INVENTORY TRANSACTION) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
90. (INVENTORY TRANSACTION) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
91. (SALES PAYMENT) ---- N ---- BASED ON ---- 1 ---- (QUOTATION RECORD)  [`quotation_id` -> `quotation_id`]
92. (SALES PAYMENT) ---- N ---- HAS RECORDED BY ---- 1 ---- (USER)  [`recorded_by_id` -> `user_id`]
93. (SALES PAYMENT) ---- N ---- CONTAINS ---- 1 ---- (SALES RECORD)  [`sales_record_id` -> `sales_record_id`]
94. (SALES PAYMENT) ---- N ---- VOIDED BY ---- 1 ---- (USER)  [`voided_by_id` -> `user_id`]
95. (SALES RECORD) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
96. (SALES RECORD) ---- N ---- CONFIRMED BY ---- 1 ---- (USER)  [`confirmed_by_id` -> `user_id`]
97. (SALES RECORD) ---- N ---- CREATED BY ---- 1 ---- (USER)  [`created_by_id` -> `user_id`]
98. (SALES RECORD) ---- N ---- BASED ON ---- 1 ---- (QUOTATION RECORD)  [`quotation_id` -> `quotation_id`]
99. (SALES RECORD) ---- 0..1 ---- REPLACES ---- 1 ---- (SALES RECORD)  [`replaces_id` -> `sales_record_id`]
100. (SALES RECORD) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
101. (SALES RECORD) ---- N ---- VOIDED BY ---- 1 ---- (USER)  [`voided_by_id` -> `user_id`]
102. (SALES RECORD LINE) ---- N ---- USES EQUIPMENT ---- 1 ---- (INSTALLED EQUIPMENT)  [`installed_equipment_id` -> `installed_equipment_id`]
103. (SALES RECORD LINE) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`inventory_item_id` -> `inventory_item_id`]
104. (SALES RECORD LINE) ---- N ---- CONTAINS ---- 1 ---- (SALES RECORD)  [`sales_record_id` -> `sales_record_id`]
105. (SALES RECORD LINE) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
106. (SERVICE TYPE INVENTORY REQUIREMENT) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`item_id` -> `inventory_item_id`]
107. (SERVICE TYPE INVENTORY REQUIREMENT) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
