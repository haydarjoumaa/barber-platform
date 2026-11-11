# Platform administration and shop creation

Only the platform administrator creates shops and owner accounts. This replaces public owner registration (November 10 product decision). Customer registration remains shop-specific and available on published client booking sites.

## First administrator

From the repository root, after configuring and migrating the local database:

```sh
npm run admin:create -- your-email@example.com
```

Enter and confirm a password in the terminal. Input is hidden and never passed as a command argument. The command creates a new identity and platform role atomically, without creating a shop. It rejects duplicate emails and never resets an existing password. The operation is audited.

If you already have an account and want to make that specific identity the platform administrator, use:

```sh
npm run admin:grant -- your-existing-email@example.com
```

Both commands are local operator tools requiring database access. There is no public administrator signup or automatic administrator grant. No email or password is supplied by default.

## Create a shop

1. Sign in at `http://localhost:3001/login`. This login accepts platform administrators only and opens `/admin`.
2. Use **Create shop and owner account**. Enter the owner's email, initial password, shop name, unique slug and currency.
3. Share the owner credentials privately and the staff login link, for example `http://localhost:3001/haydar-barber-shop/login`.
4. The owner configures services, barber profiles, schedules, policies and contact details, then publishes the booking page.
5. Customers use `http://localhost:3002/haydar-barber-shop`. Their accounts and appointments belong only to that shop.

Creating a shop writes its identity, owner membership and audit events in one transaction. The administrator remains signed in as the administrator. Duplicate account emails and slugs fail without partial records; existing account passwords are never overwritten. Attaching a second shop to an already-existing owner identity is not exposed by this form.

Shop staff still use the shared `/workspace` route after sign-in, but the session exposes only the shop selected at login. Signing in through another shop's URL requires an active membership there. Suspension, deletion and disabled staff access are checked live. Logout returns staff to their shop login and administrators to the platform login. `/register` redirects to `/login` and cannot create shops.

## Administration

The platform view lists shops with pagination and provides staff/customer links. Administrators can suspend/reactivate a shop with an audited reason. Suspension preserves records and appointments while denying staff operations and public client access. It does not cancel appointments or delete data.

Support views are read-only and audited. The platform role alone never grants shop-owner authority over appointments, services or schedules. Future subscriptions, feature flags, deletion/retention and global settings remain separate work.

## Migration and verification

Apply `20261110000100_scoped_staff_sessions`. Existing staff sessions without a shop scope are no longer accepted; staff sign in again through their shop URL. Existing platform administrators can retain their platform sessions. Identities, appointments and client sessions are preserved.

Database coverage includes anonymous/non-admin creation denial, duplicate rollback, unchanged admin sessions, wrong-shop/wrong-role sign-in, scoped membership checks and live access changes. The browser scenario starts with administrator login and shop creation, then continues through owner setup, publication and customer booking.
