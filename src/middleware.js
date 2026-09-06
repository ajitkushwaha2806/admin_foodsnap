import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define public routes here (pages & APIs) that should be accessible without authentication.
// You can add paths using string patterns or regular expressions (e.g., "/api/webhook(.*)", "/about(.*)").
const publicRoutes = [
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Add any additional public pages or APIs here:
  // "/api/public(.*)",
];

const isPublicRoute = createRouteMatcher(publicRoutes);

export default clerkMiddleware(async (auth, request) => {
  // Protect all non-public routes (both web pages and API endpoints)
  if (!isPublicRoute(request)) {
    const { userId, redirectToSignIn } = await auth();
    if (!userId) {
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      return redirectToSignIn({ returnBackUrl: request.url });
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
