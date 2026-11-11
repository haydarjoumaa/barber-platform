import { notFound } from "next/navigation";
import { getDatabase } from "@barber/database";
import { isValidShopSlug } from "@barber/shared";
import { AccountForm } from "../../account-form";

export default async function ShopLogin({ params }: { params: Promise<{ shopSlug: string }> }) {
  const { shopSlug } = await params;
  if (!isValidShopSlug(shopSlug)) notFound();
  const shop = await getDatabase().barbershop.findFirst({ where: { slug: shopSlug, deletedAt: null, suspendedAt: null }, select: { name: true } });
  if (!shop) notFound();
  return <AccountForm mode="login" shopSlug={shopSlug} shopName={shop.name} />;
}
