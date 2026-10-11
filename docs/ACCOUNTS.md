# Accounts, organisations and owner administration

Read this together with [`DEPLOYMENT.md`](DEPLOYMENT.md) and
[`HARD_REQUIREMENTS.md`](HARD_REQUIREMENTS.md).

Nothing in this document is required to run CodeProof. With none of it
configured, people sign in with an email address and a password exactly as
before, and the core workflow needs no outside service.

## How people sign in

The product offers whatever the deployment can deliver:

| Configured | What the sign-in page offers |
| --- | --- |
| Nothing | Email address and password. |
| A mail provider | Email address and a 6-digit code, at sign-up and at every sign-in. Passwords are no longer offered. |
| A mail provider and `CODEPROOF_PASSWORD_SIGN_IN=true` | Codes, with the password form kept as a second way in. |
| Google client | A "Continue with Google" button beside whichever of the above applies. |
| A mail provider and Twilio | Codes by email, and by text message to a mobile number the person has already confirmed on their account page. |

`next dev` with no mail provider shows the code on the sign-in page instead of
sending it, so the flow can be tried locally, and keeps the password form
beside it. A code is never shown on screen in a production build.

A code is six digits, works once, lasts 10 minutes and allows 5 wrong guesses.
A new one can be requested after 60 seconds, up to 5 in 30 minutes for one
address. The database holds a keyed digest of the code and of the address,
never either one. The page answers the same way whether or not an address has
an account.

An account's identity is its email address. A mobile number is only a second
place to receive a code.

`GET /api/health` reports what is switched on under `signIn`, so a deployment
can be checked after its variables are set.

## Email codes

Set the sender and one provider key:

```bash
CODEPROOF_MAIL_FROM="CodeProof <no-reply@your-domain.example>"
RESEND_API_KEY=...        # or
BREVO_API_KEY=...
```

1. Create an account with [Resend](https://resend.com) or
   [Brevo](https://www.brevo.com). Both have a free tier.
2. Verify the domain you will send from. The provider lists the DNS records to
   add. Mail from an unverified domain is refused or lands in spam.
3. Create an API key that may send mail and store it in the host's secret
   manager, for Production and for Preview if previews should send mail.
4. Set `CODEPROOF_MAIL_FROM` to an address on the verified domain.
5. Redeploy, open `/api/health` and confirm `signIn.emailCode` is `true`.

Once codes can be delivered, passwords stop being offered. An account that was
created with a password signs in with a code sent to the same address; nothing
has to be migrated. To keep passwords available as well, for example during a
mail outage, set `CODEPROOF_PASSWORD_SIGN_IN=true`.

## Google sign-in

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

1. In the Google Cloud console, create or choose a project and configure the
   OAuth consent screen. The product asks only for `openid`, `email` and
   `profile`.
2. Under Credentials, create an OAuth client ID of type "Web application".
3. Add the authorised redirect URI, exactly:
   `https://YOUR_URL/api/auth/google/callback`. Add one line for each address
   the product is served from. For local testing add
   `http://localhost:3000/api/auth/google/callback`.
4. Store the client ID and secret in the host's secret manager and redeploy.

The sign-in is checked on the server without any SDK: the authorisation code is
exchanged with a one-time verifier, and Google's signed answer is verified
against Google's published keys, including who it was issued for, when it
expires, the one-time value this request generated, and that Google itself has
verified the address. A Google account whose address matches an existing
account signs in to that account.

## Codes by text message

```bash
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM=+15550000000
```

Text messages cost money per message, which is why this is off until all three
values are set. It also needs a mail provider, because an account always starts
from an email address. A person adds and confirms a mobile number on their
account page; after that the sign-in page lets them ask for the code by text.
A number belongs to one account.

## The address of the deployment

Invitation links and the Google redirect use the address the request arrived
at, as the host forwarded it. Set `CODEPROOF_PUBLIC_URL=https://YOUR_URL` when
the product sits behind a proxy that does not forward the original host.

## Organisations

A company or a recruitment agency is an organisation. The rules:

- A person belongs to at most one organisation.
- Each recruiter keeps their own candidates. Joining an organisation does not
  pool them.
- The organisation's admin invites and removes recruiters, changes their role,
  and can read every member's candidates. The admin cannot change another
  member's candidates, and recruiters cannot see each other's.
- An organisation always keeps at least one admin.
- An invitation is a link bound to one email address. It works once, for seven
  days. The person signs in with that address, by code or with Google, and
  joins. Only a digest of the link is stored.
- Seats are counted as members plus open invitations. The plan sets the number
  unless an owner sets another for that organisation.

## Owner administration

The pages under `/admin` are for the people who run CodeProof. They answer
"not found" to everyone else.

To make an account an owner:

1. Sign in once with the address, so the account exists.
2. Set `ADMIN_EMAIL` to that address.
3. Restart or redeploy. The role is granted the next time the application
   starts.

Owners can:

- see how many real accounts and organisations there are, with demo data
  counted apart, and which organisations are overdue or near the end of their
  period;
- search and filter accounts, change an account's plan, and suspend,
  reactivate, remove or restore it. A suspended or removed account is signed
  out on its next request and cannot sign in. Removing keeps every record, so
  restoring brings all of it back;
- set up an organisation for a customer, record its plan, subscription status,
  seat count, period and private notes, name its admin, and pause or restore
  it.

Every change is written to the audit log in the same transaction as the change
itself. Changes are accepted only by `POST`, only from the product's own pages,
and never from a request that carries its own claim to a role.

## Plans

The plans are listed in `src/features/plans/catalog.ts`: an identifier, a name,
whether it counts as paid in the owner's figures, and a seat count. Plans are
assigned by hand. No payment is taken anywhere in the product and no price is
stored. Today a plan controls the seat count and nothing else.

## Data

Six tables are added: account profiles, linked sign-in identities, sign-in
codes, organisations, their members and their invitations. They are created the
first time they are needed, on SQLite and on PostgreSQL, and sit beside the
schema migration ledger rather than inside it. No existing table is altered.

## Not included

- Payment, invoices and prices.
- Limits by plan other than seats.
- Figures for AI usage and cost on the owner's first page.
- Signing in as a customer to see what they see.
- A way for a person to delete their own account.
