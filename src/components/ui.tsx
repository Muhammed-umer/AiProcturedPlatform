import clsx from "clsx";
import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 group">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-ink font-black text-[15px] shadow-sm">
        P
      </span>
      {!compact && (
        <span className="font-bold text-[15px] tracking-tight">
          Placement Test
        </span>
      )}
    </Link>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-[26px] sm:text-[30px] font-bold tracking-tight leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[15px] text-ink-2 mt-1 max-w-[62ch]">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex gap-2 shrink-0">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "brand" | "good" | "bad";
}) {
  const tones = {
    default: "bg-white border-line",
    brand: "bg-brand-50 border-brand-200",
    good: "bg-emerald-50 border-emerald-200",
    bad: "bg-red-50 border-red-200",
  };
  return (
    <div className={clsx("rounded-xl border p-4 sm:p-5", tones[tone])}>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {label}
      </div>
      <div className="text-[26px] sm:text-[30px] font-bold tracking-tight mt-1.5 tabular-nums leading-none">
        {value}
      </div>
      {hint && <div className="text-[12.5px] text-ink-3 mt-1.5">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card p-10 text-center">
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-brand-100 text-brand-700 text-xl font-bold">
        !
      </div>
      <h3 className="font-semibold text-[16px]">{title}</h3>
      <p className="text-[14.5px] text-ink-2 mt-1 max-w-[46ch] mx-auto">
        {message}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Alert({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success" | "warn";
  children: React.ReactNode;
}) {
  const tones = {
    info: "bg-brand-50 border-brand-200 text-brand-900",
    error: "bg-red-50 border-red-200 text-red-800",
    success: "bg-emerald-50 border-emerald-200 text-emerald-800",
    warn: "bg-amber-50 border-amber-300 text-amber-900",
  };
  return (
    <div
      className={clsx(
        "rounded-lg border px-4 py-3 text-[14px] leading-relaxed",
        tones[tone],
      )}
      role={tone === "error" ? "alert" : undefined}
    >
      {children}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "brand" | "good" | "bad" | "warn";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-canvas text-ink-3 border border-line-2",
    brand: "bg-brand-100 text-brand-800",
    good: "bg-emerald-100 text-emerald-800",
    bad: "bg-red-100 text-red-800",
    warn: "bg-amber-100 text-amber-800",
  };
  return <span className={clsx("chip", tones[tone])}>{children}</span>;
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

/**
 * A short explanation that appears on hover or keyboard focus.
 *
 * Buttons on the monitoring screen act on a live exam, so it should be
 * possible to find out what one does without pressing it to see. The tooltip
 * sits outside the control it describes, so it never becomes part of the
 * button's own accessible name.
 */
export function Tooltip({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom";
}) {
  return (
    <span className="relative inline-flex group">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 hidden -translate-x-1/2 rounded-md bg-ink px-2.5 py-1.5
                    text-[12px] font-medium leading-snug text-white text-center shadow-lg
                    w-max max-w-[220px] whitespace-normal
                    group-hover:block group-focus-within:block
                    ${side === "top" ? "bottom-full mb-2" : "top-full mt-2"}`}
      >
        {label}
      </span>
    </span>
  );
}
