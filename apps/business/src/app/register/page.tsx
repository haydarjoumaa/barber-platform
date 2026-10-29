import { AccountForm } from "../account-form";
export default function RegisterPage() { return <AccountForm mode="register" currencies={Intl.supportedValuesOf("currency")} />; }
