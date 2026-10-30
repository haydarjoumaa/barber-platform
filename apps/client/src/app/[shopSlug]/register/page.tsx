import { ClientAccountForm } from "../../client-account-form";
export default async function RegisterPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  return <section className="setup-panel"><ClientAccountForm slug={(await params).shopSlug} mode="register" /></section>;
}
