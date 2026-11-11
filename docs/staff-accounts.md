# Staff accounts

Staff accounts use email/password. Only the platform administrator creates shops and initial owner accounts. Owners can invite barbers/receptionists. Public `/register` is closed; clients still register through their own shop's Client App.

- Platform login: `http://localhost:3001/login` → `/admin`.
- Shop staff login: `http://localhost:3001/{shopSlug}/login` → `/workspace` scoped to that shop.
- Customer booking/account: `http://localhost:3002/{shopSlug}`.

See [administrator setup and shop creation](platform-administration.md) for the first administrator and owner provisioning.

Passwords require at least 12 characters and at most 1024 UTF-8 bytes; they are hashed with scrypt. Staff identities, memberships and barber profiles remain separate. Shop creation leaves the page unpublished and does not create a barber profile.

Sessions expire after eight hours or one hour of inactivity. Login rotates the previous browser session; logout revokes it. Shop logins require an active membership in the requested, non-suspended shop. Each new staff session stores that shop's ID; authentication returns only that membership and rechecks disabled access and shop status. Platform login requires an explicit administrator role and returns no shop memberships. Staff and platform sign-ins share one browser cookie; use separate browser profiles when testing both simultaneously.

Apply migration `20261110000100_scoped_staff_sessions` before using the updated login. Existing non-administrator sessions need a fresh shop-specific sign-in. Shop and account records are preserved.

Configure the same `DATABASE_URL` in root `.env` and both app environment files. Each app's `APP_ORIGIN` must match its browser origin. `npm run setup` creates missing files; no secrets belong in Git.

The existing database attempt limits apply to login and provisioning/invitation acceptance. Origin checks protect form submissions. No email delivery, SMS or paid service is used. Staff password recovery remains unfinished.

`npm run test:database` checks provisioning authorization/rollback, hashes, session scope, rotation, expiry, role changes and concurrent limits using temporary schemas. `npm run test:browser` exercises the admin-to-owner-to-client workflow and staff invitation acceptance.
