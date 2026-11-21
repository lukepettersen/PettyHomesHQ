import { withAuth } from "next-auth/middleware";
import { signInStillGood } from "@/lib/session";

// Every page needs a signed-in team member, except sign-in itself, the auth callbacks, the
// health check Railway uses, Twilio's webhooks (which prove themselves with Twilio's signature) and the
// unsubscribe link and open-tracking image in mass emails, the scheduled-texts timer (checks its own secret key) and the website lead form (checks its link's secret key), and event signup pages (/join/<long random link>), and the Claude app connector (its
// own sign-in: access tokens, and the Allow page checks the HQ sign-in itself).
export default withAuth({ pages: { signIn: "/login" }, callbacks: { authorized: ({ token }) => signInStillGood(token) } });

export const config = {
  matcher: ["/((?!login|api/auth|api/health|api/twilio|api/cron/|api/leads|api/unsubscribe|api/e/|api/img/|api/mcp|\\.well-known/|unsubscribe|join/|_next/static|_next/image|favicon.ico|logo-mark.svg|icon|apple-icon|manifest.webmanifest).*)"],
};
