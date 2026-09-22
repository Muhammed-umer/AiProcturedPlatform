import Image from "next/image";
import emblem from "@/assets/banner.png";

export const COLLEGE_NAME = "Government College of Engineering, Erode";
export const COLLEGE_SHORT = "GCEE";
export const DEPARTMENT = "Department of Computer Science and Engineering";

/**
 * The college emblem. The source artwork is pale grey line work on a
 * transparent background, drawn for dark paper; `tone="ink"` recolours it
 * to the text colour so it reads on the light and yellow surfaces here.
 */
export function CollegeEmblem({
  size,
  tone = "ink",
  className = "",
  priority = false,
  decorative = false,
}: {
  size: number;
  tone?: "ink" | "original";
  className?: string;
  priority?: boolean;
  /** Purely ornamental, such as a watermark: hidden from screen readers. */
  decorative?: boolean;
}) {
  return (
    <Image
      src={emblem}
      alt={decorative ? "" : `${COLLEGE_NAME} emblem`}
      aria-hidden={decorative || undefined}
      width={size}
      height={size}
      priority={priority}
      className={`${tone === "ink" ? "brightness-0" : ""} ${className}`}
    />
  );
}

/** Emblem beside the college name, for page headers. */
export function CollegeMark({
  light = false,
  size = "md",
}: {
  light?: boolean;
  /** "lg" for the login brand panel, where the college leads the page. */
  size?: "md" | "lg";
}) {
  const lg = size === "lg";
  return (
    <div className={`flex items-center ${lg ? "gap-5" : "gap-3.5"}`}>
      <CollegeEmblem size={lg ? 88 : 52} priority className="shrink-0" />
      <div className="min-w-0 leading-tight">
        <div
          className={`font-bold tracking-tight text-ink ${
            lg ? "text-[22px] xl:text-[25px]" : "text-[15px]"
          }`}
        >
          {COLLEGE_NAME}
        </div>
        <div
          className={`${lg ? "text-[14.5px] mt-1.5" : "text-[12.5px] mt-0.5"} ${
            light ? "text-brand-900/80" : "text-ink-3"
          }`}
        >
          Placement Test Portal &middot; {COLLEGE_SHORT}
        </div>
      </div>
    </div>
  );
}

/** The credit line shown at the foot of public pages. */
export function MadeByCredit({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[12.5px] leading-relaxed ${className}`}>
      Designed and built by the{" "}
      <span className="font-semibold">Department of CSE, {COLLEGE_SHORT}</span>
      <br className="sm:hidden" />
      <span className="hidden sm:inline"> &middot; </span>
      By {COLLEGE_SHORT}, for {COLLEGE_SHORT}
    </p>
  );
}
