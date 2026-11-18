"use client";

import * as React from "react";
import {
  Database,
  Shield,
  Building2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Lock,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { APP_CONFIG } from "@/config/constants";
import { WorkspaceSettingsResponse } from "@/services/settingsService";

export default function SettingsPage() {
  const { toast } = useToast();

  // Workspace settings state
  const [settingsLoading, setSettingsLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [settingsError, setSettingsError] = React.useState<string | null>(null);
  const [settingsData, setSettingsData] =
    React.useState<WorkspaceSettingsResponse | null>(null);

  const [companyName, setCompanyName] = React.useState<string>(
    APP_CONFIG.company
  );
  const [platformName, setPlatformName] = React.useState<string>(
    APP_CONFIG.name
  );
  const [supportEmail, setSupportEmail] = React.useState<string>(
    APP_CONFIG.supportEmail
  );

  // Database health check state
  const [dbChecking, setDbChecking] = React.useState(false);
  const [dbResult, setDbResult] = React.useState<{
    checked: boolean;
    status: string;
    connected?: boolean;
    message?: string;
  }>({
    checked: false,
    status: "idle",
  });

  const loadSettings = React.useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const res = await fetch("/api/settings");
      const json = await res.json();
      if (json.success && json.data) {
        const data = json.data as WorkspaceSettingsResponse;
        setSettingsData(data);
        setCompanyName(data.companyName);
        setPlatformName(data.platformName);
        setSupportEmail(data.supportEmail);
      } else {
        setSettingsError(json.error?.message || "Failed to load settings.");
      }
    } catch {
      setSettingsError("Could not connect to settings service.");
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);

    if (!companyName.trim() || companyName.trim().length < 2) {
      const msg = "Company / Tenant Name must be at least 2 characters.";
      setSettingsError(msg);
      toast({
        title: "Validation Error",
        description: msg,
        variant: "destructive",
      });
      return;
    }

    if (!platformName.trim() || platformName.trim().length < 2) {
      const msg = "Platform Name must be at least 2 characters.";
      setSettingsError(msg);
      toast({
        title: "Validation Error",
        description: msg,
        variant: "destructive",
      });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail.trim())) {
      const msg = "Please provide a valid support desk email address.";
      setSettingsError(msg);
      toast({
        title: "Validation Error",
        description: msg,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          platformName: platformName.trim(),
          supportEmail: supportEmail.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        const msg = json.error?.message || "Failed to save workspace settings.";
        setSettingsError(msg);
        toast({
          title: "Save Failed",
          description: msg,
          variant: "destructive",
        });
        return;
      }

      setSettingsData(json.data);
      toast({
        title: "Workspace Settings Persisted",
        description: `Updated organization parameters (${json.data.companyName}).`,
        variant: "success",
      });
    } catch {
      const msg = "Network error while saving workspace settings.";
      setSettingsError(msg);
      toast({
        title: "Network Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const checkDatabaseHealth = async () => {
    setDbChecking(true);
    try {
      const res = await fetch("/api/health?checkDb=true");
      const json = await res.json();
      setDbResult({
        checked: true,
        status: json.data?.status || "unknown",
        connected: json.data?.database?.connected,
        message: json.data?.database?.message || "Health check completed.",
      });
      toast({
        title: "Database Check Complete",
        description: `Status: ${json.data?.status ?? "OK"}`,
        variant: json.data?.database?.connected ? "success" : "default",
      });
    } catch {
      setDbResult({
        checked: true,
        status: "error",
        connected: false,
        message: "Failed to connect to /api/health endpoint.",
      });
      toast({
        title: "Health Check Error",
        description: "Network or server failure.",
        variant: "destructive",
      });
    } finally {
      setDbChecking(false);
    }
  };

  const canEdit = settingsData?.canEditOrganizationSettings ?? false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-[#EAEAEA] pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#171717] sm:text-2xl">
            System &amp; Workspace Settings
          </h1>
          <p className="text-xs sm:text-sm text-[#6B7280] mt-0.5">
            Enterprise organization identity, database diagnostics, and active role permissions
          </p>
        </div>

        {settingsData && (
          <div className="text-[11px] font-mono text-[#6B7280]">
            Last updated by <span className="text-[#171717] font-medium">{settingsData.updatedBy}</span>
          </div>
        )}
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
          <TabsTrigger value="security">Security &amp; Auth</TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-4 mt-4">
          <form onSubmit={handleSaveGeneral}>
            <Card className="rounded-2xl border-[#EAEAEA]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-[#6938EF]" />
                      Organization Identity
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Company parameters persisted for purchase orders, compliance reports, and audit records
                    </CardDescription>
                  </div>
                  {!canEdit && !settingsLoading && (
                    <Badge variant="outline" className="text-[10px] font-mono">
                      Read-Only ({settingsData?.currentUser.role || "REQUESTER"})
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {settingsLoading ? (
                  <div className="py-6 text-xs text-[#6B7280] flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-[#6938EF]" />
                    <span>Loading persisted workspace settings...</span>
                  </div>
                ) : (
                  <>
                    {settingsError && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-800 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                        <span>{settingsError}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="settings-company-name"
                          className="text-xs font-medium text-[#171717]"
                        >
                          Company / Tenant Name
                        </label>
                        <Input
                          id="settings-company-name"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          disabled={!canEdit || saving}
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label
                          htmlFor="settings-platform-name"
                          className="text-xs font-medium text-[#171717]"
                        >
                          Platform Name
                        </label>
                        <Input
                          id="settings-platform-name"
                          value={platformName}
                          onChange={(e) => setPlatformName(e.target.value)}
                          disabled={!canEdit || saving}
                          className="h-9 text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="settings-support-email"
                        className="text-xs font-medium text-[#171717]"
                      >
                        Procurement Support Desk Email
                      </label>
                      <Input
                        id="settings-support-email"
                        type="email"
                        value={supportEmail}
                        onChange={(e) => setSupportEmail(e.target.value)}
                        disabled={!canEdit || saving}
                        className="h-9 text-xs max-w-sm"
                      />
                    </div>
                  </>
                )}
              </CardContent>

              <CardFooter className="border-t border-[#EAEAEA] bg-[#FAFAFC] px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="text-[11px] text-[#6B7280]">
                  {canEdit
                    ? "Changes are validated and persisted to WorkspaceSetting with an audit log entry."
                    : "Only PROCUREMENT_ADMIN users can modify organization-wide identity settings."}
                </span>
                {canEdit && (
                  <Button
                    type="submit"
                    size="sm"
                    disabled={saving || settingsLoading}
                    className="h-8 rounded-xl bg-[#6938EF] hover:bg-[#5928DF] text-white text-xs font-medium px-4"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                )}
              </CardFooter>
            </Card>
          </form>
        </TabsContent>

        {/* Database Diagnostics */}
        <TabsContent value="database" className="space-y-4 mt-4">
          <Card className="rounded-2xl border-[#EAEAEA]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Database className="h-4 w-4 text-[#6938EF]" />
                MongoDB Atlas Connection Health
              </CardTitle>
              <CardDescription className="text-xs">
                Mongoose connection pooling, environment validation, and live health diagnostics
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-[#EAEAEA] bg-[#FAFAFC] p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#171717]">
                    Connection Architecture
                  </span>
                  <span className="font-mono text-[10px] rounded bg-[#D9FAF5] text-[#171717] px-2 py-0.5 font-medium">
                    Mongoose Singleton Ready
                  </span>
                </div>
                <p className="text-xs text-[#6B7280] leading-relaxed">
                  Cached singleton connection pattern prevents connection leakage during Next.js HMR and maintains deterministic fallback support when offline.
                </p>
              </div>

              {dbResult.checked && (
                <div
                  className={`rounded-xl border p-3.5 text-xs ${
                    dbResult.connected
                      ? "border-emerald-300 bg-emerald-50/60 text-[#171717]"
                      : "border-[#EAEAEA] bg-[#FAFAFC] text-[#171717]"
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {dbResult.connected ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                    )}
                    <span>
                      Diagnostic Result: {dbResult.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#6B7280]">
                    {dbResult.message}
                  </p>
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t border-[#EAEAEA] bg-[#FAFAFC] px-5 py-3 flex justify-between items-center">
              <span className="text-[11px] font-mono text-[#6B7280]">
                Route: /api/health?checkDb=true
              </span>
              <Button
                size="sm"
                onClick={checkDatabaseHealth}
                disabled={dbChecking}
                className="h-8 rounded-xl bg-[#6938EF] hover:bg-[#5928DF] text-white text-xs font-medium gap-1.5"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${dbChecking ? "animate-spin" : ""}`}
                />
                <span>Test Database Ping</span>
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Security & Auth */}
        <TabsContent value="security" className="space-y-4 mt-4">
          <Card className="rounded-2xl border-[#EAEAEA]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#6938EF]" />
                Authenticated Session &amp; RBAC Matrix
              </CardTitle>
              <CardDescription className="text-xs">
                Live Auth.js v5 session configuration and active role permissions for your account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              {settingsData?.currentUser && (
                <div className="rounded-xl border border-[#EAEAEA] bg-[#FAFAFC] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-[#6938EF]" />
                      <span className="font-semibold text-[#171717]">
                        {settingsData.currentUser.name} ({settingsData.currentUser.email})
                      </span>
                    </div>
                    <Badge className="bg-[#F3EEFF] text-[#6938EF] border border-[#6938EF]/20 font-mono text-[10px]">
                      {settingsData.currentUser.role}
                    </Badge>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium text-[#4B5563]">
                      Granted Role Permissions ({settingsData.currentUser.permissions.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {settingsData.currentUser.permissions.map((perm) => (
                        <span
                          key={perm}
                          className="rounded-md border border-[#EAEAEA] bg-white px-2 py-0.5 font-mono text-[10px] text-[#171717]"
                        >
                          {perm}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-[#EAEAEA] bg-white p-4 font-mono text-[11px] space-y-1.5 text-[#4B5563]">
                <div>
                  SESSION_STRATEGY:{" "}
                  <span className="text-[#171717] font-semibold">
                    &quot;{settingsData?.authCapabilities.sessionStrategy || "jwt"}&quot;
                  </span>
                </div>
                <div>
                  CREDENTIALS_PROVIDER:{" "}
                  <span className="text-emerald-700 font-semibold">ACTIVE</span>
                </div>
                <div>
                  SUPPORTED_ROLES:{" "}
                  <span className="text-[#171717] font-semibold">
                    [&quot;REQUESTER&quot;, &quot;BUYER&quot;, &quot;PROCUREMENT_ADMIN&quot;]
                  </span>
                </div>
              </div>

              {/* Honest Unavailable State for External SAML/OIDC SSO Configuration */}
              <div className="rounded-xl border border-dashed border-[#D1D5DB] bg-[#FAFAFC] p-4 flex items-start gap-3">
                <Lock className="h-4 w-4 text-[#6B7280] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#171717]">
                      External SAML 2.0 / OIDC SSO Providers
                    </span>
                    <span className="rounded bg-[#FFF2CC] px-1.5 py-0.5 text-[10px] font-mono font-medium text-[#171717]">
                      Unavailable
                    </span>
                  </div>
                  <p className="text-[11px] text-[#6B7280] leading-relaxed">
                    {settingsData?.authCapabilities.externalSsoStatusReason ||
                      "External SAML 2.0 / OIDC identity provider configuration is not enabled in this deployment. User provisioning and role management are handled via User Management (/admin/users)."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
