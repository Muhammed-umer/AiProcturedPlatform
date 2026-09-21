import { LoginForm } from "./login-form";
import { DevCredentials } from "./dev-credentials";

// The development credential hint reads the accounts table on each request.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm devPanel={<DevCredentials />} />;
}
