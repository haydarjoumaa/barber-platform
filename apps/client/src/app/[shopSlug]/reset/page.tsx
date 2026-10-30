import { ClientAccountForm } from "../../client-account-form";
export default async function ResetPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  return <section className="setup-panel"><ClientAccountForm slug={(await params).shopSlug} mode="reset" /></section>;
}
