"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  MessageSquareText,
  Building2,
  FileSignature,
  BarChart3,
  ShieldCheck,
  Package,
  FileSpreadsheet,
  FileCheck2,
  Sliders,
  CheckCircle2,
  Layers,
  Menu,
  X,
} from "lucide-react";

export function PublicLandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#171717] selection:bg-[#6938EF]/15 selection:text-[#6938EF]">
      {/* A. Public Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-[#EAEAEA] bg-[#FFFFFF]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-8">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6938EF] text-white font-bold text-lg shadow-xs">
              C
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-[#171717]">
                Cantill.ai
              </span>
              <span className="text-[11px] font-medium text-[#6B7280] leading-none">
                Procurement Workspace
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#6B7280]">
            <a
              href="#product"
              className="hover:text-[#171717] transition-colors"
            >
              Product
            </a>
            <a
              href="#solutions"
              className="hover:text-[#171717] transition-colors"
            >
              Solutions
            </a>
            <a
              href="#how-it-works"
              className="hover:text-[#171717] transition-colors"
            >
              How It Works
            </a>
            <a
              href="#features"
              className="hover:text-[#171717] transition-colors"
            >
              Features
            </a>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/auth/signin"
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[#171717] hover:bg-[#F5F5F7] transition-colors"
            >
              Login
            </Link>
            <Link
              href="/auth/signin"
              className="inline-flex items-center gap-2 rounded-xl bg-[#6938EF] px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#5928DF] transition-colors"
            >
              <span>Get Started</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden rounded-xl border border-[#EAEAEA] p-2.5 text-[#171717]"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile Menu Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#EAEAEA] bg-[#FFFFFF] px-6 py-5 space-y-4">
            <div className="flex flex-col space-y-3 text-sm font-medium text-[#6B7280]">
              <a
                href="#product"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 hover:text-[#171717]"
              >
                Product
              </a>
              <a
                href="#solutions"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 hover:text-[#171717]"
              >
                Solutions
              </a>
              <a
                href="#how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 hover:text-[#171717]"
              >
                How It Works
              </a>
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 hover:text-[#171717]"
              >
                Features
              </a>
            </div>
            <div className="pt-3 border-t border-[#EAEAEA] flex flex-col gap-2.5">
              <Link
                href="/auth/signin"
                className="w-full rounded-xl border border-[#EAEAEA] py-2.5 text-center text-sm font-semibold text-[#171717]"
              >
                Login
              </Link>
              <Link
                href="/auth/signin"
                className="w-full rounded-xl bg-[#6938EF] py-2.5 text-center text-sm font-semibold text-white"
              >
                Get Started
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* B. Hero Section */}
      <section id="product" className="relative overflow-hidden py-16 md:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
            {/* Left Column: Copy & CTAs */}
            <div className="lg:col-span-6 space-y-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#EAEAEA] bg-[#F9FAFB] px-3.5 py-1.5 text-xs font-semibold text-[#171717]">
                <span className="h-2 w-2 rounded-full bg-[#6938EF]" />
                <span>Deterministic Enterprise Procurement Platform</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-bold tracking-tight text-[#171717] leading-[1.12]">
                Smarter Procurement.{" "}
                <span className="text-[#6938EF]">Clearer Decisions.</span>
              </h1>

              <p className="text-base sm:text-lg text-[#6B7280] leading-relaxed max-w-xl">
                Manage procurement requests, evaluate suppliers, apply purchasing policies, and organize purchase decisions through one intelligent procurement workspace.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <Link
                  href="/auth/signin"
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#6938EF] px-7 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#5928DF] transition-all"
                >
                  <span>Get Started</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#solutions"
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#EAEAEA] bg-[#FFFFFF] px-7 py-3.5 text-sm font-semibold text-[#171717] hover:bg-[#F9FAFB] transition-all"
                >
                  <span>Explore Platform</span>
                </a>
              </div>

              {/* Subtle Pastel Capability Pills */}
              <div className="pt-4 flex flex-wrap gap-2.5">
                <span className="rounded-xl bg-[#FFF2CC] px-3.5 py-1.5 text-xs font-semibold text-[#171717]">
                  Guided PR Intake
                </span>
                <span className="rounded-xl bg-[#FCE3EF] px-3.5 py-1.5 text-xs font-semibold text-[#171717]">
                  Supplier Ranking
                </span>
                <span className="rounded-xl bg-[#DDF3FF] px-3.5 py-1.5 text-xs font-semibold text-[#171717]">
                  Contract Ceiling Control
                </span>
                <span className="rounded-xl bg-[#D9FAF5] px-3.5 py-1.5 text-xs font-semibold text-[#171717]">
                  Proposed PO Consolidation
                </span>
              </div>
            </div>

            {/* Right Column: Polished Product Interface Preview */}
            <div className="lg:col-span-6">
              <div className="rounded-3xl border border-[#EAEAEA] bg-[#FAFAFC] p-5 sm:p-7 shadow-sm space-y-4">
                {/* Preview Window Header */}
                <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#FCE3EF] border border-pink-300" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#FFF2CC] border border-amber-300" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#D9FAF5] border border-teal-300" />
                    <span className="ml-2 text-xs font-semibold text-[#171717]">
                      Cantill.ai Decision Workspace
                    </span>
                  </div>
                  <span className="rounded-lg bg-[#6938EF]/10 px-2.5 py-1 text-[11px] font-semibold text-[#6938EF]">
                    Policy v5.0 Active
                  </span>
                </div>

                {/* Card 1: Guided Requisition Intake */}
                <div className="rounded-2xl border border-[#EAEAEA] bg-[#FFFFFF] p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#171717] flex items-center gap-1.5">
                      <MessageSquareText className="h-3.5 w-3.5 text-[#6938EF]" />
                      Purchase Requisition Intake
                    </span>
                    <span className="rounded-md bg-[#FFF2CC] px-2 py-0.5 text-[10px] font-semibold text-[#171717]">
                      Plant: CHK1 (Chakan)
                    </span>
                  </div>
                  <p className="text-xs text-[#6B7280] bg-[#F9FAFB] rounded-xl p-2.5 border border-[#EAEAEA]">
                    &ldquo;Need 200 pairs of nitrile hand gloves for the Chakan plant by next Friday.&rdquo;
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-lg bg-[#F9FAFB] p-2">
                      <span className="text-[#6B7280] block">Matched Item</span>
                      <span className="font-mono font-bold text-[#171717]">ITM-1048</span>
                    </div>
                    <div className="rounded-lg bg-[#F9FAFB] p-2">
                      <span className="text-[#6B7280] block">Quantity</span>
                      <span className="font-mono font-bold text-[#171717]">200 PAIR</span>
                    </div>
                    <div className="rounded-lg bg-[#F9FAFB] p-2">
                      <span className="text-[#6B7280] block">Clubbed Group</span>
                      <span className="font-mono font-bold text-[#171717]">REQ-0012</span>
                    </div>
                  </div>
                </div>

                {/* Card 2: Two-Column Pastel Decision & Supplier Preview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="rounded-2xl bg-[#DDF3FF] p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[#171717]">
                        Policy Evaluation
                      </span>
                      <ShieldCheck className="h-4 w-4 text-[#171717]" />
                    </div>
                    <div className="text-sm font-bold text-[#171717]">
                      Direct Spot PO (Clause 5.4)
                    </div>
                    <p className="text-[11px] text-[#171717]/80 leading-snug">
                      Requirement value below ₹2,00,000 with active 365-day PO history.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[#D9FAF5] p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[#171717]">
                        1st Preferred Supplier
                      </span>
                      <Building2 className="h-4 w-4 text-[#171717]" />
                    </div>
                    <div className="text-sm font-bold text-[#171717]">
                      SafeGuard Industrial (S029)
                    </div>
                    <p className="text-[11px] text-[#171717]/80 leading-snug">
                      Weighted Score: 0.985 · Consolidated into Proposed PO-0001.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* C. Solutions / Categories Section (Pastel Cards Inspired by Reference) */}
      <section id="solutions" className="py-16 md:py-24 border-t border-[#EAEAEA]">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 space-y-12">
          <div className="max-w-2xl space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#6938EF]">
              Core Solutions
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#171717]">
              Four pillars of structured procurement control
            </h2>
            <p className="text-sm sm:text-base text-[#6B7280]">
              Every module works from the same item master, supplier registry, rate contracts, and versioned procurement policy.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1: Soft Yellow #FFF2CC */}
            <div className="flex flex-col justify-between rounded-3xl bg-[#FFF2CC] p-7 sm:p-8 border border-[#EAEAEA]/60">
              <div className="space-y-3">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFFFFF] text-[#171717] shadow-2xs">
                  <MessageSquareText className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-bold text-[#171717]">
                  Procurement Operations
                </h3>
                <p className="text-sm text-[#171717]/80 leading-relaxed">
                  Capture purchase requisitions through a guided conversational assistant or batch CSV upload, automatically resolving items and clubbing related requirements within a 14-day window.
                </p>
              </div>

              <div className="mt-6 rounded-2xl bg-[#FFFFFF] p-4 border border-[#EAEAEA]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#171717]">
                    Requirement Clubbing (Clause 2.2)
                  </span>
                  <span className="rounded-md bg-[#FFF2CC] px-2 py-0.5 font-mono text-[11px] font-bold">
                    14d / ±7d Window
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-[#6B7280]">
                  Prevents split requisitions by combining same-item, same-plant requests into a single evaluated requirement.
                </p>
              </div>
            </div>

            {/* Card 2: Soft Pink #FCE3EF */}
            <div className="flex flex-col justify-between rounded-3xl bg-[#FCE3EF] p-7 sm:p-8 border border-[#EAEAEA]/60">
              <div className="space-y-3">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFFFFF] text-[#171717] shadow-2xs">
                  <Building2 className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-bold text-[#171717]">
                  Supplier Management
                </h3>
                <p className="text-sm text-[#171717]/80 leading-relaxed">
                  Evaluate active suppliers using 548-day purchase history, recency tiers, contract coverage, on-time delivery, and quality ratings while automatically blocking inactive vendors.
                </p>
              </div>

              <div className="mt-6 rounded-2xl bg-[#FFFFFF] p-4 border border-[#EAEAEA]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#171717]">
                    Preferred Supplier Scoring
                  </span>
                  <span className="rounded-md bg-[#FCE3EF] px-2 py-0.5 font-mono text-[11px] font-bold">
                    5-Factor Model
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-[#6B7280]">
                  35% Frequency · 25% Recency · 15% Contract · 15% On-Time · 10% Quality.
                </p>
              </div>
            </div>

            {/* Card 3: Soft Blue #DDF3FF */}
            <div className="flex flex-col justify-between rounded-3xl bg-[#DDF3FF] p-7 sm:p-8 border border-[#EAEAEA]/60">
              <div className="space-y-3">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFFFFF] text-[#171717] shadow-2xs">
                  <FileSignature className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-bold text-[#171717]">
                  Contract Management
                </h3>
                <p className="text-sm text-[#171717]/80 leading-relaxed">
                  Match requirements against active rate contracts and signed PDF contract schedules, tracking cumulative ceiling consumption in chronological requirement order.
                </p>
              </div>

              <div className="mt-6 rounded-2xl bg-[#FFFFFF] p-4 border border-[#EAEAEA]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#171717]">
                    Ceiling Consumption Ledger
                  </span>
                  <span className="rounded-md bg-[#DDF3FF] px-2 py-0.5 font-mono text-[11px] font-bold">
                    Clauses 4.1 – 4.4
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-[#6B7280]">
                  Selects the lowest applicable contract rate with remaining ceiling room and routes exhausted contracts to sourcing.
                </p>
              </div>
            </div>

            {/* Card 4: Soft Teal #D9FAF5 */}
            <div className="flex flex-col justify-between rounded-3xl bg-[#D9FAF5] p-7 sm:p-8 border border-[#EAEAEA]/60">
              <div className="space-y-3">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFFFFF] text-[#171717] shadow-2xs">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-bold text-[#171717]">
                  Spend &amp; Analytics
                </h3>
                <p className="text-sm text-[#171717]/80 leading-relaxed">
                  Consolidate eligible direct POs within a 24-hour window, inspect full clause-by-clause decision explanations, and compare versioned procurement policies side by side.
                </p>
              </div>

              <div className="mt-6 rounded-2xl bg-[#FFFFFF] p-4 border border-[#EAEAEA]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#171717]">
                    Proposed PO Consolidation
                  </span>
                  <span className="rounded-md bg-[#D9FAF5] px-2 py-0.5 font-mono text-[11px] font-bold">
                    24h Window
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-[#6B7280]">
                  Groups same-supplier, same-plant, same-route PO decisions into proposed POs for buyer review.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* D. How It Works Section */}
      <section id="how-it-works" className="py-16 md:py-24 border-t border-[#EAEAEA] bg-[#FAFAFC]">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 space-y-12">
          <div className="max-w-2xl space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#6938EF]">
              How It Works
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#171717]">
              From purchase requisition to explainable decision in four steps
            </h2>
            <p className="text-sm sm:text-base text-[#6B7280]">
              Deterministic, reproducible procurement processing with full auditability at every step.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              {
                step: "01",
                title: "Submit a Purchase Requisition",
                description:
                  "Requesters submit needs via the guided procurement chat assistant or buyers upload a PR batch CSV for plant-level processing.",
                bg: "bg-[#FFF2CC]",
              },
              {
                step: "02",
                title: "Validate and Organize Requirements",
                description:
                  "Each line is matched against the item master, validated for plant scope and positive quantity, and clubbed within the 14-day window.",
                bg: "bg-[#FCE3EF]",
              },
              {
                step: "03",
                title: "Apply Policies and Evaluate Suppliers",
                description:
                  "The engine values requirements, checks rate contract ceilings, scores active preferred suppliers, and applies Policy v5.0 rules in order.",
                bg: "bg-[#DDF3FF]",
              },
              {
                step: "04",
                title: "Review Proposed POs or Sourcing Requests",
                description:
                  "Buyers inspect consolidated proposed POs, review RFQ/RFP/Capex sourcing events, and export RFC 4180 audit CSVs.",
                bg: "bg-[#D9FAF5]",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-3xl border border-[#EAEAEA] bg-[#FFFFFF] p-6 flex flex-col justify-between space-y-5"
              >
                <div className="space-y-4">
                  <div
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${item.bg} font-mono text-sm font-bold text-[#171717]`}
                  >
                    {item.step}
                  </div>
                  <h3 className="text-base font-bold text-[#171717]">
                    {item.title}
                  </h3>
                  <p className="text-xs text-[#6B7280] leading-relaxed">
                    {item.description}
                  </p>
                </div>
                <div className="pt-2 border-t border-[#EAEAEA] flex items-center justify-between text-[11px] font-medium text-[#6B7280]">
                  <span>Deterministic Step</span>
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#6938EF]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* E. Platform Features Section */}
      <section id="features" className="py-16 md:py-24 border-t border-[#EAEAEA]">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 space-y-12">
          <div className="max-w-2xl space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#6938EF]">
              Platform Capabilities
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#171717]">
              Built for end-to-end procurement governance
            </h2>
            <p className="text-sm sm:text-base text-[#6B7280]">
              Every capability below is implemented and connected to live MongoDB and deterministic TypeScript services.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: FileSpreadsheet,
                title: "Procurement Request Management",
                desc: "Conversational PR intake with deterministic entity parsing, clarification prompts, and requisition line tracking.",
              },
              {
                icon: Package,
                title: "Item & Supplier Master Data",
                desc: "Centralized catalogue of items, plants, suppliers, and historical purchase orders with CSV import validation.",
              },
              {
                icon: FileSignature,
                title: "Contract Management",
                desc: "Rate contract registry with line-level pricing, validity windows, and real-time ceiling balance tracking.",
              },
              {
                icon: ShieldCheck,
                title: "Procurement Policy Management",
                desc: "Versioned policy rules, deterministic PDF extraction, separation-of-duties approval, and side-by-side comparison.",
              },
              {
                icon: Building2,
                title: "Supplier Evaluation",
                desc: "548-day purchase history lookback, weighted ranking, category top-ups, and blocked supplier enforcement.",
              },
              {
                icon: Sliders,
                title: "Procurement Decision Engine",
                desc: "Evaluates Capex, Contract PO, Emergency PO, Spot PO, RFQ, RFP, and New Item Sourcing rules deterministically.",
              },
              {
                icon: FileCheck2,
                title: "Purchase Order Consolidation",
                desc: "Combines direct PO requirements sharing the same supplier, plant, and route within a 24-hour window.",
              },
              {
                icon: Layers,
                title: "Processing & Spend Analytics",
                desc: "Idempotent batch processing history, spend distribution by route and plant, and downloadable CSV outputs.",
              },
            ].map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.title}
                  className="rounded-2xl border border-[#EAEAEA] bg-[#FFFFFF] p-6 space-y-3 hover:border-[#6938EF]/40 transition-colors"
                >
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#F5F3FF] text-[#6938EF]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-bold text-[#171717]">{feat.title}</h3>
                  <p className="text-xs text-[#6B7280] leading-relaxed">{feat.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* F. Final CTA and Footer */}
      <section className="py-16 md:py-20 border-t border-[#EAEAEA]">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="rounded-3xl border border-[#EAEAEA] bg-[#FAFAFC] p-8 sm:p-12 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
            <div className="space-y-2 max-w-xl">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#171717]">
                Ready to enter the Cantill.ai workspace?
              </h2>
              <p className="text-sm text-[#6B7280]">
                Sign in with your role account (Requester, Buyer, or Procurement Admin) to create requisitions, review procurement decisions, or manage policies.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/auth/signin"
                className="inline-flex items-center gap-2 rounded-2xl bg-[#6938EF] px-6 py-3.5 text-sm font-semibold text-white hover:bg-[#5928DF] transition-colors"
              >
                <span>Sign In to Workspace</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#EAEAEA] bg-[#FFFFFF] py-10">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6938EF] text-white font-bold text-sm">
              C
            </div>
            <div>
              <span className="text-sm font-bold text-[#171717]">Cantill.ai</span>
              <span className="mx-2 text-[#EAEAEA]">|</span>
              <span className="text-xs text-[#6B7280]">
                Corvo Engineering Pvt. Ltd. Procurement Platform
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs font-medium text-[#6B7280]">
            <a href="#product" className="hover:text-[#171717]">
              Product
            </a>
            <a href="#solutions" className="hover:text-[#171717]">
              Solutions
            </a>
            <a href="#how-it-works" className="hover:text-[#171717]">
              How It Works
            </a>
            <a href="#features" className="hover:text-[#171717]">
              Features
            </a>
            <Link href="/auth/signin" className="text-[#6938EF] font-semibold">
              Login
            </Link>
          </div>

          <div className="text-xs text-[#6B7280]">
            &copy; {new Date().getFullYear()} Cantill.ai. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
