/**
 * Editorial ornament in place of illustrations: a grid-paper panel with thin concentric rings.
 * Keeps the old `Art` call signature so existing layouts still position it.
 */
export function Art({
  alt,
  className = '',
  fill = true,
}: {
  name?: string;
  widths?: number[];
  sizes?: string;
  alt: string;
  className?: string;
  priority?: boolean;
  avif?: boolean;
  fill?: boolean;
}) {
  return (
    <div
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={`grid-paper overflow-hidden ${fill ? 'absolute inset-0 size-full' : ''} ${className}`}
    >
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {[520, 360, 200].map((d) => (
          <span key={d} className="rings absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: d, height: d }} />
        ))}
        <span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1d1d1d]" />
      </div>
    </div>
  );
}
