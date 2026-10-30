# Platform administration

Platform administrators are separate from shop owners. No account automatically receives this role. To bootstrap an explicitly selected existing staff identity, a local operator can run:

```sh
npm run admin:grant -- operator@example.com
```

The command requires the root `.env` database connection and an existing staff identity with a password. It records the local bootstrap operation in the platform audit log. It has not been executed during this implementation.

Sign in to the Business App with that identity and open `/admin`. The platform view lists shops with pagination. Administrators can suspend/reactivate an active shop with an audited reason. Suspension preserves records and appointments while denying staff operations and public client access. It does not cancel appointments, issue refunds or delete data.

The shop support view is read-only and records every access in `platform_audit_events`. It shows shop configuration, counts and up to 25 appointments, without granting a fake owner session. Platform administration does not provide mutation access to tenant appointments through the support page.

Future plans/subscriptions, feature flags, automated shop deletion/retention and platform settings remain unfinished. Apply the platform-admin migration before using these routes. Implementation has not been tested or built in this pass, per the user's instruction.
