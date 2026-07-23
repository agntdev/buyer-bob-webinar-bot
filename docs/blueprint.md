# Buyer Bob Webinar Signup — Bot specification

**Archetype:** booking

**Voice:** warm and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot that enables users to register for Buyer Bob's free training webinar with immediate confirmation. Collects name, email, and phone number, and notifies admins of new registrations. Users can view/update their registration details, and admins can export registration data as CSV.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- General public
- Potential webinar attendees

## Success criteria

- User receives confirmation message after registration
- Admin receives instant notification of new registration
- User can access registration details via /my_registration
- Admin can export up to 10,000 registrations as CSV

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open registration flow
  - inputs: name, email, phone
  - outputs: confirmation message, admin notification
- **/my_registration** (command, actor: user, command: /my_registration) — View/update registration details
  - inputs: Telegram ID
  - outputs: registration summary, update/cancel options
- **Confirm Registration** (button, actor: user, callback: confirm:registration) — Finalize registration after providing details
  - inputs: registration data
  - outputs: confirmation message, admin notification

## Flows

### Registration Flow
_Trigger:_ /start or deep link

1. Request name via ForceReply
2. Request email via ForceReply (basic format validation)
3. Request phone via ForceReply (digit normalization)
4. Display summary with confirmation button

_Data touched:_ registrant, webinar_event

### Admin Export Flow
_Trigger:_ admin-only /export_csv command

1. List recent registrations
2. Generate CSV file
3. Send CSV to admin

_Data touched:_ registrant

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **webinar_event** _(retention: persistent)_ — Webinar details including title, date/time, and capacity
  - fields: title, date_time, capacity
- **registrant** _(retention: persistent)_ — User registration information
  - fields: telegram_id, name, email, phone, registration_timestamp, confirmation_status
- **admin_notification** _(retention: session)_ — New registration alerts for admin(s)
  - fields: registrant_data, notification_timestamp

## Integrations

- **Telegram** (required) — Bot API messaging and admin notifications
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Configure webinar title/date/time
- Set admin notification target (user/group)
- Adjust registration data retention period

## Notifications

- Instant user confirmation message
- Admin group/user notification on new registration
- CSV export completion notification

## Permissions & privacy

- Collects personal contact information (email/phone) with implied user consent
- Admin access restricted to configured users/groups
- Data storage complies with applicable privacy regulations

## Edge cases

- Webinar capacity reached (no handling specified)
- Invalid email/phone format beyond basic validation
- User attempts to update registration without prior registration
- Admin export request exceeding 10,000 records

## Required tests

- End-to-end registration flow with confirmation and admin alert
- Admin CSV export with 10,000 record limit validation
- User update/cancel flow from /my_registration
- Data retention policy enforcement

## Assumptions

- Webinar details will be configured later via owner controls
- Admin notification target defaults to owner's Telegram account
- Basic validation is sufficient for initial release
- CSV export limit of 10,000 is acceptable for production
