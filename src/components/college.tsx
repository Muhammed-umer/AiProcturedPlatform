import Image from "next/image";
import emblem from "@/assets/banner.png";
import prismMark from "@/assets/prism-mark.png";

/** The application's own name, shown in every header and the browser tab. */
export const APP_NAME = "PRISM";
export const APP_TAGLINE = "Placement Readiness & Integrated Skill Measurement";

export const COLLEGE_NAME = "Government College of Engineering, Erode";
export const COLLEGE_NAME_TA = "அரசினர் பொறியியல் கல்லூரி, ஈரோடு";
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

/** The PRISM logo: the prism splitting a beam, on its amber tile. */
export function PrismMark({
  size = 30,
  className = "",
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={prismMark}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      priority={priority}
      className={`shrink-0 ${className}`}
    />
  );
}

/**
 * The PRISM wordmark: the display face, wide letter-spacing, and an "i" drawn
 * by hand. It is a lowercase i, but its stem stands as tall as the R and the
 * S beside it, with the prism triangle floating above as its dot. That one
 * letter is the brand's signature, so it is a shape rather than a character,
 * and it scales with the surrounding text.
 */
export function PrismWordmark({
  className = "",
  onBrand = false,
}: {
  className?: string;
  /** On the yellow panel, where an amber dot would disappear. */
  onBrand?: boolean;
}) {
  return (
    <span
      className={`font-display font-extrabold tracking-[0.08em] ${className}`}
    >
      {/* One accessible name; the pieces below are decorative. */}
      <span className="sr-only">{APP_NAME}</span>
      <span aria-hidden="true">
        PR
        <svg
          viewBox="0 0 13 50"
          // The box sits on the text baseline. The stem fills the cap height,
          // so the letter matches the R and the S; the dot floats above them.
          className="mx-[0.06em] inline-block h-[1.02em] w-[0.27em] align-baseline"
          role="presentation"
          focusable="false"
        >
          <polygon
            points="6.5,0 13,12 0,12"
            className={onBrand ? "fill-ink" : "fill-brand-500"}
          />
          <rect x="3.1" y="19" width="6.8" height="31" fill="currentColor" />
        </svg>
        SM
      </span>
    </span>
  );
}

/** Emblem beside the college name, for page headers. */
export function CollegeMark({
  light = false,
  size = "md",
  emblem = true,
  centered = false,
}: {
  light?: boolean;
  /** Off where the page already shows the emblem, such as the login panel. */
  emblem?: boolean;
  /** Centre the text, for a centred layout such as the login panel. */
  centered?: boolean;
  /** "lg" for the login brand panel, where the college leads the page. */
  size?: "md" | "lg";
}) {
  const lg = size === "lg";
  return (
    <div
      className={`flex items-center ${lg ? "gap-5" : "gap-3.5"} ${
        centered ? "justify-center text-center" : ""
      }`}
    >
      {emblem && (
        <CollegeEmblem size={lg ? 88 : 52} priority className="shrink-0" />
      )}
      <div className="min-w-0 leading-tight">
        <div
          className={`font-bold tracking-tight text-ink ${
            lg ? "text-[22px] xl:text-[25px]" : "text-[15px]"
          }`}
        >
          {COLLEGE_NAME}
        </div>
        {lg && (
          <div
            lang="ta"
            className={`font-tamil text-[14px] mt-1 ${
              light ? "text-brand-900" : "text-ink-2"
            }`}
          >
            {COLLEGE_NAME_TA}
          </div>
        )}
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
      <br />
      By {COLLEGE_SHORT}, for {COLLEGE_SHORT}
    </p>
  );
}
