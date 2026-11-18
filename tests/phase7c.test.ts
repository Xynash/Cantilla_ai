import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import {
  PROTECTED_ROUTE_PREFIXES,
  isPublicPath,
  isProtectedPagePath,
  isRouteAuthorizedForRole,
  getAuthorizedSearchItems,
  GLOBAL_SEARCH_ITEMS,
} from "../config/navigation";
import { hasPermission } from "../lib/auth/guard";
import { UserRole } from "../types/auth";

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    throw new Error(`Test failed: ${testName}`);
  }
}

function createMockRequest(
  pathWithQuery: string,
  cookies?: Record<string, string>
): NextRequest {
  const url = `http://localhost:3000${pathWithQuery}`;
  const headers = new Headers();
  if (cookies && Object.keys(cookies).length > 0) {
    const cookieHeader = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    headers.set("cookie", cookieHeader);
  }
  return new NextRequest(url, { headers });
}

async function runTests() {
  console.log("=========================================================");
  console.log("   CANTILL.AI PHASE 7C ROUTE PROTECTION & SEARCH TESTS   ");
  console.log("=========================================================\n");

  // -------------------------------------------------------------------
  // TEST GROUP 1: Middleware Route Protection (Unauthenticated)
  // -------------------------------------------------------------------
  console.log("▶ TEST GROUP 1: Middleware Unauthenticated Route Redirects");

  const protectedTestPaths = [
    "/chat",
    "/requisitions",
    "/decisions",
    "/purchase-orders",
    "/sourcing-requests",
    "/suppliers",
    "/suppliers/S001",
    "/contracts",
    "/items",
    "/plants",
    "/policies",
    "/analytics",
    "/reports",
    "/settings",
    "/import",
    "/admin",
    "/admin/users",
  ];

  for (const path of protectedTestPaths) {
    assert(
      isProtectedPagePath(path),
      `isProtectedPagePath('${path}') identifies route as protected`
    );

    const req = createMockRequest(path);
    const res = middleware(req);
    const location = res.headers.get("location") || "";

    assert(
      res.status === 307 || res.status === 308,
      `Unauthenticated request to '${path}' returns redirect status (${res.status})`
    );
    assert(
      location.includes("/auth/signin") &&
        location.includes(`callbackUrl=${encodeURIComponent(path)}`),
      `Unauthenticated request to '${path}' redirects to /auth/signin with callbackUrl`
    );
  }

  // Verify query string preservation in callbackUrl
  const queryReq = createMockRequest("/decisions?runId=RUN-V5_0-123");
  const queryRes = middleware(queryReq);
  const queryLoc = queryRes.headers.get("location") || "";
  assert(
    queryLoc.includes(
      `callbackUrl=${encodeURIComponent("/decisions?runId=RUN-V5_0-123")}`
    ),
    "Middleware preserves query parameters in callbackUrl when redirecting"
  );

  // -------------------------------------------------------------------
  // TEST GROUP 2: Public Routes & API Pass-Through in Middleware
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 2: Public Routes, API Pass-Through & Authenticated Sessions");

  const publicPaths = [
    "/",
    "/auth/signin",
    "/_next/static/chunks/main.js",
    "/favicon.ico",
    "/icon.svg",
    "/api/health",
    "/api/auth/session",
  ];

  for (const pubPath of publicPaths) {
    assert(
      isPublicPath(pubPath),
      `isPublicPath('${pubPath}') recognizes public path`
    );
    const req = createMockRequest(pubPath);
    const res = middleware(req);
    assert(
      res.status === 200 && !res.headers.get("location"),
      `Public path '${pubPath}' is accessible without authentication`
    );
  }

  // API routes must NOT be redirected to HTML sign-in pages by middleware
  const apiPaths = [
    "/api/requisitions",
    "/api/suppliers",
    "/api/contracts",
    "/api/items",
    "/api/plants",
    "/api/policies",
    "/api/users",
    "/api/import/items",
    "/api/process-batch",
  ];

  for (const apiPath of apiPaths) {
    const req = createMockRequest(apiPath);
    const res = middleware(req);
    assert(
      res.status === 200 && !res.headers.get("location"),
      `Middleware does not convert API route '${apiPath}' into an HTML redirect`
    );
  }

  // Authenticated users with session token cookies pass through middleware on all protected routes
  for (const path of protectedTestPaths) {
    const authedReq = createMockRequest(path, {
      "authjs.session-token": "mock-valid-jwt-session-token",
    });
    const authedRes = middleware(authedReq);
    assert(
      authedRes.status === 200 && !authedRes.headers.get("location"),
      `Authenticated user with authjs.session-token can access '${path}'`
    );
  }

  const secureCookieReq = createMockRequest("/admin/users", {
    "__Secure-authjs.session-token": "mock-secure-jwt-token",
  });
  const secureCookieRes = middleware(secureCookieReq);
  assert(
    secureCookieRes.status === 200 && !secureCookieRes.headers.get("location"),
    "Authenticated user with __Secure-authjs.session-token can access '/admin/users'"
  );

  // -------------------------------------------------------------------
  // TEST GROUP 3: Role-Based Route & Permission Authorization
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 3: Role-Based Route & Permission Enforcement");

  const requesterAllowed = ["/", "/chat", "/requisitions", "/items", "/settings"];
  const requesterBlocked = [
    "/decisions",
    "/purchase-orders",
    "/sourcing-requests",
    "/suppliers",
    "/suppliers/S001",
    "/contracts",
    "/plants",
    "/policies",
    "/analytics",
    "/reports",
    "/import",
    "/admin",
    "/admin/users",
  ];

  for (const route of requesterAllowed) {
    assert(
      isRouteAuthorizedForRole(route, "REQUESTER"),
      `REQUESTER is allowed to access '${route}'`
    );
  }
  for (const route of requesterBlocked) {
    assert(
      !isRouteAuthorizedForRole(route, "REQUESTER"),
      `REQUESTER is blocked from accessing '${route}'`
    );
  }

  const buyerAllowed = [
    "/",
    "/chat",
    "/requisitions",
    "/decisions",
    "/purchase-orders",
    "/sourcing-requests",
    "/suppliers",
    "/suppliers/S001",
    "/contracts",
    "/items",
    "/plants",
    "/policies",
    "/analytics",
    "/reports",
    "/settings",
  ];
  const buyerBlocked = ["/import", "/admin", "/admin/users"];

  for (const route of buyerAllowed) {
    assert(
      isRouteAuthorizedForRole(route, "BUYER"),
      `BUYER is allowed to access '${route}'`
    );
  }
  for (const route of buyerBlocked) {
    assert(
      !isRouteAuthorizedForRole(route, "BUYER"),
      `BUYER is blocked from admin-only route '${route}'`
    );
  }

  const adminAllowed = [...buyerAllowed, ...buyerBlocked];
  for (const route of adminAllowed) {
    assert(
      isRouteAuthorizedForRole(route, "PROCUREMENT_ADMIN"),
      `PROCUREMENT_ADMIN is allowed to access '${route}'`
    );
  }

  assert(
    !isRouteAuthorizedForRole("/chat", null) &&
      !isRouteAuthorizedForRole("/", undefined),
    "Unauthenticated role (null/undefined) is denied by isRouteAuthorizedForRole"
  );

  // Verify underlying server RBAC permission alignment
  assert(
    hasPermission("REQUESTER", "chat:access") &&
      !hasPermission("REQUESTER", "buyer:workspace") &&
      !hasPermission("REQUESTER", "master_data:import") &&
      !hasPermission("REQUESTER", "user:manage"),
    "REQUESTER permissions match route access boundaries"
  );
  assert(
    hasPermission("BUYER", "buyer:workspace") &&
      !hasPermission("BUYER", "master_data:import") &&
      !hasPermission("BUYER", "user:manage"),
    "BUYER permissions match route access boundaries"
  );
  assert(
    hasPermission("PROCUREMENT_ADMIN", "buyer:workspace") &&
      hasPermission("PROCUREMENT_ADMIN", "master_data:import") &&
      hasPermission("PROCUREMENT_ADMIN", "user:manage"),
    "PROCUREMENT_ADMIN permissions match route access boundaries"
  );

  // -------------------------------------------------------------------
  // TEST GROUP 4: Role-Based Global Search Filtering
  // -------------------------------------------------------------------
  console.log("\n▶ TEST GROUP 4: Role-Based Global Search Filtering");

  // 4.1 Unauthenticated search items
  const unauthSearch = getAuthorizedSearchItems(null);
  assert(
    unauthSearch.length === 0,
    "Unauthenticated user receives 0 Global Search items"
  );

  // 4.2 REQUESTER search items
  const requesterSearch = getAuthorizedSearchItems("REQUESTER");
  const requesterHrefs = requesterSearch.map((i) => i.href);
  assert(
    requesterHrefs.length === 5,
    `REQUESTER sees exactly 5 permitted Global Search items (got ${requesterHrefs.length})`
  );
  for (const expected of ["/", "/chat", "/requisitions", "/items", "/settings"]) {
    assert(
      requesterHrefs.includes(expected),
      `REQUESTER Global Search includes '${expected}'`
    );
  }
  for (const forbidden of requesterBlocked) {
    assert(
      !requesterHrefs.includes(forbidden),
      `REQUESTER Global Search excludes unauthorized route '${forbidden}'`
    );
  }

  // 4.3 BUYER search items
  const buyerSearch = getAuthorizedSearchItems("BUYER");
  const buyerHrefs = buyerSearch.map((i) => i.href);
  assert(
    buyerHrefs.length === 14,
    `BUYER sees exactly 14 permitted Global Search items (got ${buyerHrefs.length})`
  );
  for (const expected of [
    "/",
    "/chat",
    "/requisitions",
    "/purchase-orders",
    "/sourcing-requests",
    "/decisions",
    "/suppliers",
    "/contracts",
    "/items",
    "/plants",
    "/policies",
    "/analytics",
    "/reports",
    "/settings",
  ]) {
    assert(
      buyerHrefs.includes(expected),
      `BUYER Global Search includes '${expected}'`
    );
  }
  for (const forbidden of ["/import", "/admin/users", "/admin"]) {
    assert(
      !buyerHrefs.includes(forbidden),
      `BUYER Global Search excludes admin-only route '${forbidden}'`
    );
  }

  // 4.4 PROCUREMENT_ADMIN search items
  const adminSearch = getAuthorizedSearchItems("PROCUREMENT_ADMIN");
  const adminHrefs = adminSearch.map((i) => i.href);
  assert(
    adminHrefs.length === 16,
    `PROCUREMENT_ADMIN sees all 16 Global Search items (got ${adminHrefs.length})`
  );
  for (const expected of ["/import", "/admin/users"]) {
    assert(
      adminHrefs.includes(expected),
      `PROCUREMENT_ADMIN Global Search includes admin route '${expected}'`
    );
  }

  // 4.5 Verify zero duplicate URLs and valid URL format across all roles
  const roles: UserRole[] = ["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"];
  for (const role of roles) {
    const items = getAuthorizedSearchItems(role);
    const uniqueHrefs = new Set(items.map((item) => item.href));
    assert(
      uniqueHrefs.size === items.length,
      `Global Search items for ${role} contain zero duplicate URLs`
    );
    assert(
      items.every(
        (item) =>
          item.href.startsWith("/") &&
          item.title.trim().length > 0 &&
          item.description.trim().length > 0 &&
          isRouteAuthorizedForRole(item.href, role)
      ),
      `Every Global Search item for ${role} has a valid URL authorized for ${role}`
    );
  }

  console.log("\n=========================================================");
  console.log(`   TEST RESULTS: ${passedTests}/${totalTests} PASSED   `);
  console.log("=========================================================\n");
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
