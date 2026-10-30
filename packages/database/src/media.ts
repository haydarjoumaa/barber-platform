import type { StaffPrincipal } from "@barber/auth";
import { createLocalObjectStorage, storeImage, type ImageUpload, type ObjectStorage, type StoredImage } from "@barber/storage";
import type { MediaKind, Prisma, PrismaClient } from "./generated/prisma/client";
import { clientIdentity, throttleClient, withPublishedShop } from "./client-access";
import { withShopOwner } from "./owner-transaction";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 12;
function subject(clientId: string | null, kind: MediaKind, consent: boolean) {
  if (consent !== true || !["SHOP_LOGO", "PROFILE", "HAIRCUT"].includes(kind) ||
    (kind === "SHOP_LOGO" ? clientId !== null : !clientId || !uuid.test(clientId))) throw new Error("Invalid image consent or subject");
}
async function existingClient(tx: Prisma.TransactionClient, shopId: string, clientId: string | null) {
  if (clientId && !await tx.client.findUnique({ where: { barbershopId_id: { barbershopId: shopId, id: clientId } }, select: { id: true } })) throw new Error("Client unavailable");
}
async function list(tx: Prisma.TransactionClient, shopId: string, clientId: string | null, requestedPage: number) {
  const where = { barbershopId: shopId, clientId, removedAt: null };
  const total = await tx.mediaAsset.count({ where }), pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, pages);
  const rows = await tx.mediaAsset.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
    select: { id: true, kind: true, width: true, height: true, createdAt: true, consentAt: true } });
  return { page, pages, total, assets: rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), consentAt: row.consentAt.toISOString() })) };
}

/** Metadata authorizes access; the object store has no public paths. */
export function createMediaRepository(db: PrismaClient, storage: ObjectStorage = createLocalObjectStorage()) {
  async function persist(tx: Prisma.TransactionClient, shopId: string, clientId: string | null, kind: MediaKind, image: StoredImage, actorUserId: string | null) {
    const retired = kind === "HAIRCUT" ? [] : await tx.mediaAsset.findMany({ where: { barbershopId: shopId, clientId, kind, removedAt: null }, select: { id: true, storageKey: true } });
    if (retired.length) await tx.mediaAsset.updateMany({ where: { barbershopId: shopId, id: { in: retired.map(row => row.id) }, removedAt: null }, data: { removedAt: new Date() } });
    const asset = await tx.mediaAsset.create({ data: { barbershopId: shopId, clientId, kind, ...image, uploadedByUserId: actorUserId, consentAt: new Date(), consentSource: actorUserId ? "OWNER" : "CLIENT" } });
    const details = { assetId: asset.id, clientId, kind, consentRecorded: true, replacedAssetIds: retired.map(row => row.id) };
    if (actorUserId) await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "media.uploaded", details } });
    else await tx.clientEvent.create({ data: { barbershopId: shopId, clientId, event: "media.uploaded", details } });
    return { id: asset.id, retired };
  }
  async function purge(retired: { id: string; storageKey: string }[]) {
    for (const row of retired) {
      try {
        await storage.remove(row.storageKey);
        await db.mediaAsset.updateMany({ where: { id: row.id, removedAt: { not: null }, purgedAt: null }, data: { purgedAt: new Date() } });
      } catch { /* Removed metadata immediately denies access. The cleanup command retries physical deletion. */ }
    }
  }
  async function remove(tx: Prisma.TransactionClient, shopId: string, clientId: string | null, id: string, actorUserId: string | null) {
    if (!uuid.test(id)) throw new Error("Invalid photo");
    const asset = await tx.mediaAsset.findFirst({ where: { id, barbershopId: shopId, clientId, removedAt: null }, select: { id: true, storageKey: true, kind: true } });
    if (!asset) throw new Error("Photo unavailable");
    await tx.mediaAsset.update({ where: { barbershopId_id: { barbershopId: shopId, id } }, data: { removedAt: new Date() } });
    const details = { assetId: id, clientId, kind: asset.kind, consentWithdrawn: asset.kind !== "SHOP_LOGO" };
    if (actorUserId) await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "media.removed", details } });
    else await tx.clientEvent.create({ data: { barbershopId: shopId, clientId, event: "media.removed", details } });
    return asset;
  }
  async function read(tx: Prisma.TransactionClient, shopId: string, id: string, clientId?: string) {
    if (!uuid.test(id)) throw new Error("Invalid photo");
    const asset = await tx.mediaAsset.findFirst({ where: { id, barbershopId: shopId, removedAt: null, ...(clientId ? { clientId } : {}) }, select: { storageKey: true } });
    if (!asset) throw new Error("Photo unavailable");
    return storage.read(asset.storageKey);
  }
  return {
    ownerList(principal: StaffPrincipal | null, shopId: string, clientId: string | null, page = 1) {
      return withShopOwner(db, principal, shopId, async tx => { await existingClient(tx, shopId, clientId); return list(tx, shopId, clientId, page); });
    },
    async ownerUpload(principal: StaffPrincipal | null, shopId: string, clientId: string | null, kind: MediaKind, upload: ImageUpload, consent: boolean) {
      subject(clientId, kind, consent);
      await withShopOwner(db, principal, shopId, tx => existingClient(tx, shopId, clientId));
      await throttleClient(db, shopId, "media", `owner:${principal!.userId}`, 20);
      const image = await storeImage(storage, upload);
      // A failed/ambiguous DB commit leaves a private unreferenced object for delayed cleanup.
      const result = await withShopOwner(db, principal, shopId, async (tx, _shop, actor) => { await existingClient(tx, shopId, clientId); return persist(tx, shopId, clientId, kind, image, actor); });
      await purge(result.retired);
      return { id: result.id };
    },
    async ownerRemove(principal: StaffPrincipal | null, shopId: string, clientId: string | null, id: string) {
      const retired = await withShopOwner(db, principal, shopId, (tx, _shop, actor) => remove(tx, shopId, clientId, id, actor));
      await purge([retired]);
    },
    ownerRead(principal: StaffPrincipal | null, shopId: string, id: string) { return withShopOwner(db, principal, shopId, tx => read(tx, shopId, id)); },
    clientList(slug: string, token: string | undefined, page = 1) {
      return withPublishedShop(db, slug, async (tx, shop) => {
        const client = await clientIdentity(tx, shop.id, token);
        if (!client) throw new Error("Sign in required");
        return list(tx, shop.id, client.id, page);
      });
    },
    async clientUpload(slug: string, token: string | undefined, kind: "PROFILE" | "HAIRCUT", upload: ImageUpload, consent: boolean) {
      const identity = await withPublishedShop(db, slug, async (tx, shop) => {
        const client = await clientIdentity(tx, shop.id, token);
        if (!client) throw new Error("Sign in required");
        subject(client.id, kind, consent);
        return { shopId: shop.id, clientId: client.id };
      });
      await throttleClient(db, identity.shopId, "media", `client:${identity.clientId}`, 20);
      const image = await storeImage(storage, upload);
      const result = await withPublishedShop(db, slug, async (tx, shop) => {
        const client = await clientIdentity(tx, shop.id, token);
        if (shop.id !== identity.shopId || client?.id !== identity.clientId) throw new Error("Sign in required");
        return persist(tx, shop.id, client.id, kind, image, null);
      });
      await purge(result.retired);
      return { id: result.id };
    },
    async clientRemove(slug: string, token: string | undefined, id: string) {
      const retired = await withPublishedShop(db, slug, async (tx, shop) => {
        const client = await clientIdentity(tx, shop.id, token);
        if (!client) throw new Error("Sign in required");
        return remove(tx, shop.id, client.id, id, null);
      });
      await purge([retired]);
    },
    clientRead(slug: string, token: string | undefined, id: string) {
      return withPublishedShop(db, slug, async (tx, shop) => {
        const client = await clientIdentity(tx, shop.id, token);
        if (!client) throw new Error("Sign in required");
        return read(tx, shop.id, id, client.id);
      });
    },
    publicLogo(slug: string) {
      return withPublishedShop(db, slug, async (tx, shop) => {
        const logo = await tx.mediaAsset.findFirst({ where: { barbershopId: shop.id, clientId: null, kind: "SHOP_LOGO", removedAt: null }, select: { storageKey: true } });
        if (!logo) throw new Error("Logo unavailable");
        return storage.read(logo.storageKey);
      });
    },
  };
}
