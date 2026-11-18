import { NextRequest } from "next/server";
import { connectToDatabase, getDatabaseConnectionState } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { APP_CONFIG } from "@/config/constants";

// Force Node.js runtime for database operations
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const isDbRequested = request.nextUrl.searchParams.get("checkDb") === "true";
    let dbStatus = getDatabaseConnectionState();

    if (isDbRequested && !dbStatus.isConnected) {
      try {
        await connectToDatabase();
        dbStatus = getDatabaseConnectionState();
      } catch (dbErr) {
        return apiSuccess({
          status: "degraded",
          service: APP_CONFIG.name,
          version: APP_CONFIG.version,
          database: {
            status: "unavailable",
            message: "MongoDB connection could not be established. Verify MONGODB_URI in .env.local",
          },
          timestamp: new Date().toISOString(),
        });
      }
    }

    return apiSuccess({
      status: "healthy",
      service: APP_CONFIG.name,
      version: APP_CONFIG.version,
      database: {
        status: dbStatus.state,
        connected: dbStatus.isConnected,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Health check failed",
      500,
      "HEALTH_CHECK_FAILED"
    );
  }
}
