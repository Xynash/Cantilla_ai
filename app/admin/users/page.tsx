"use client";

import * as React from "react";
import { Users, Plus, Search, RefreshCw, Shield, CheckCircle2, XCircle, UserPlus, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { UserRole } from "@/types/auth";

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export default function UserManagementPage() {
  const { toast } = useToast();
  const [users, setUsers] = React.useState<UserRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // New user form state
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<UserRole>("REQUESTER");
  const [creating, setCreating] = React.useState(false);

  const fetchUsers = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/users?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setUsers(json.data || []);
      } else {
        toast({
          title: "Access Restricted",
          description: json.error?.message || "Admin authorization required",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to connect to user management service",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  React.useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleToggleActive = async (user: UserRecord) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const json = await res.json();
      if (json.success) {
        toast({
          title: "User Updated",
          description: `User '${user.name}' is now ${!user.isActive ? "Active" : "Deactivated"}.`,
          variant: "success",
        });
        fetchUsers();
      } else {
        toast({
          title: "Update Failed",
          description: json.error?.message,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to update user", variant: "destructive" });
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const json = await res.json();
      if (json.success) {
        toast({
          title: "User Created",
          description: `Created ${role} account for ${email}`,
          variant: "success",
        });
        setDialogOpen(false);
        setName("");
        setEmail("");
        setPassword("");
        setRole("REQUESTER");
        fetchUsers();
      } else {
        toast({
          title: "Creation Failed",
          description: json.error?.message,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to create user", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            User & Role Management
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage enterprise role assignments, user activations, and permission tiers
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="h-8 text-xs gap-1.5"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Create User</span>
          </Button>

          <Button
            variant="outline"
            size="icon-sm"
            onClick={fetchUsers}
            className="h-8 w-8"
            title="Refresh users"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center max-w-sm">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search users by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Assigned Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-xs text-muted-foreground">
                  Loading users...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                  No users found in database.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id} className="text-xs">
                  <TableCell className="font-semibold text-foreground">{u.name}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-bold ${
                        u.role === "PROCUREMENT_ADMIN"
                          ? "bg-purple-500/10 text-purple-700 dark:text-purple-300"
                          : u.role === "BUYER"
                          ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Shield className="mr-1 h-3 w-3" />
                      {u.role}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        u.isActive
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {u.isActive ? "Active" : "Deactivated"}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-[11px]">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(u)}
                      className="h-7 text-[11px] px-2"
                    >
                      {u.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateUser}>
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">Provision Enterprise User</DialogTitle>
              <DialogDescription className="text-xs">
                Create a corporate user account and assign functional procurement RBAC permissions.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-3 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-foreground">Full Name</label>
                <Input
                  required
                  placeholder="e.g. John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-foreground">Corporate Email</label>
                <Input
                  type="email"
                  required
                  placeholder="e.g. j.doe@cantill.ai"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-foreground">Initial Password (min 8 chars)</label>
                <Input
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-foreground">Role Assignment</label>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {(["REQUESTER", "BUYER", "PROCUREMENT_ADMIN"] as UserRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`p-2 rounded border text-left text-[11px] transition-all ${
                        role === r
                          ? "border-primary bg-primary/10 text-primary font-bold"
                          : "border-border bg-card text-muted-foreground hover:bg-muted/30"
                      }`}
                    >
                      {r.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating} size="sm">
                {creating ? "Creating..." : "Provision Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
