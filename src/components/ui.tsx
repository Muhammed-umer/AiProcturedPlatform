import clsx from "clsx";
import Link from "next/link";
import {
  CollegeEmblem,
  PrismMark,
  PrismWordmark,
  APP_TAGLINE,
} from "@/components/college";

export { SubmitButton, ConfirmForm } from "@/components/form-controls";

/**
 * The app's name and tagline. Links straight to the signed-in user's home
 * (pass `href`), which is a quick in-app navigation. Linking to "/" instead
 * went through a server redirect and felt like a full page reload.
 * On narrow screens the tagline drops away, leaving the name.
 */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2.5 min-w-0 rounded-md"
    >
      <PrismMark size={32} priority className="h-8 w-8" />
      <span className="min-w-0 leading-tight">
        <PrismWordmark className="block text-[19px] leading-none" />
        <span className="hidden md:block text-[11.5px] text-ink-3 mt-1.5 truncate">
          {APP_TAGLINE}
        </span>
      </span>
    </Link>
  );
}

/** A small "back to" link above a page title. */
export function BackLink({ href, children }: { href: string; children: string }) {
  return (
    <div className="mb-2">
      <Link
        href={href}
        className="inline-flex items-center gap-1 rounded text-[13.5px] font-medium text-ink-3 hover:text-ink"
      >
        <span aria-hidden="true">&larr;</span> {children}
      </Link>
    </div>
  );
}

/** A heading for a block within a page, with an optional count or aside. */
export function SectionTitle({
  children,
  count,
  aside,
  className = "mb-3",
}: {
  children: React.ReactNode;
  count?: number;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-baseline justify-between gap-3", className)}>
      <h2 className="text-[17px] font-bold tracking-tight">
        {children}
        {count !== undefined && (
          <span className="text-ink-3 font-medium ml-2 text-[15px] tabular-nums">
            {count}
          </span>
        )}
      </h2>
      {aside}
    </div>
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
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "brand" | "good" | "bad";
  /** Makes the whole card a link to the page behind the number. */
  href?: string;
}) {
  const tones = {
    default: "bg-white border-line",
    brand: "bg-brand-50 border-brand-200",
    good: "bg-emerald-50 border-emerald-200",
    bad: "bg-red-50 border-red-200",
  };
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {label}
        {href && (
          <span
            aria-hidden="true"
            className="text-[14px] leading-none text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-ink"
          >
            &rarr;
          </span>
        )}
      </div>
      <div className="text-[26px] sm:text-[30px] font-bold tracking-tight mt-1.5 tabular-nums leading-none">
        {value}
      </div>
      {hint && <div className="text-[12.5px] text-ink-2 mt-1.5">{hint}</div>}
    </>
  );
  const classes = clsx("rounded-xl border p-4 sm:p-5", tones[tone]);

  if (href) {
    return (
      <Link
        href={href}
        className={clsx(
          classes,
          "group block transition hover:border-brand-400 hover:shadow-sm",
        )}
      >
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
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
    <div className="card relative overflow-hidden px-6 py-10 text-center">
      <div className="kolam absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative">
        <CollegeEmblem
          size={56}
          decorative
          className="mx-auto mb-3 h-14 w-14 opacity-[0.18]"
        />
        <h3 className="font-semibold text-[16px]">{title}</h3>
        <p className="text-[14.5px] text-ink-2 mt-1 max-w-[46ch] mx-auto">
          {message}
        </p>
        {action && <div className="mt-5">{action}</div>}
      </div>
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
    neutral: "bg-canvas text-ink-2 border border-line-2",
    brand: "bg-brand-100 text-brand-800",
    good: "bg-emerald-100 text-emerald-800",
    bad: "bg-red-100 text-red-800",
    warn: "bg-amber-100 text-amber-800",
  };
  return <span className={clsx("chip", tones[tone])}>{children}</span>;
}

const TEST_STATUS = {
  draft: { label: "Draft", tone: "warn" },
  published: { label: "Published", tone: "good" },
  closed: { label: "Closed", tone: "neutral" },
} as const;

/** Where a test is in its life: being written, open to students, or over. */
export function StatusBadge({ status }: { status: string }) {
  const known = TEST_STATUS[status as keyof typeof TEST_STATUS];
  return (
    <Badge tone={known?.tone ?? "neutral"}>
      {status === "published" && (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
      )}
      {known?.label ?? status}
    </Badge>
  );
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

/**
 * A checkbox with a bold title and a line of explanation, the whole row
 * clickable. Uncontrolled, so it works inside a plain server-action form.
 */
export function CheckboxRow({
  name,
  title,
  description,
  defaultChecked,
  boxed = false,
}: {
  name: string;
  title: string;
  description: React.ReactNode;
  defaultChecked?: boolean;
  /** Draw it as a bordered card, for use among ordinary form fields. */
  boxed?: boolean;
}) {
  return (
    <label
      htmlFor={name}
      className={clsx(
        "flex items-start gap-3 cursor-pointer",
        boxed && "rounded-xl border border-line bg-canvas px-4 py-3.5",
      )}
    >
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-brand-500 cursor-pointer"
      />
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className="block text-[12.5px] text-ink-2">{description}</span>
      </span>
    </label>
  );
}
