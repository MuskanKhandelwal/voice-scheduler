import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Everything except the landing page and Clerk's own auth endpoints requires
// a signed-in user. Protecting the API routes here means every data query
// downstream can trust that auth() returns a real userId.
const isProtectedRoute = createRouteMatcher([
  "/plan(.*)",
  "/calendar(.*)",
  "/insights(.*)",
  "/settings(.*)",
  "/api/((?!health).*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
