# Staff invitations and permissions

Owners can invite barbers or receptionists by email, choose a display name and grant appointment and schedule permissions independently. Both permissions default to disabled. The owner manually shares the displayed invitation link or code; the app does not send email or messages. Links place the secret in a URL fragment rather than a query string. Only its hash is stored. Invitations expire after seven days, can be revoked and are consumed once.

The invited person opens `/join`, supplies the invited email and code, and either chooses a password for a new staff identity or supplies the current password for an existing identity. An invitation cannot replace an existing password or promote someone to owner. Accepting a barber invitation creates a separate barber profile associated with the new membership. The owner must configure its services and hours before booking it.

The staff workspace reuses the existing booking and scheduling components. Granted barbers are restricted to their own barber profile; granted receptionists can work across barbers within the same shop. Appointment access includes the shop's booking contact list, client registration, guest/existing-client bookings, approval, cancellation under normal deadlines and attendance outcomes. Owner-only controls remain owner-only: catalog/settings, publication, receipts, full client history/recovery, outcome corrections and cancellation-deadline overrides. Schedule permission covers barber shifts, breaks, time off and dated replacements; shop-wide closures remain owner-only.

Server repositories recheck live membership, permissions, shop activation and barber scope inside transactions. Disabling permissions takes effect for existing sessions. Hidden form fields and stale session roles do not grant authority. Membership removal and staff password recovery are not implemented yet.

Apply `20261030000400_staff_invitations` and subsequent migrations before use. Existing non-owner memberships retain disabled permissions until an owner grants them. The new paths were implemented without running tests, lint or builds, as requested.
