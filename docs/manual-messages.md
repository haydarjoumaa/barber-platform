# Manual appointment messages

In the authenticated owner workspace, open a day in the appointments calendar and select **Review WhatsApp message**. Review the saved recipient phone displayed on the appointment and choose the English or Arabic preview. **Open WhatsApp in a new tab** opens a draft; the owner must send it in WhatsApp.

Messages include the shop, client/guest, barber, shop-local date/time with UTC offset and timezone, actual appointment status, saved service names and saved total. Pending appointments are described as pending. Legacy records without service snapshots show the existing missing-history notice instead of an invented price. Guests without an international phone cannot use this action.

The feature uses [WhatsApp click-to-chat links](https://faq.whatsapp.com/5913398998672934/). It has no API credentials, automation, paid messaging integration or delivery tracking. Opening a link does not change the appointment or record it as sent. Refresh the calendar before preparing a message if another staff session has changed the booking.

Appointment data comes from the existing owner-authorized, tenant-scoped calendar query. No new public endpoint or schema migration is required. No request to WhatsApp is made by server code; the external link opens only when selected and suppresses referrer information.

Run `npm test -- packages/shared/src/appointment-message.test.ts` for recipient validation, multilingual URL encoding, snapshot totals, statuses and Beirut DST coverage. For a manual check, create an existing-client or guest booking with a phone, inspect both previews, then inspect a guest booking without a phone. Verify Arabic direction and keyboard access to the disclosure/link. Actual delivery requires the owner to use WhatsApp and is not part of automated testing.
