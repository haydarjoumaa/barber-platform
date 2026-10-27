# Interface and calendar preview

Both apps use a shared light theme with white surfaces, charcoal text and blue accents. Tokens and responsive styles live in `packages/ui/src/styles.css`; the shared SVG icons require no external asset service or font download. The Business App has a compact sidebar, setup checklist and booking-page status card. The Client App explains the shop-link workflow without offering a public directory.

The appointment screen now supports day, week and month views, previous/next navigation, Today and selecting a date from a week/month to open its day view. Navigation is in-memory; it does not save settings or appointments. Weeks begin on Monday. The calendar uses `Asia/Beirut` to determine today's date and shared Temporal-based calendar arithmetic for navigation, including leap years and DST dates. A month includes surrounding days to complete its weeks.

The day/week grid is a visual preview with nominal hour labels, not working hours or available slots. It starts its viewport at 08:00, with all 24 hours accessible by scrolling. It does not yet render appointment data or expand repeated/skipped DST hours for appointment placement. That rendering must use resolved UTC instants before connecting the booking API. All screens identify unavailable booking/editing functions; no fabricated business metrics or appointments are displayed.

English/Arabic switching, RTL mirroring, keyboard focus, mobile navigation and the offline notice remain supported. The calendar scroll region is keyboard-focusable. Month date buttons have full localized date labels; view buttons expose their selected state. Reduced-motion preferences are respected.

Verification: unit tests cover week/year boundaries, leap days, six-week months, month-end navigation and Beirut DST dates. Production browser checks cover both languages at 375px, 768px and 1440px, navigation, date/view controls, language persistence, FAQs, offline states and horizontal page overflow. Browser checks use a temporary local Playwright setup, not a new repository dependency.
