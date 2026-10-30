# In-shop receipts and basic reports

The owner daily calendar shows paid/unpaid status and allows a full in-shop receipt to be recorded. Amounts and currency come from saved appointment service snapshots, never submitted prices or the current catalog. Recording a receipt does not charge the client or change appointment attendance/status. Legacy reservations without snapshots cannot invent a receipt total.

One non-voided receipt is allowed per appointment, enforced by a PostgreSQL partial unique index. An owner can correct an erroneous receipt by voiding it with a reason; the record is retained, the appointment returns to unpaid and no refund is issued by the application. Recording and correction are atomic with their audit events. Partial payments, tips, discounts, split tenders and actual refund processing are not included in this increment.

The workspace report shows non-voided receipt totals by currency and barber for an inclusive shop-local date range. Totals use receipt recording dates, while appointment status counts use appointment start dates. These are basic operational reports, not booked-revenue estimates. Correcting a receipt changes the report for the original recording period. Integer minor-unit amounts use PostgreSQL BIGINT and exact display formatting.

Apply the `20261030000100_in_shop_payments` migration, along with subsequent migrations, before running the updated application. Schema generation alone does not install the partial unique constraint. No payment integration, paid API or online checkout is configured. No checks were run for this increment at the user's request.
