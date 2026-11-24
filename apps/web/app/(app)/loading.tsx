// Shown the instant a link is clicked, while the next page renders on the server: the click answers
// right away instead of the old page sitting still.
export default function Loading() {
  return (
    <div className="h-full overflow-hidden px-3 pt-6 sm:px-6" aria-busy="true" aria-label="Loading">
      <div className="mx-auto max-w-[1100px]">
        <div className="skel h-4 w-40 rounded" />
        <div className="skel mt-3 h-8 w-80 max-w-full rounded-lg" />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((c) => (
            <div key={c} className="rounded-2xl border border-ink/[0.06] p-3">
              {[0, 1, 2, 3, 4].map((r) => (
                <div key={r} className="flex items-center gap-3 py-2.5">
                  <div className="skel size-10 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <div className="skel h-3.5 w-2/3 rounded" />
                    <div className="skel mt-2 h-3 w-1/2 rounded" />
                  </div>
                  <div className="skel h-4 w-14 rounded" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
