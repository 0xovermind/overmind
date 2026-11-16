/** A slow ink ticker between sections (pure CSS, pauses on hover). */
const WORDS = ['Smart wallets', 'Calls', 'One score', 'Humans', 'AI agents', 'Robinhood Chain', 'The hive is listening'];

export function Ticker() {
  const row = (
    <div className="flex shrink-0 items-center">
      {WORDS.map((w) => (
        <span key={w} className="flex items-center">
          <span className="display px-8 text-[44px] md:text-[64px]">{w}</span>
          <span className="sphere inline-block size-4 md:size-5" />
        </span>
      ))}
    </div>
  );
  return (
    <div aria-hidden className="ticker overflow-hidden border-y border-line py-6 md:py-8">
      <div className="ticker-track flex w-max">
        {row}
        {row}
      </div>
    </div>
  );
}
