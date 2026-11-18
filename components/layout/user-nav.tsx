"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Shield, User, LogOut, Sliders, LogIn, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { UserRole } from "@/types/auth";

export function UserNav() {
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const router = useRouter();

  if (status === "loading") {
    return (
      <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
    );
  }

  if (!session?.user) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => router.push("/auth/signin")}
        className="h-8 text-xs gap-1.5"
      >
        <LogIn className="h-3.5 w-3.5" />
        <span>Sign In</span>
      </Button>
    );
  }

  const user = session.user;
  const role = ((user as unknown as { role: UserRole }).role) || "REQUESTER";
  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "US";

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/auth/signin" });
    toast({
      title: "Signed Out",
      description: "Enterprise session terminated.",
      variant: "default",
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-8 w-8 rounded-full ring-1 ring-border p-0 hover:ring-foreground/20 transition-all"
          aria-label="User navigation menu"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-xs font-semibold leading-none text-foreground truncate">
              {user.name}
            </p>
            <p className="text-[11px] leading-none text-muted-foreground truncate">
              {user.email}
            </p>
            <div className="pt-1">
              <span className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                <Shield className="mr-1 h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                {role.replace("_", " ")}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push("/settings")} className="cursor-pointer text-xs">
            <User className="mr-2 h-3.5 w-3.5" />
            <span>Profile & Settings</span>
          </DropdownMenuItem>

          {role === "PROCUREMENT_ADMIN" && (
            <DropdownMenuItem onClick={() => router.push("/admin/users")} className="cursor-pointer text-xs">
              <Users className="mr-2 h-3.5 w-3.5" />
              <span>User Management</span>
            </DropdownMenuItem>
          )}

          {role === "PROCUREMENT_ADMIN" && (
            <DropdownMenuItem onClick={() => router.push("/import")} className="cursor-pointer text-xs">
              <Sliders className="mr-2 h-3.5 w-3.5" />
              <span>Master Data Import</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="cursor-pointer text-xs text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-3.5 w-3.5" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
