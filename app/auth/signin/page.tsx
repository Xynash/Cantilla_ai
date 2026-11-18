"use client";

import * as React from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Lock,
  Mail,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import { APP_CONFIG } from "@/config/constants";

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage("Please enter both your work email and password.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: email.trim(),
        password,
        callbackUrl,
      });

      if (!res || res.error) {
        if (res?.error?.includes("USER_DEACTIVATED")) {
          setErrorMessage(
            "This account has been deactivated. Please contact your procurement administrator."
          );
        } else {
          setErrorMessage(
            "Invalid email or password. Verify credentials and try again."
          );
        }
        setIsLoading(false);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setErrorMessage("An unexpected authentication error occurred.");
      setIsLoading(false);
    }
  };

  const handleQuickFill = (roleEmail: string, rolePass: string) => {
    setEmail(roleEmail);
    setPassword(rolePass);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFC] text-[#171717] flex flex-col justify-between py-8 px-4 sm:px-6">
      {/* Top Bar: Back to Public Landing Page */}
      <div className="mx-auto w-full max-w-6xl flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#6B7280] hover:text-[#171717] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Cantill.ai Home</span>
        </Link>
        <span className="text-xs font-mono text-[#6B7280]">
          Corvo Engineering Procurement Portal
        </span>
      </div>

      {/* Centered Login Card */}
      <div className="mx-auto w-full max-w-md space-y-6 my-8">
        {/* Brand Header */}
        <div className="text-center space-y-2.5">
          <Link href="/" className="inline-flex items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#6938EF] text-white font-bold text-xl shadow-xs">
              C
            </div>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#171717]">
            Sign in to {APP_CONFIG.name}
          </h1>
          <p className="text-xs sm:text-sm text-[#6B7280]">
            Enter your corporate credentials to access your procurement workspace
          </p>
        </div>

        {/* Main White Rounded Card */}
        <div className="rounded-3xl border border-[#EAEAEA] bg-[#FFFFFF] p-6 sm:p-8 shadow-xs space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50/70 p-3.5 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="leading-snug font-medium">{errorMessage}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="work-email"
                className="text-xs font-semibold text-[#171717]"
              >
                Work Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-[#6B7280]" />
                <Input
                  id="work-email"
                  type="email"
                  required
                  placeholder="name@cantill.ai"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-10 rounded-xl border-[#EAEAEA] text-xs"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="work-password"
                className="text-xs font-semibold text-[#171717]"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-[#6B7280]" />
                <Input
                  id="work-password"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-10 rounded-xl border-[#EAEAEA] text-xs"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-2.5 p-0.5 text-[#6B7280] hover:text-[#171717]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-[#6938EF] hover:bg-[#5928DF] text-white text-xs font-semibold h-10 gap-2 shadow-xs"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Signing in...
                </span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {/* Bootstrap Role Evaluation Accounts */}
          <div className="pt-5 border-t border-[#EAEAEA] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#171717]">
                <Sparkles className="h-3.5 w-3.5 text-[#6938EF]" />
                <span>Quick Role Selection (Evaluation)</span>
              </div>
              <span className="text-[10px] text-[#6B7280]">Click to fill</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleQuickFill("admin@cantill.ai", "CantillAdmin2026!")}
                className="flex flex-col items-start rounded-2xl bg-[#FFF2CC] p-3 text-left border border-transparent hover:border-[#171717]/20 transition-all"
              >
                <span className="text-xs font-bold text-[#171717]">
                  Procurement Admin
                </span>
                <span className="text-[11px] text-[#171717]/75 font-mono truncate w-full">
                  admin@cantill.ai
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill("director@cantill.ai", "Director2026!")}
                className="flex flex-col items-start rounded-2xl bg-[#D9FAF5] p-3 text-left border border-transparent hover:border-[#171717]/20 transition-all"
              >
                <span className="text-xs font-bold text-[#171717]">
                  Head of Procurement
                </span>
                <span className="text-[11px] text-[#171717]/75 font-mono truncate w-full">
                  director@cantill.ai
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill("buyer@cantill.ai", "Buyer2026!")}
                className="flex flex-col items-start rounded-2xl bg-[#DDF3FF] p-3 text-left border border-transparent hover:border-[#171717]/20 transition-all"
              >
                <span className="text-xs font-bold text-[#171717]">
                  Senior Buyer
                </span>
                <span className="text-[11px] text-[#171717]/75 font-mono truncate w-full">
                  buyer@cantill.ai
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill("requester@cantill.ai", "Requester2026!")}
                className="flex flex-col items-start rounded-2xl bg-[#FCE3EF] p-3 text-left border border-transparent hover:border-[#171717]/20 transition-all"
              >
                <span className="text-xs font-bold text-[#171717]">
                  Plant Requester
                </span>
                <span className="text-[11px] text-[#171717]/75 font-mono truncate w-full">
                  requester@cantill.ai
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mx-auto w-full max-w-6xl text-center text-xs text-[#6B7280]">
        &copy; {new Date().getFullYear()} {APP_CONFIG.name} &bull; Enterprise Role-Based Access Control
      </div>
    </div>
  );
}
