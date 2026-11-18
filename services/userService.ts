import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { AuditLog } from "@/models/AuditLog";
import { hashPassword } from "@/lib/auth/password";
import { getFallbackUsersStore } from "@/lib/auth/bootstrap";
import { escapeRegex } from "@/lib/utils";
import { UserRole } from "@/types/auth";
import { ValidationError, NotFoundError } from "@/lib/errors";

export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
}

export async function listUsers(params: ListUsersParams) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 10));
  const skip = (page - 1) * limit;

  try {
    await connectToDatabase();

    const query: Record<string, unknown> = {};

    if (params.search) {
      const s = escapeRegex(params.search.trim());
      query.$or = [
        { name: { $regex: s, $options: "i" } },
        { email: { $regex: s, $options: "i" } },
      ];
    }

    if (params.role && params.role !== "ALL") {
      query.role = params.role;
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-passwordHash")
        .lean(),
      User.countDocuments(query),
    ]);

    return {
      items: users.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        timestamp: new Date().toISOString(),
      },
    };
  } catch {
    const store = await getFallbackUsersStore();
    let list = Array.from(store.values());

    if (params.search) {
      const s = params.search.trim().toLowerCase();
      list = list.filter(
        (u) => u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)
      );
    }

    if (params.role && params.role !== "ALL") {
      list = list.filter((u) => u.role === params.role);
    }

    const total = list.length;
    const paged = list.slice(skip, skip + limit);

    return {
      items: paged.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function createUser(
  data: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
  },
  actorId: string,
  actorEmail?: string
) {
  const email = data.email.toLowerCase().trim();
  const passwordHash = await hashPassword(data.password);

  try {
    await connectToDatabase();

    const existing = await User.findOne({ email });
    if (existing) {
      throw new ValidationError(`User with email ${email} already exists`);
    }

    const user = await User.create({
      name: data.name.trim(),
      email,
      passwordHash,
      role: data.role,
      isActive: true,
    });

    await AuditLog.create({
      actorId,
      actorEmail,
      action: "USER_CREATED",
      entityType: "User",
      entityId: user._id.toString(),
      newValue: { email: user.email, role: user.role, name: user.name },
    });

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  } catch (err) {
    if (err instanceof ValidationError) throw err;

    const store = await getFallbackUsersStore();
    if (store.has(email)) {
      throw new ValidationError(`User with email ${email} already exists`);
    }

    const now = new Date().toISOString();
    const record = {
      id: `usr_${Date.now()}`,
      name: data.name.trim(),
      email,
      passwordHash,
      role: data.role,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    store.set(email, record);

    return {
      id: record.id,
      name: record.name,
      email: record.email,
      role: record.role,
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

export async function updateUser(
  id: string,
  updates: {
    name?: string;
    role?: UserRole;
    isActive?: boolean;
    password?: string;
  },
  actorId: string,
  actorEmail?: string
) {
  try {
    await connectToDatabase();

    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    const prev = {
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    };

    if (updates.name !== undefined) user.name = updates.name.trim();
    if (updates.role !== undefined) user.role = updates.role;
    if (updates.isActive !== undefined) user.isActive = updates.isActive;
    if (updates.password) {
      user.passwordHash = await hashPassword(updates.password);
    }

    await user.save();

    await AuditLog.create({
      actorId,
      actorEmail,
      action: "USER_UPDATED",
      entityType: "User",
      entityId: user._id.toString(),
      previousValue: prev,
      newValue: { name: user.name, role: user.role, isActive: user.isActive },
    });

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  } catch (err) {
    if (err instanceof NotFoundError) throw err;

    const store = await getFallbackUsersStore();
    const record = Array.from(store.values()).find((u) => u.id === id);
    if (!record) {
      throw new NotFoundError("User not found");
    }

    if (updates.name !== undefined) record.name = updates.name.trim();
    if (updates.role !== undefined) record.role = updates.role;
    if (updates.isActive !== undefined) record.isActive = updates.isActive;
    if (updates.password) {
      record.passwordHash = await hashPassword(updates.password);
    }
    record.updatedAt = new Date().toISOString();

    return {
      id: record.id,
      name: record.name,
      email: record.email,
      role: record.role,
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
