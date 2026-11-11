# Shop publication

Owners publish a shop's client booking page from the **Booking page publication** panel at the top of each shop in `/workspace`. Clients can only open `/{shopSlug}`, register, sign in or book while the shop is published (and not suspended or deleted).

## Requirements (agreed November 2, 2026)

Publishing is allowed only when every item is complete:

1. Shop name
2. Valid booking-link slug (format and reserved paths)
3. Shop phone number
4. Shop address
5. Valid time zone
6. Shop currency
7. At least one active (non-archived) service
8. At least one barber with active shop access, at least one assigned active service and at least one weekly working period
9. Saved booking policies

The checklist logic is `publicationGaps` in `packages/shared/src/publication.ts`. `createShopPublication` (`packages/database/src/shop-publication.ts`) rechecks it inside the owner's locked shop transaction, so a concurrent edit cannot publish an incomplete shop.

## Behavior

- Owner-only. Barbers and receptionists cannot publish or unpublish. Both actions require an explicit confirmation checkbox.
- `shop.published` and `shop.unpublished` audit events are written in the same transaction. Repeating either action is a no-op that writes no audit event and keeps the original publish time.
- A published shop that later becomes incomplete (e.g. its last service is archived) **stays published**. The panel warns the owner. Clients may see no available times until the owner fixes the gap. Nothing is unpublished automatically.
- Unpublishing hides the page and stops client sign-in and online booking. Existing appointments, client accounts and history are kept.
- Set `CLIENT_ORIGIN` (e.g. `http://localhost:3002`) in `apps/business/.env.local` to show the live booking link in the panel.

## Disabled barbers

Barbers whose shop access is disabled are excluded from the checklist and from all new-booking availability. See [walk-ins](walk-ins.md#disabled-staff).

## Tests

`tests/shop-publication.integration.ts` (part of `npm run test:database`) covers RBAC, tenant isolation, each readiness gap, idempotency, audit events and suspended shops. It passed during the November 9 verification pass. Browser checks also exercise the checklist through publication and client booking.
