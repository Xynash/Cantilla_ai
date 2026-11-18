import mongoose from "mongoose";

/**
 * Global cache interface for Mongoose in Next.js development environment.
 * Prevents multiple connections during HMR (Hot Module Replacement).
 */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  lastFailedAt?: number;
  lastError?: Error;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache || { conn: null, promise: null };

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

const OFFLINE_BACKOFF_MS = 10000;

/**
 * Connects to MongoDB Atlas using Mongoose with connection pooling and caching.
 */
export async function connectToDatabase(): Promise<typeof mongoose> {
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error(
      "Please define the MONGODB_URI environment variable inside .env.local"
    );
  }

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // Fast-fail during backoff window if local MongoDB recently refused connection
  if (
    cached.lastFailedAt &&
    Date.now() - cached.lastFailedAt < OFFLINE_BACKOFF_MS &&
    cached.lastError
  ) {
    throw cached.lastError;
  }

  if (!cached.promise) {
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 2000,
      socketTimeoutMS: 45000,
    };

    cached.promise = mongoose
      .connect(MONGODB_URI, opts)
      .then((mongooseInstance) => {
        cached.lastFailedAt = undefined;
        cached.lastError = undefined;
        if (process.env.NODE_ENV === "development") {
          console.log("✅ Successfully connected to MongoDB Atlas");
        }
        return mongooseInstance;
      })
      .catch((error) => {
        cached.promise = null;
        cached.lastFailedAt = Date.now();
        cached.lastError = error instanceof Error ? error : new Error(String(error));
        throw error;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

/**
 * Returns connection state helper
 */
export function getDatabaseConnectionState(): {
  isConnected: boolean;
  state: string;
} {
  const stateCode = mongoose.connection.readyState;
  const states: Record<number, string> = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  return {
    isConnected: stateCode === 1,
    state: states[stateCode] || "unknown",
  };
}

export default connectToDatabase;
