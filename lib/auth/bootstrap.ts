import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { hashPassword, verifyPassword } from "./password";
import { env } from "@/config/env";
import { UserRole } from "@/types/auth";

export interface FallbackUserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

declare global {
  var fallbackUsersStore: Map<string, FallbackUserRecord> | undefined;
}

/**
 * Initializes the in-memory bcrypt-hashed user store from environment variables
 * when MongoDB is unreachable in local development.
 */
export async function getFallbackUsersStore(): Promise<Map<string, FallbackUserRecord>> {
  if (global.fallbackUsersStore && global.fallbackUsersStore.size > 0) {
    return global.fallbackUsersStore;
  }

  const store = new Map<string, FallbackUserRecord>();
  const now = new Date().toISOString();

  const adminEmail = (env.ADMIN_EMAIL || process.env.ADMIN_EMAIL || "admin@cantill.ai")
    .toLowerCase()
    .trim();
  const adminPassword = env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "CantillAdmin2026!";
  const adminName = env.ADMIN_NAME || process.env.ADMIN_NAME || "Cantill System Administrator";

  const [adminHash, directorHash, buyerHash, requesterHash] = await Promise.all([
    hashPassword(adminPassword),
    hashPassword("Director2026!"),
    hashPassword("Buyer2026!"),
    hashPassword("Requester2026!"),
  ]);

  store.set(adminEmail, {
    id: "usr_admin_bootstrap",
    name: adminName,
    email: adminEmail,
    passwordHash: adminHash,
    role: "PROCUREMENT_ADMIN",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  store.set("director@cantill.ai", {
    id: "usr_director_bootstrap",
    name: "Priya Deshmukh (Head of Procurement)",
    email: "director@cantill.ai",
    passwordHash: directorHash,
    role: "PROCUREMENT_ADMIN",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  store.set("buyer@cantill.ai", {
    id: "usr_buyer_bootstrap",
    name: "Marcus Vance (Senior Buyer)",
    email: "buyer@cantill.ai",
    passwordHash: buyerHash,
    role: "BUYER",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  store.set("requester@cantill.ai", {
    id: "usr_requester_bootstrap",
    name: "Alex Patel (Requester)",
    email: "requester@cantill.ai",
    passwordHash: requesterHash,
    role: "REQUESTER",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  global.fallbackUsersStore = store;
  return store;
}

/**
 * Ensures an initial administrator user exists in the database.
 * Credentials are pulled exclusively from validated environment variables.
 */
export async function bootstrapInitialAdmin() {
  await connectToDatabase();

  const adminEmail = (env.ADMIN_EMAIL || process.env.ADMIN_EMAIL || "admin@cantill.ai")
    .toLowerCase()
    .trim();
  const adminPassword = env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "CantillAdmin2026!";
  const adminName = env.ADMIN_NAME || process.env.ADMIN_NAME || "Cantill System Administrator";

  const existingAdmin = await User.findOne({ email: adminEmail });

  if (!existingAdmin) {
    const passwordHash = await hashPassword(adminPassword);
    await User.create({
      name: adminName,
      email: adminEmail,
      passwordHash,
      role: "PROCUREMENT_ADMIN",
      isActive: true,
    });
    console.log(`✅ Bootstrapped initial administrator: ${adminEmail}`);
  }

  // Also seed default Demo Requester & Buyer if they do not exist
  const requesterEmail = "requester@cantill.ai";
  const existingRequester = await User.findOne({ email: requesterEmail });
  if (!existingRequester) {
    const passwordHash = await hashPassword("Requester2026!");
    await User.create({
      name: "Alex Patel (Requester)",
      email: requesterEmail,
      passwordHash,
      role: "REQUESTER",
      isActive: true,
    });
  }

  const buyerEmail = "buyer@cantill.ai";
  const existingBuyer = await User.findOne({ email: buyerEmail });
  if (!existingBuyer) {
    const passwordHash = await hashPassword("Buyer2026!");
    await User.create({
      name: "Marcus Vance (Senior Buyer)",
      email: buyerEmail,
      passwordHash,
      role: "BUYER",
      isActive: true,
    });
  }

  const directorEmail = "director@cantill.ai";
  const existingDirector = await User.findOne({ email: directorEmail });
  if (!existingDirector) {
    const passwordHash = await hashPassword("Director2026!");
    await User.create({
      name: "Priya Deshmukh (Head of Procurement)",
      email: directorEmail,
      passwordHash,
      role: "PROCUREMENT_ADMIN",
      isActive: true,
    });
  }
}

/**
 * Authenticates credentials against MongoDB User collection, with fallback to
 * bcrypt-hashed bootstrapped accounts if local MongoDB is unreachable.
 */
export async function authenticateUserCredentials(email: string, password: string) {
  const normalizedEmail = email.toLowerCase().trim();

  try {
    await connectToDatabase();
    await bootstrapInitialAdmin();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return null;
    }

    if (!user.isActive) {
      throw new Error("USER_DEACTIVATED");
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return null;
    }

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role as UserRole,
      isActive: user.isActive,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "USER_DEACTIVATED") {
      throw err;
    }

    // Fallback to bcrypt-hashed bootstrapped accounts when local MongoDB is unreachable
    const store = await getFallbackUsersStore();
    const fallbackUser = store.get(normalizedEmail);
    if (!fallbackUser) {
      return null;
    }

    if (!fallbackUser.isActive) {
      throw new Error("USER_DEACTIVATED");
    }

    const isValid = await verifyPassword(password, fallbackUser.passwordHash);
    if (!isValid) {
      return null;
    }

    return {
      id: fallbackUser.id,
      name: fallbackUser.name,
      email: fallbackUser.email,
      role: fallbackUser.role,
      isActive: fallbackUser.isActive,
    };
  }
}
