import { randomBytes } from "node:crypto";
import type { StaffPrincipal } from "@barber/auth";
import type { Prisma, PrismaClient } from "./generated/prisma/client";
import { withShopOwner } from "./owner-transaction";
import { clientIdentity, clientTokenHash, validClientToken, throttleClient, withPublishedShop } from "./client-access";

interface Passwords { hashPassword(value: string): Promise<string>; verifyAccountPassword(value: string, encoded: string | null): Promise<boolean>; }
const validPhone = (phone: string) => /^\+[1-9]\d{7,14}$/.test(phone);
function passwordInput(value: string) { if (typeof value !== "string" || [...value].length < 12 || Buffer.byteLength(value, "utf8") > 1024) throw new Error("Invalid password"); }
function profileInput(input: { name: string; email: string; birthday: string }) {
  const name = input.name.trim(), email = input.email.trim();
  if (!name || name.length > 100 || (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) throw new Error("Invalid profile");
  let birthday: Date | null = null;
  if (input.birthday) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthday)) throw new Error("Invalid birthday");
    birthday = new Date(`${input.birthday}T00:00:00Z`);
    if (!Number.isFinite(birthday.getTime()) || birthday.toISOString().slice(0, 10) !== input.birthday || birthday > new Date()) throw new Error("Invalid birthday");
  }
  return { name, email: email || null, birthday };
}
async function session(tx: Prisma.TransactionClient, shopId: string, clientId: string, previousToken?: string) {
  if (validClientToken(previousToken)) await tx.clientSession.deleteMany({ where: { barbershopId: shopId, tokenHash: clientTokenHash(previousToken) } });
  const token = randomBytes(32).toString("hex"), expiresAt = new Date(Date.now() + 8 * 60 * 60_000);
  await tx.clientSession.create({ data: { tokenHash: clientTokenHash(token), barbershopId: shopId, clientId, expiresAt } });
  return { token, expiresAt, shopId };
}

export function createClientAccounts(db: PrismaClient, passwords: Passwords) {
  async function shopFor(slug: string) {
    const shop = await db.barbershop.findFirst({ where: { slug, publishedAt: { not: null }, deletedAt: null, suspendedAt: null }, select: { id: true } });
    if (!shop) throw new Error("Shop unavailable");
    return shop;
  }
  return {
    async register(slug: string, input: { name: string; phone: string; email: string; birthday: string; password: string }, previousToken?: string) {
      const shop = await shopFor(slug);
      await throttleClient(db, shop.id, "register", input.phone.trim());
      const profile = profileInput(input), phone = input.phone.trim();
      if (!validPhone(phone)) throw new Error("Invalid phone");
      passwordInput(input.password);
      const passwordHash = await passwords.hashPassword(input.password);
      return withPublishedShop(db, slug, async (tx, lockedShop) => {
        if (lockedShop.id !== shop.id) throw new Error("Shop changed");
        // Never claim a staff-created profile merely by knowing its phone number.
        const client = await tx.client.create({ data: { barbershopId: shop.id, phone, ...profile } });
        await tx.clientAccount.create({ data: { barbershopId: shop.id, clientId: client.id, passwordHash } });
        await tx.clientEvent.create({ data: { barbershopId: shop.id, clientId: client.id, event: "account.registered", details: {} } });
        return session(tx, shop.id, client.id, previousToken);
      });
    },
    async login(slug: string, phoneInput: string, password: string, previousToken?: string) {
      const shop = await shopFor(slug), phone = phoneInput.trim();
      await throttleClient(db, shop.id, "login", phone);
      const client = validPhone(phone) ? await db.client.findUnique({ where: { barbershopId_phone: { barbershopId: shop.id, phone } }, select: { id: true, account: { select: { passwordHash: true } } } }) : null;
      const hash = client?.account?.passwordHash ?? null;
      const verified = await passwords.verifyAccountPassword(password, hash);
      if (!client || !hash || !verified) {
        await db.clientEvent.create({ data: { barbershopId: shop.id, event: "login.failed", details: {} } });
        throw new Error("Invalid credentials");
      }
      return withPublishedShop(db, slug, async (tx, lockedShop) => {
        if (lockedShop.id !== shop.id) throw new Error("Shop changed");
        const account = await tx.clientAccount.findUnique({ where: { barbershopId_clientId: { barbershopId: shop.id, clientId: client.id } } });
        if (account?.passwordHash !== hash) throw new Error("Invalid credentials");
        await tx.clientEvent.create({ data: { barbershopId: shop.id, clientId: client.id, event: "login.succeeded", details: {} } });
        return session(tx, shop.id, client.id, previousToken);
      });
    },
    authenticate(slug: string, token: string | undefined) { return withPublishedShop(db, slug, (tx, shop) => clientIdentity(tx, shop.id, token)); },
    async logout(shopId: string, token: string | undefined) {
      if (validClientToken(token)) await db.clientSession.deleteMany({ where: { barbershopId: shopId, tokenHash: clientTokenHash(token) } });
    },
    updateProfile(slug: string, token: string | undefined, input: { name: string; email: string; birthday: string }) {
      return withPublishedShop(db, slug, async (tx, shop) => {
        const client = await clientIdentity(tx, shop.id, token);
        if (!client) throw new Error("Sign in required");
        const data = profileInput(input);
        await tx.client.update({ where: { barbershopId_id: { barbershopId: shop.id, id: client.id } }, data });
        await tx.clientEvent.create({ data: { barbershopId: shop.id, clientId: client.id, event: "profile.updated", details: { fields: ["name", "email", "birthday"] } } });
      });
    },
    issueReset(principal: StaffPrincipal | null, shopId: string, clientId: string, identityVerified: boolean) {
      return withShopOwner(db, principal, shopId, async (tx, _shop, actorUserId) => {
        if (identityVerified !== true || !/^[0-9a-f-]{36}$/i.test(clientId)) throw new Error("Verify identity first");
        if (!await tx.client.findUnique({ where: { barbershopId_id: { barbershopId: shopId, id: clientId } } })) throw new Error("Client not found");
        const code = randomBytes(32).toString("hex"), expiresAt = new Date(Date.now() + 15 * 60_000);
        await tx.clientResetToken.deleteMany({ where: { barbershopId: shopId, clientId } });
        await tx.clientResetToken.create({ data: { tokenHash: clientTokenHash(code), barbershopId: shopId, clientId, expiresAt } });
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "client.reset_issued", details: { clientId, expiresAt: expiresAt.toISOString(), identityVerified: true } } });
        return { code, expiresAt: expiresAt.toISOString() };
      });
    },
    async reset(slug: string, input: { phone: string; code: string; password: string }) {
      const shop = await shopFor(slug), phone = input.phone.trim();
      await throttleClient(db, shop.id, "reset", phone);
      if (!validPhone(phone) || !validClientToken(input.code)) throw new Error("Invalid recovery code");
      passwordInput(input.password);
      const passwordHash = await passwords.hashPassword(input.password);
      return withPublishedShop(db, slug, async (tx, lockedShop) => {
        if (lockedShop.id !== shop.id) throw new Error("Shop changed");
        const ticket = await tx.clientResetToken.findFirst({ where: { tokenHash: clientTokenHash(input.code), barbershopId: shop.id, expiresAt: { gt: new Date() }, client: { phone } } });
        if (!ticket) throw new Error("Invalid recovery code");
        await tx.clientAccount.upsert({ where: { barbershopId_clientId: { barbershopId: shop.id, clientId: ticket.clientId } }, create: { barbershopId: shop.id, clientId: ticket.clientId, passwordHash }, update: { passwordHash } });
        await tx.clientSession.deleteMany({ where: { barbershopId: shop.id, clientId: ticket.clientId } });
        await tx.clientResetToken.delete({ where: { tokenHash: ticket.tokenHash } });
        await tx.clientEvent.create({ data: { barbershopId: shop.id, clientId: ticket.clientId, event: "password.reset", details: {} } });
      });
    },
  };
}
