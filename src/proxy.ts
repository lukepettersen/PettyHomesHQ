import { withAuth } from "next-auth/middleware";

// Every page needs a signed-in team member, except sign-in itself, the auth callbacks and the
// health check Railway uses.
export default withAuth({ pages: { signIn: "/login" } });

export const config = {
  matcher: ["/((?!login|api/auth|api/health|_next/static|_next/image|favicon.ico|logo-mark.svg|icon|apple-icon|manifest.webmanifest).*)"],
};
