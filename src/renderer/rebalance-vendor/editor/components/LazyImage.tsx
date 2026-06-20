import { useCallback, useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

export interface LazyImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "onLoad" | "onError"> {
  /** Image source URL */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Additional CSS classes applied to the wrapper */
  className?: string;
  /** Explicit width for the placeholder (prevents layout shift) */
  width?: number | string;
  /** Explicit height for the placeholder (prevents layout shift) */
  height?: number | string;
}

type LoadState = "idle" | "loading" | "loaded" | "error";

/**
 * LazyImage – defers image loading until the element approaches the viewport
 * using IntersectionObserver. Shows a shimmer placeholder while loading,
 * fades the image in on load, and displays a muted icon on error.
 *
 * Falls back to eager loading when IntersectionObserver is unavailable.
 */
export function LazyImage({ src, alt, className, width, height, style, ...rest }: LazyImageProps) {
  const supportsObserver = typeof IntersectionObserver !== "undefined";
  const [loadState, setLoadState] = useState<LoadState>(supportsObserver ? "idle" : "loading");
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // IntersectionObserver triggers the load when element is within 200px of viewport
  useEffect(() => {
    if (!supportsObserver || loadState !== "idle") return;

    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setLoadState("loading");
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [supportsObserver, loadState]);

  const handleLoad = useCallback(() => setLoadState("loaded"), []);
  const handleError = useCallback(() => setLoadState("error"), []);

  const wrapperStyle: React.CSSProperties = {
    position: "relative",
    overflow: "hidden",
    width: width ?? "100%",
    height: height ?? "auto",
    borderRadius: "inherit",
    ...style,
  };

  const shouldRenderImg = loadState === "loading" || loadState === "loaded";

  return (
    <div ref={containerRef} className={className} style={wrapperStyle} aria-label={alt}>
      {/* Shimmer placeholder – visible while idle or loading */}
      {loadState !== "loaded" && loadState !== "error" && (
        <div className="lazy-image-shimmer" style={{ width: "100%", height: "100%" }} aria-hidden="true" />
      )}

      {/* Error placeholder */}
      {loadState === "error" && (
        <div className="lazy-image-error" aria-label={`Failed to load: ${alt}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
            <path d="M3 16l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" opacity="0.4" />
          </svg>
        </div>
      )}

      {/* Actual image – rendered once loading begins, fades in on load */}
      {shouldRenderImg && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          width={width}
          height={height}
          onLoad={handleLoad}
          onError={handleError}
          className="lazy-image-img"
          style={{ opacity: loadState === "loaded" ? 1 : 0 }}
          {...rest}
        />
      )}
    </div>
  );
}

export default LazyImage;
