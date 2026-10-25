import { Fragment } from "react";
import { COPY } from "../../lib/copy";
import { ButtonLink, Eyebrow, Lead, Muted, Section, Standout } from "./primitives";
import { INVITE_PATH, JOIN_PATH, useSignedIn } from "./use-member-cta";

export { JOIN_PATH };

const H = COPY.home;

const H2 = "mb-5 mt-3 text-[clamp(35px,4vw,55px)] font-black leading-[1.12] tracking-[-0.04em] text-fg";
const H3 = "text-[23px] font-bold tracking-[-0.02em]";

function PhoneMock() {
  const p = H.phone;
  return (
    <div className="relative flex flex-col items-center">
      <div
        aria-hidden="true"
        className="w-[310px] max-w-full rounded-[44px] border-[9px] border-[#2b3544] bg-[#101722] p-5 shadow-phone md:rotate-[5deg]"
      >
        <div className="mx-auto -mt-[11px] mb-[30px] h-5 w-[88px] rounded-[20px] bg-[#060a10]" />
        <div className="flex items-center justify-between text-[23px] font-black">
          <span>{p.title}</span>
          <span className="h-[9px] w-[9px] rounded-full bg-lime" />
        </div>
        <p className="my-[13px] text-[13px] text-muted">{p.sub}</p>
        <div className="mt-7 rounded-2xl border border-[#466944] bg-[#1c2b23] p-[22px]">
          <span className="text-xs font-extrabold uppercase leading-[1.55] tracking-[0.08em] text-lime">
            <span aria-hidden="true">●</span> {p.badge}
          </span>
          <strong className="my-[10px] block text-[25px] font-bold leading-[1.55]">{p.status}</strong>
          <span className="text-[13px] text-[#c4d4c9]">{p.ends}</span>
          <div className="mt-4 rounded-[10px] bg-lime p-[13px] text-center font-[850] text-[#10150c]">{p.confirm}</div>
          <div className="mt-2 rounded-[10px] bg-[#293747] p-[13px] text-center font-[850] text-[#f3f5f8]">{p.update}</div>
        </div>
        <dl className="text-[13px]">
          {p.rows.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-[#2a3544] py-[13px] text-[#bdc7d3]">
              <dt>{k}</dt>
              <dd className="font-bold text-fg">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="absolute inset-x-0 -bottom-8 text-center text-xs uppercase tracking-wide text-muted">{H.hero.mockLabel}</p>
    </div>
  );
}

export function Hero() {
  const h = H.hero;
  return (
    <section id="top" className="scroll-mt-20 overflow-hidden border-b border-[#202a37] bg-hero">
      <div className="mx-auto grid max-w-page items-center gap-10 px-[26px] pb-[50px] pt-[50px] md:min-h-[690px] md:grid-cols-[1.06fr_.94fr] md:pb-[70px] md:pt-[65px]">
        <div>
          <Eyebrow>{h.eyebrow}</Eyebrow>
          <h1 className="mb-[25px] mt-[15px] text-[clamp(48px,6vw,79px)] font-black leading-[1.06] tracking-[-0.055em] text-fg">
            {h.titleA}
            <span className="text-lime">{h.titleB}</span>
          </h1>
          <Lead className="my-5">{h.lead}</Lead>
          <Muted className="my-4 max-w-[560px]">{h.body}</Muted>
          <div className="mt-[30px] flex flex-wrap gap-[13px]">
            <ButtonLink to={JOIN_PATH}>{h.join}</ButtonLink>
            <ButtonLink to="/#how" outline>
              {h.how}
            </ButtonLink>
          </div>
          <p className="my-[13px] text-[13px] text-[#b0bdcc]">{h.micro}</p>
        </div>
        <PhoneMock />
      </div>
    </section>
  );
}

function Intro({
  eyebrow,
  title,
  body,
  lime,
}: {
  eyebrow: string;
  title: readonly string[];
  body?: string;
  lime?: boolean;
}) {
  return (
    <div className="text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className={H2}>
        {title.map((line, i) => (
          <Fragment key={line}>
            {i > 0 && <br />}
            {lime && i === title.length - 1 ? <span className="text-lime">{line}</span> : line}
          </Fragment>
        ))}
      </h2>
      {body && <Muted className="mx-auto max-w-[670px]">{body}</Muted>}
    </div>
  );
}

export function TodayVsLoop() {
  const w = H.why;
  return (
    <Section id="why">
      <Intro eyebrow={w.eyebrow} title={w.title} body={w.body} lime />
      <div className="mt-[52px] grid gap-[55px] md:grid-cols-2">
        <div className="rounded-[20px] border border-[#4a3e45] bg-[#1c171f] p-7">
          <h3 className={`${H3} mb-3 text-[#ffb4bb]`}>{w.todayTitle}</h3>
          <ul>
            {w.today.map((t) => (
              <li key={t} className="mt-[13px] border-t border-[#ffffff20] py-[13px] text-[#c4cdd7]">
                <span aria-hidden="true" className="mr-2 text-red">
                  ✕
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[20px] border border-[#4b7542] bg-[#15221b] p-7">
          <h3 className={`${H3} mb-3 text-lime`}>{w.loopTitle}</h3>
          <ul>
            {w.loop.map((t) => (
              <li key={t} className="mt-[13px] border-t border-[#ffffff20] py-[13px] text-[#c4cdd7]">
                <span aria-hidden="true" className="mr-2 text-lime">
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

export function HowItWorks() {
  const s = H.how;
  return (
    <Section id="how" dark>
      <Intro eyebrow={s.eyebrow} title={s.title} body={s.body} />
      <ol className="mt-[45px] grid gap-4 md:grid-cols-3">
        {s.steps.map((st) => (
          <li key={st.n} className="rounded-[18px] border border-[#344354] bg-[#121a26] px-[25px] pb-[25px] pt-[31px]">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-lime">
              {st.n} / {st.tag}
            </p>
            <h3 className={`${H3} mb-[15px] mt-[13px] text-fg`}>{st.title}</h3>
            <Muted className="mb-4">{st.text}</Muted>
          </li>
        ))}
      </ol>
      <Standout>{s.closing}</Standout>
    </Section>
  );
}

export function LiveAndRadar() {
  const r = H.radar;
  return (
    <Section id="radar">
      <Intro eyebrow={r.eyebrow} title={r.title} />
      <div className="mt-11 grid items-center gap-[15px] md:grid-cols-[1fr_90px_1fr]">
        <div className="min-h-[254px] rounded-3xl border border-[#354556] bg-[#141d2a] p-8">
          <p className="text-xs font-[850] uppercase tracking-[0.12em] text-lime">{r.liveBadge}</p>
          <h3 className="my-3 text-[26px] font-bold leading-[1.55] tracking-[-0.02em] text-fg">{r.liveTitle}</h3>
          <Muted>{r.liveText}</Muted>
        </div>
        <div aria-hidden="true" className="rotate-90 text-center text-[45px] text-lime md:rotate-0">
          ↔
        </div>
        <div className="min-h-[254px] rounded-3xl border border-[#3e4a6b] bg-[#161b2b] p-8">
          <p className="text-xs font-[850] uppercase leading-[19px] tracking-[0.12em] text-indigo">{r.radarLabel}</p>
          <span className="mt-2.5 inline-block rounded-full border border-[#3e4a6b] px-3 py-1 text-xs font-[850] uppercase leading-[18px] tracking-[0.12em] text-indigo">
            {r.radarBadge}
          </span>
          <h3 className="my-3 text-[26px] font-bold leading-[1.55] tracking-[-0.02em] text-fg">{r.radarTitle}</h3>
          <Muted>{r.radarText}</Muted>
        </div>
      </div>
      <Muted className="mx-auto mb-4 mt-[25px] max-w-[670px] text-center text-sm leading-[25px]">{r.note}</Muted>
    </Section>
  );
}

function InviteLink({ outline, guestLabel }: { outline?: boolean; guestLabel: string }) {
  const signedIn = useSignedIn();
  const to = signedIn ? INVITE_PATH : JOIN_PATH;
  const label = signedIn ? H.rewards.ctaIn : guestLabel;
  return (
    <ButtonLink to={to} outline={outline}>
      {label} →
    </ButtonLink>
  );
}

export function Rewards() {
  const r = H.rewards;
  return (
    <Section id="rewards" dark>
      <Intro eyebrow={r.eyebrow} title={r.title} body={r.body} lime />
      <div className="mt-[42px] grid gap-5 md:grid-cols-2">
        <div className="rounded-[23px] border border-[#3c4a58] bg-reward-grad p-[35px]">
          <Eyebrow compact>{r.foundingEyebrow}</Eyebrow>
          <h3 className={`${H3} my-[10px] text-fg`}>{r.foundingTitle}</h3>
          <ul className="mt-4 space-y-2">
            {r.pools.map((p) => (
              <li key={p.title} className="flex items-baseline gap-3">
                <span className="text-[clamp(38px,5vw,56px)] font-black leading-none tracking-[-0.04em] text-fg">
                  {p.big}
                </span>
                <span className="font-[750] text-fg">{p.title}</span>
              </li>
            ))}
          </ul>
          <Muted className="mt-4">{r.foundingText}</Muted>
          <p className="my-[13px] text-xs leading-[1.65] text-[#99a8b7]">{r.disclaimer}</p>
          <div className="mt-[23px] border-t border-[#ffffff25] pt-5">
            <InviteLink outline guestLabel={r.ctaOutFounding} />
          </div>
        </div>
        <div className="rounded-[23px] border border-[#3c4a58] bg-reward-grad p-[35px]">
          <Eyebrow compact>{r.exampleEyebrow}</Eyebrow>
          <h3 className={`${H3} my-[10px] text-fg`}>{r.exampleTitle}</h3>
          <Muted className="mt-4">{r.example}</Muted>
          <div className="my-[30px] flex flex-wrap items-center gap-4">
            {r.persons.map((p, i) => (
              <Fragment key={p.name}>
                {i > 0 && (
                  <span aria-hidden="true" className="text-[30px] font-black text-lime">
                    +
                  </span>
                )}
                <div className="min-w-[150px] flex-1 rounded-[17px] border border-[#34475b] bg-[#1d2a38] p-[22px] text-center">
                  <span aria-hidden="true">👤</span>
                  <p className="text-[23px] font-bold">{p.name}</p>
                  <p className="text-[30px] font-black text-lime">{p.amount}</p>
                  <p className="text-xs text-[#99a8b7]">{p.caption}</p>
                </div>
              </Fragment>
            ))}
          </div>
          <p className="mt-4 text-muted">
            <strong className="font-bold text-lime">{r.inviteMany}</strong>
            {r.inviteManyRest}
          </p>
          {r.exampleNotes.map((n) => (
            <p key={n} className="mt-[14px] border-l-[3px] border-lime pl-4 text-sm text-[#bec8d5]">
              {n}
            </p>
          ))}
          <div className="mt-[23px] border-t border-[#ffffff25] pt-5">
            <p className="mb-4 text-muted">
              <strong className="font-bold text-fg">{r.invitePrompt}</strong>
              <br />
              {r.invitePromptRest}
            </p>
            <InviteLink guestLabel={r.ctaOut} />
          </div>
        </div>
      </div>
    </Section>
  );
}

export function NetworkLoop() {
  const n = H.network;
  return (
    <Section id="network">
      <Intro eyebrow={n.eyebrow} title={n.title} body={n.body} />
      <ol className="my-[45px] grid grid-cols-2 gap-3 md:grid-cols-4">
        {n.steps.map((s, i) => (
          <li
            key={s}
            className="relative rounded-2xl border border-[#435266] bg-[#17202d] p-[23px] text-center font-[750]"
          >
            <span className="sr-only">{i + 1}. </span>
            {s}
            {i < n.steps.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute -right-[11px] top-1/2 hidden -translate-y-1/2 text-lime md:block"
              >
                →
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="mb-4 text-center font-[850] text-lime">{n.closing}</p>
    </Section>
  );
}

export function FinalCta() {
  const f = H.final;
  return (
    <Section id="join" line>
      <div className="rounded-[30px] border border-[#425d4c] bg-cta-grad px-[30px] py-[68px] text-center">
        <Eyebrow>{f.eyebrow}</Eyebrow>
        <h2 className={`${H2} mx-auto mb-[22px] mt-[14px] max-w-[760px]`}>
          {f.title[0]}
          <br />
          {f.title[1]}
          <br />
          <span className="text-lime">{f.title[2]}</span>
        </h2>
        <Muted className="mx-auto mb-7 max-w-[630px]">{f.body}</Muted>
        <ButtonLink to={JOIN_PATH}>{COPY.primary} →</ButtonLink>
      </div>
      <p className="mx-auto mt-5 max-w-[900px] text-center text-xs text-[#99a8b7]">{f.disclaimer}</p>
    </Section>
  );
}
