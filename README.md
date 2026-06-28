# Security'26

Security'26 is a club operations desk for volunteer management, attendance,
meeting records, flags, activity logs, and WhatsApp communication. It gives a
small team one place to run daily admin work without sharing private Firebase or
Meta credentials in the browser.

## What This Project Has Accomplished

From a sales point of view, Security'26 turns scattered club work into a clear
product: teams can add volunteers, record attendance, spot absence patterns, and
send approved WhatsApp reminders from one dashboard. That creates a practical
demo for any organization that needs safer member management and faster
follow-up.

From a business point of view, it reduces manual tracking, centralizes records,
and protects sensitive setup values behind backend API routes. The project also
adds audit-friendly admin activity logs, structured Firestore storage, and
deployment-ready Vercel configuration so the app can move from local use to a
public cloud workflow.

In plain English, this app helps a club know who its volunteers are, who came to
meetings, who needs attention, and who should receive a message. Instead of
updating many lists by hand, the team can open the dashboard and manage the work
in a simpler, more organized way.

## Core Features

- Volunteer records with add, edit, search, delete, images, notes, and flags.
- Attendance sessions with present and absent tracking.
- Statistics by meeting, branch, gender, and year.
- WhatsApp reminder, absence notice, and targeted review routes.
- Firebase authentication, Firestore storage, and protected admin APIs.
- Vercel-ready static frontend build with serverless API routes.

## Local Development

Copy `.env.example` to `.env.local`, fill in the values, and run:

```sh
npm start
```

Run validation and rebuild the static frontend with:

```sh
npm run build
```

Keep `.env.local` private. The frontend should never receive the Meta access
token, phone number ID, webhook token, Firebase Admin private key, or other
server secrets.
