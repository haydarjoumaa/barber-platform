# Proposed public routing

Status: proposal only. This increment runs independent apps at localhost:3001 and localhost:3002. Tenant storefront and account routes are now implemented in the Client App, behind publication/activation checks. Public business/admin gateway prefixes are not wired yet.

Use one reverse proxy/gateway in front of two independently deployable Next.js apps:

| Public path | Destination | Purpose |
| --- | --- | --- |
| `/business` and `/business/*` | Business App | Staff workspace |
| `/admin` and `/admin/*` | Business App | Platform administration |
| `/api/v1/*` | Business App | Shared backend, including client authentication and bookings |
| `/{shopSlug}` and descendants | Client App | Shop-specific storefront and account |
| `/` | Client App | Direct visitors to their shop's link; no shop directory |

Use explicit App Router directories for business and admin instead of a global `/business` basePath, because the Business App owns both prefixes. Route groups can share staff layouts without changing URLs. Keep business Next.js assets under a dedicated asset prefix (proposed `/business-assets/_next`) and client assets under `/_next`; the gateway strips only the asset prefix before forwarding to the business server. `business-assets` is already reserved in the shared validator. Public files should live in app-specific namespaces. Verify asset loading, HMR WebSockets, image optimization, redirects and Server Action requests through the gateway before adopting it. Avoid relying on relative cross-app links during the separate-port phase.

The proposed centralized shared HTTP API would live in the Business App. Current client Server Actions call the same shared server-only repositories as the Business App and use the shared database; this proposal is not yet deployed. Both apps use contracts and domain code from shared packages; the Client App must not implement an independent booking engine. In the gateway phase, browser requests use same-origin `/api/v1` routes. Server-side calls use an internal API origin and explicitly forward the authenticated session. Do not forward arbitrary headers or trust a tenant ID from the browser.

Resolve a storefront slug to an active, published shop on the server, then authorize the caller for that shop. Keep shop identity stable when slugs change. Slug updates, redirects, the publication checklist and the exact gateway technology need decisions in the onboarding/routing increment. Unknown, suspended, unpublished and deleted shops must not expose tenant information.

Authentication still needs separate staff and client session policies. Client sessions must bind account identity to a specific shop. Cookie scope, CSRF defenses and gateway origin handling require integration tests; URL routing itself does not enforce authorization. Platform support access must be read-only and audited when implemented.
