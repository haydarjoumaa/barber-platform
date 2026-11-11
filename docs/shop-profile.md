# Shop name and booking-link edits

Owners can edit their shop name and URL slug in **Edit shop profile** in the workspace. Names are trimmed and limited to 100 characters. Slugs must satisfy the shared 3–63-character lowercase letters/numbers/single-hyphens rule and cannot use reserved system routes. A unique PostgreSQL index prevents two shops from claiming the same slug, including during concurrent registration or edits. The interface explains that old slugs are not redirected; storefront routing and publication are still pending.

Each save verifies the request origin, authenticates the session, and rechecks owner membership and shop activation inside the existing locked owner transaction. The submitted shop ID is only a selector, never proof of access. Names and slugs originally displayed by the form are compared against the current row, so a stale tab cannot silently overwrite another owner's changes. On a conflict, reload and review the latest values before saving.

The profile update and `shop.profile_updated` audit event commit together. The event records the verified actor and before/after name and slug. A no-op save does not add an audit event. Audit failures roll back the profile change. The operation does not change publication, timezone, currency, membership or appointments.

No schema migration or new environment variables are required. Run `npm test` for action validation, authentication/origin checks and error handling. With the migrated local PostgreSQL database running, run `node --env-file-if-exists=.env --import tsx --test tests/shop-profile.integration.ts` for tenant isolation, database permission rechecks, stale-write races, duplicate slugs and audit rollback. It is also included in `npm run test:database`.

Verification on October 30, 2026: typechecking, linting and action tests pass. The PostgreSQL integration test could not connect to the configured local database at 127.0.0.1:55440; database race/rollback verification and browser checks against real records remain pending.

## Public links (November 11)

Under **Contact details and appearance**, owners can edit website, Instagram and Facebook URLs alongside existing contact details, description and accent color. Links appear on the published client storefront and `/book` page in English/Arabic. Only HTTPS URLs without embedded credentials are accepted; social links must use the named platform's host. Blank fields remove links. The server checks live owner access, shop state and the expected profile version, and records an audit event. Links open in a separate tab with `noopener noreferrer`.

Public photos are managed in **Shop photo gallery**; see [media](media.md). Advanced templates and configurable page sections remain deferred.
