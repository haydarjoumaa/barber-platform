# Local logos and client photos

Owners can upload a shop logo from the workspace and profile/haircut photos from a client profile. Signed-in clients can upload or remove their own profile/haircut photos from their account. Each upload requires an explicit consent acknowledgment; owner uploads record the acting owner and confirmation of client consent. Consent timestamps and upload/removal events are retained. Barber and receptionist photo access is not granted by appointment permissions.

Only the logo of an active, published shop is public. Client images require a live owner session for that shop or the matching shop-specific client session. Image endpoints return private, no-store responses and bypass public image optimization. Client photos are not storefront or marketing images. Removing a photo withdraws access immediately through its database record; the application then attempts physical deletion. Replacement retires the previous logo or profile photo. Haircut photos form a paginated gallery.

Uploads accept static JPEG, PNG or WebP up to 8 MiB and 20 million decoded pixels. The server checks decoded format against the declared type, rejects animation, applies orientation, resizes inside 1600 × 1600 and re-encodes as JPEG. Input metadata, including EXIF/GPS, is discarded; transparency becomes white. At most two conversions run simultaneously per application process. Authenticated upload attempts are rate limited. Original filenames are never storage paths.

## Storage and migration

Apply `20261030000600_local_media` along with all preceding migrations before using these screens. It adds tenant-scoped media records, consent metadata and partial unique constraints for active logos/profile photos. Prisma client generation has been run; this migration has not been applied here.

The shared `@barber/storage` package exposes an object-storage interface with a local filesystem implementation. By default both app workspace directories resolve to the repository's ignored `.local/uploads` directory. For any different working-directory or deployment arrangement, configure the same absolute `BARBER_UPLOAD_ROOT` for both apps and operator scripts. Keep uploads outside public directories, protect the directory and grant access only to the application/operator account. Separate deployments will need shared storage or a future adapter.

The operator command `npm run media:cleanup` retries deletion of withdrawn files and removes unreferenced generated image files older than 24 hours. Active referenced files are preserved. The delay protects normal in-flight uploads; failed uploads can leave private orphan files until cleanup. Run against the matching database and upload root. No cleanup command or scheduler has been executed or installed here.

## Backups and current limitations

Database backup scripts do not include image files. Stop app writes while taking a database dump and a protected copy of the matching upload directory, then retain and restore them as a pair. Existing backups may contain withdrawn photos; account for those copies in retention/deletion procedures. Browser downloads made before withdrawal cannot be revoked.

These changes have not been tested, linted, typechecked, built or checked in a browser, following the user's instruction to stop testing. Public shop photo galleries and advanced storage providers remain future work. Shop publication itself still awaits the agreed publication requirements and workflow.
