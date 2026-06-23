# Club Desk

Static Club Desk frontend with Vercel serverless authentication endpoints and a
Firebase/Firestore data layer.

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import the GitHub repository in Vercel.
3. Keep the detected project root as the repository root. The included
   `vercel.json` supplies the build and output settings.
4. Add these Production environment variables in **Vercel → Project Settings →
   Environment Variables**:

   - `FIREBASE_API_KEY`
   - `TURNSTILE_SITE_KEY`
   - `TURNSTILE_SECRET_KEY`

5. In Cloudflare Turnstile, add the final `*.vercel.app` hostname and any custom
   domain to the widget's allowed hostnames.
6. Deploy.

Firebase Email/Password authentication must be enabled, and the Firebase users
used by this app must already exist. Usernames entered without an `@` are mapped
to `<username>@clubdesk.local`.

## Local development

Copy `.env.example` to `.env.local`, fill in the values, and run:

```sh
npm start
```

The local server disables Turnstile unless `NODE_ENV=production` is set.

Run the same production validation used by Vercel with:

```sh
npm run build
```

The separate `functions/` directory contains Firebase Functions and is not
deployed by Vercel.
