# Interface and saved calendar

Both apps use a shared light theme with white surfaces, charcoal text and blue accents. Tokens and responsive styles live in `packages/ui/src/styles.css`; the shared SVG icons require no external asset service or font download. The Business App has a compact sidebar, setup checklist and booking-page status card. The Client App explains the shop-link workflow without offering a public directory.

The older, unconnected preview screen supports day, week and month views, previous/next navigation, Today and selecting a date from a week/month to open its day view. Navigation is in-memory; it does not save settings or appointments. Weeks begin on Monday. The calendar uses `Asia/Beirut` to determine today's date and shared Temporal-based calendar arithmetic for navigation, including leap years and DST dates. A month includes surrounding days to complete its weeks.

The day/week grid is a visual preview with nominal hour labels, not working hours or available slots. It starts its viewport at 08:00, with all 24 hours accessible by scrolling. It does not yet render appointment data or expand repeated/skipped DST hours for appointment placement. That rendering must use resolved UTC instants before connecting the booking API. All screens identify unavailable booking/editing functions; no fabricated business metrics or appointments are displayed.

English/Arabic switching, RTL mirroring, keyboard focus, mobile navigation and the offline notice remain supported. The calendar scroll region is keyboard-focusable. Month date buttons have full localized date labels; view buttons expose their selected state. Reduced-motion preferences are respected.

Verification: unit tests cover week/year boundaries, leap days, six-week months, month-end navigation and Beirut DST dates. Production browser checks cover both languages at 375px, 768px and 1440px, navigation, date/view controls, language persistence, FAQs, offline states and horizontal page overflow. Browser checks use a temporary local Playwright setup, not a new repository dependency.


## Authenticated workspace calendar

The active Business App root opens the authenticated owner workspace. Its saved appointment panel now offers Day, Week and Month views using persisted records. Date/view navigation lives in the URL and survives reloads. Week/month date cards open the daily list, where owners can confirm, cancel or record an outcome. This is separate from the older preview described above.

The shared calendar range helper resolves every date in the shop timezone; appointment times display an explicit UTC offset. Weeks begin Monday and month grids include surrounding dates. Records appear on every date overlapped by their occupied interval, including buffers. Cancelled records remain visible as history. Desktop displays seven date columns; tablet/mobile layouts reduce columns to keep names and times readable. Links expose focus indicators and the selected view uses `aria-current`. Both languages use the same persisted data and logical layout properties.

Verification for this increment covers local date/range unit tests, real PostgreSQL range/tenant/RBAC tests, type checking and builds. Earlier browser verification above applies to the older screens; these new saved calendar views have not yet been browser-verified.
