import { withAuth } from "next-auth/middleware";
import { signInStillGood } from "@/lib/session";

// Every page needs a signed-in team member, except sign-in itself, the auth callbacks, the
// health check Railway uses, Twilio's webhooks (which prove themselves with Twilio's signature) and the
// unsubscribe link and open-tracking image in mass emails.
export default withAuth({ pages: { signIn: "/login" }, callbacks: { authorized: ({ token }) => signInStillGood(token) } });

export const config = {
  matcher: ["/((?!login|api/auth|api/health|api/twilio|api/unsubscribe|api/e/|api/img/|unsubscribe|_next/static|_next/image|favicon.ico|logo-mark.svg|icon|apple-icon|manifest.webmanifest).*)"],
};
