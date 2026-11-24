// Re-mounted on every navigation (unlike layout.tsx), so each page eases in instead of snapping in.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-in h-full">{children}</div>;
}
