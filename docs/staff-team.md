# Staff invitations and permissions

Owners can invite barbers or receptionists by email, choose a display name and grant appointment and schedule permissions independently. Both permissions default to disabled. The owner manually shares the displayed invitation link or code; the app does not send email or messages. Links place the secret in a URL fragment rather than a query string. Only its hash is stored. Invitations expire after seven days, can be revoked and are consumed once.

The invited person opens `/join`, supplies the invited email and code, and either chooses a password for a new staff identity or supplies the current password for an existing identity. An invitation cannot replace an existing password or promote someone to owner. Accepting a barber invitation creates a separate barber profile associated with the new membership. The owner must configure its services and hours before booking it.

The staff workspace reuses the existing booking and scheduling components. Granted barbers are restricted to their own barber profile; granted receptionists can work across barbers within the same shop. Appointment access includes the shop's booking contact list, client registration, guest/existing-client bookings, approval, cancellation under normal deadlines and attendance outcomes. Owner-only controls remain owner-only: catalog/settings, publication, receipts, full client history/recovery, outcome corrections and cancellation-deadline overrides. Schedule permission covers barber shifts, breaks, time off and dated replacements; shop-wide closures remain owner-only.

Server repositories recheck live membership, permissions, shop activation and barber scope inside transactions. Disabling permissions takes effect for existing sessions. Hidden form fields and stale session roles do not grant authority. Owners can now disable and restore a non-owner membership’s app access; staff password recovery and full offboarding remain unfinished.

Apply `20261030000400_staff_invitations` and subsequent migrations before use. Existing non-owner memberships retain disabled permissions until an owner grants them. The new paths were implemented without running tests, lint or builds, as requested.

## Shop access controls

In the owner workspace’s team section, confirm **Disable shop access** for a barber or receptionist. The change immediately excludes that shop from subsequent session authentication, blocks operations using an older authenticated principal, clears both permissions and writes an audit event in the same transaction. An operation already holding the shop lock finishes before the access change commits. Other shop memberships and global staff identity remain intact. Owner access cannot be disabled with this control.

**Restore shop access** requires confirmation and restores the membership with both permissions disabled. Grant the required permissions separately. An existing valid session can see the shop again after restoration. Duplicate requests for the same state are rejected; reload to see the current state.

These controls manage app access only. Barber profiles, schedules, service assignments, existing appointments and history remain intact, and the barber can still receive bookings. Configure time off separately when the barber is unavailable. Full staff offboarding and its handling of existing bookings are not implemented by this increment.

Apply `20261102000100_staff_access_controls` with `npm run db:deploy` before starting either app, then run `npm run db:generate`. The migration adds a nullable access-disable timestamp and a database constraint preventing disabled memberships from being owners or retaining management permissions. It does not disable any existing membership.

Regression cases were added to the staff account database suite and the team server-action unit suite for tenant boundaries, owner protection, stale sessions, permission clearing, restoration and request confirmation. They have not been executed; testing remains paused under the recorded user instruction. Prisma Client generation succeeded.

## November 9 verification

Staff invitation acceptance, live permissions and access disabling passed database checks. Chromium also verified invitation-link code initialization, receptionist sign-in and the absence of owner publication/payment controls. Historical testing-pause notes above are superseded by this pass.
