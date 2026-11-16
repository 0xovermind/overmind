import { Reveal } from './reveal';

/** Overmind's own X account. */
export const X_URL = 'https://x.com/0xovermind';
/** The Overmind community on Telegram . */
export const TG_URL = 'https://t.me/overmindrh';

/** The one content width every landing section uses. */
export const WRAP = 'mx-auto w-full max-w-7xl px-4 md:px-8';

/** Section heading: left-aligned title and a short line under it, with an optional element on the right. */
export function SectionHead({ title, sub, aside }: { title: string; sub: string; aside?: React.ReactNode }) {
  return (
    <Reveal className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="display max-w-[20ch] text-[40px] md:text-[70px]">{title}</h2>
        <p className="mt-6 max-w-[54ch] text-[15px] leading-[1.4] text-ink md:text-[18px]">{sub}</p>
      </div>
      {aside && <div className="self-start md:shrink-0 md:self-auto">{aside}</div>}
    </Reveal>
  );
}
