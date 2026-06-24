# Security'26

Static Security'26 frontend with Vercel serverless authentication endpoints,
Firebase/Firestore, and backend WhatsApp Cloud API automation. It helps club
owners and event hosts collaborate with team members, manage volunteers, record
attendance, and send approved WhatsApp templates without exposing Meta secrets
to the browser.

## WhatsApp Automation

All WhatsApp sends happen through `/api` routes. The frontend never receives the
Meta access token, phone number ID, webhook verification token, Firebase Admin
private key, or other sensitive credentials.

- Meeting reminders: View Flags has the reminder panel. Select members, enter a
  meeting time, and click **Send WhatsApp Reminders**. The route
  `/api/whatsapp/send-reminders` sends the approved meeting reminder template.
- Absent notices: Attendance is saved through `/api/attendance/save`. The first
  save for a session identifies absent members and sends the approved absent
  template. Later saves update attendance but skip WhatsApp notices.
- Flagged member review: Each flagged student card has its own
  **Send WhatsApp review** action. It calls `/api/whatsapp/send-targeted` for
  that one member using the approved absence review template.
- Webhooks: Meta verification and incoming events are handled by
  `/api/whatsapp/webhook`. Incoming messages are stored in
  `whatsappIncomingMessages` for future replies, confirmations, acknowledgements,
  AI responses, or workflow automation.

The template variable order is configured in `api/_whatsappTemplates.js` and
must match the approved Meta templates:

- `meetingReminder`: `name`, `meeting_time`
- `absentNotice`: `name`, `meeting_name`, `date`, `time`
- `absenceReview`: `name`, `meeting_name`

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import the GitHub repository in Vercel.
3. Keep the detected project root as the repository root. The included
   `vercel.json` supplies the build and output settings.
4. Add these Production environment variables in **Vercel -> Project Settings ->
   Environment Variables**:

   - `FIREBASE_API_KEY`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
   - `TURNSTILE_SITE_KEY`
   - `TURNSTILE_SECRET_KEY`
   - `META_WHATSAPP_ACCESS_TOKEN`
   - `META_WHATSAPP_PHONE_NUMBER_ID`
   - `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - `WHATSAPP_GRAPH_VERSION`
   - `WHATSAPP_TEMPLATE_LANGUAGE`
   - `WHATSAPP_TEMPLATE_MEETING_REMINDER`
   - `WHATSAPP_TEMPLATE_ABSENT_NOTICE`
   - `WHATSAPP_TEMPLATE_ABSENCE_REVIEW`

5. In Cloudflare Turnstile, add the final `*.vercel.app` hostname and any custom
   domain to the widget's allowed hostnames.
6. Deploy.

Firebase Email/Password authentication must be enabled, and the Firebase users
used by this app must already exist. Usernames entered without an `@` are mapped
to `<username>@gmail.com` by default. Set `LOGIN_EMAIL_DOMAIN` if your Firebase
users use a different email domain.

## Local Development

Copy `.env.example` to `.env.local`, fill in the values, and run:

```sh
npm start
```

The local server disables Turnstile unless `NODE_ENV=production` is set. For
local WhatsApp testing, keep the values in `.env.local`. Do not commit that file.
The Firebase Admin private key can use escaped newlines, as shown in
`.env.example`.

Run the same production validation used by Vercel with:

```sh
npm run build
```

The separate `functions/` directory contains Firebase Functions and is not
deployed by Vercel.
