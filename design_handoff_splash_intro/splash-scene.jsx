/* princecaleb.dev splash — boot → wordmark → wipe reveal to the live site hero.
   The revealed hero is composed from the Prince Caleb design system components
   (BrandLockup, Eyebrow, Button, StatItem, SystemWindow/TranscriptLine/SystemOutcome)
   laid out in 1280x720 design space and scaled 1.5x onto the 1920x1080 stage.
   The waveform is a T-driven copy of VoiceWave's geometry so it exports frame-exact. */

const DS = window.PrinceCalebDesignSystem_ee5fad || {};
const { BrandLockup, Eyebrow, Button, StatItem, SystemWindow, TranscriptLine, SystemOutcome } = DS;

const S = 1.5; // 1280x720 design space → 1920x1080 stage
const C = {
  navy: '#0b0c0e', bg: '#fbfbfa', heading: '#0a0b0d', ink: '#17181c', inkSoft: '#41454d',
  muted: '#6e737c', accent: '#08783c', accentDark: '#62ff98',
  line: 'rgba(10,11,13,0.09)', lineStrong: 'rgba(10,11,13,0.28)', lineDark: 'rgba(255,255,255,0.09)',
};
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const MOTION = {
  enter: (start, dur) => animate({ from: 0, to: 1, start, end: start + (dur || 0.6), ease: Easing.easeOutCubic }),
  pop: (start, dur) => animate({ from: 0, to: 1, start, end: start + (dur || 0.5), ease: Easing.easeOutBack }),
  drift: (from, to, start, end) => animate({ from, to, start, end, ease: Easing.easeInOutSine }),
};

const typed = (text, T, start, cps) => text.slice(0, Math.floor(clamp((T - start) * (cps || 28), 0, text.length)));
const DesignSpace = ({ children, style }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: 1280, height: 720, transform: `scale(${S})`, transformOrigin: '0 0', ...style }}>{children}</div>
);

/* ---------- atmosphere: the hero's accent orb, plus its dark-mode twin ---------- */

function Orbs({ T, dark }) {
  const x = MOTION.drift(-26, 40, 0, 11)(T % 22);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {[[-130, -160, 730], [1400, 640, 560]].map(([l, t, s], i) => (
        <div key={i} style={{
          position: 'absolute', left: l + (i ? -x : x), top: t + (i ? x * 0.6 : -x * 0.4),
          width: s, height: s, borderRadius: '50%', filter: 'blur(120px)',
          background: dark ? C.accentDark : C.accent, opacity: dark ? 0.13 : 0.16,
        }} />
      ))}
    </div>
  );
}

function HairGrid({ o }) {
  if (o <= 0.01) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, opacity: o * 0.55,
      backgroundImage: `linear-gradient(${C.lineDark} 1px, transparent 1px), linear-gradient(90deg, ${C.lineDark} 1px, transparent 1px)`,
      backgroundSize: '96px 96px',
      maskImage: 'radial-gradient(120% 80% at 50% 46%, #000 22%, transparent 74%)',
      WebkitMaskImage: 'radial-gradient(120% 80% at 50% 46%, #000 22%, transparent 74%)',
    }} />
  );
}

/* ---------- the brand mark: one BrandLockup travelling from centre stage to the nav ---------- */

function TravellingMark({ T, CUES, settle }) {
  const g = clamp((T - (CUES.Wipe - 0.15)) / 1.25, 0, 1);
  const e = Easing.easeInOutCubic ? Easing.easeInOutCubic(g) : g;
  const size = 42 - e * 24.4;            // 42px display → 17.6px (1.1rem) in the nav
  const left = 275 + e * (40 - 275);
  const top = 300 + e * (21 - 300) + (settle / S) * e;
  const onDark = 1 - clamp((T - (CUES.Wipe + 0.95)) / 0.12, 0, 1); // flip only once the band has cleared the mark
  const tileIn = MOTION.pop(0.75, 0.7)(T);
  const wipeIn = MOTION.enter(1.15, 0.85)(T);
  const lockW = size * 1.677;

  return (
    <DesignSpace>
      <div style={{
        position: 'absolute', left, top, opacity: tileIn,
        transform: `translateY(${(1 - tileIn) * 10}px)`,
      }}>
        <div style={{ overflow: 'hidden', maxWidth: lockW + (1 - 0) * 0 + wipeIn * (size * 12) }}>
          <BrandLockup size={size + 'px'} invert={onDark > 0.5} href="#" />
        </div>
      </div>
    </DesignSpace>
  );
}

/* ---------- 01 boot ---------- */

function BootLines({ T }) {
  const lines = [
    ['> boot princecaleb.dev', 0.0],
    ['> voice agents · chatbots · automations', 0.6],
  ];
  const fade = 1 - clamp((T - 1.85) / 0.5, 0, 1);
  return (
    <DesignSpace style={{ opacity: fade }}>
      <div style={{ position: 'absolute', left: 275, top: 205, font: `500 18px/1.9 ${MONO}`, color: 'rgba(241,243,245,0.7)' }}>
        {lines.map(([txt, at], i) => (
          <div key={i}>
            {typed(txt, T, at, 34)}
            {T >= at && T < at + txt.length / 34 + 0.12 ? '▋' : ''}
          </div>
        ))}
      </div>
    </DesignSpace>
  );
}

/* ---------- 02 rule + eyebrow under the mark ---------- */

function MarkSupport({ T, CUES }) {
  const rule = MOTION.enter(CUES.Assemble + 0.1, 0.7)(T);
  const eye = MOTION.enter(CUES.Assemble + 0.45, 0.6)(T);
  const fade = 1 - clamp((T - CUES.Wipe + 0.05) / 0.45, 0, 1);
  return (
    <DesignSpace style={{ opacity: fade }}>
      <div style={{ position: 'absolute', left: 277, top: 388 }}>
        <div style={{ width: 360 * rule, height: 1, background: 'rgba(255,255,255,0.22)' }} />
        <div style={{ marginTop: 18, opacity: eye, transform: `translateY(${(1 - eye) * 8}px)`, color: C.accentDark }}>
          <Eyebrow style={{ color: C.accentDark, fontSize: '.9rem' }}>// Systems built around the way you already work</Eyebrow>
        </div>
      </div>
    </DesignSpace>
  );
}

/* ---------- the revealed site hero ---------- */

function Wave({ T, live }) {
  // VoiceWave geometry (3px bars, 20/55/85/35% heights, hairline top+bottom), driven by T
  const heights = [0.2, 0.55, 0.85, 0.35];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: '4rem',
      margin: '0 1rem', borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`,
    }}>
      {Array.from({ length: 12 }, (_, i) => {
        const base = heights[i % 4];
        const s = 1 + 0.65 * (0.5 + 0.5 * Math.sin(T * 3.4 + i * 0.9)) * live;
        return <div key={i} style={{
          width: 3, height: `${base * 100}%`, background: C.heading, borderRadius: 999,
          transform: `scaleY(${live ? s : 0.35})`, opacity: live ? 1 - 0.25 * (s - 1) : 0.2,
        }} />;
      })}
    </div>
  );
}

function SiteHero({ T, CUES }) {
  const o = clamp((T - CUES.Wipe - 0.1) / 0.7, 0, 1);
  const navItems = ['Home', 'About', 'Services', 'Builder OS', 'Projects', 'Pricing', 'Contact'];
  const eyeIn = MOTION.enter(CUES.Wipe + 0.4, 0.6)(T);
  const headIn = MOTION.enter(CUES.Wipe + 0.55, 0.9)(T);
  const leadIn = MOTION.enter(CUES.Wipe + 0.95, 0.7)(T);
  const ctaIn = MOTION.pop(CUES.Reveal + 0.1, 0.6)(T);
  const winIn = MOTION.enter(CUES.Wipe + 0.7, 1.0)(T);
  const live = clamp((T - CUES.Reveal + 0.4) / 0.7, 0, 1);
  const statsIn = MOTION.enter(CUES.Reveal + 0.45, 0.7)(T);

  return (
    <DesignSpace style={{ opacity: o }}>
      {/* sticky nav */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, minHeight: 72, display: 'flex',
        alignItems: 'center', justifyContent: 'flex-end', gap: '.25rem', padding: '0 40px',
        borderBottom: `1px solid ${C.line}`, background: 'rgba(251,251,250,0.85)', backdropFilter: 'blur(16px)',
      }}>
        {navItems.map((n, i) => {
          const a = MOTION.enter(CUES.Wipe + 0.45 + i * 0.06, 0.5)(T);
          return (
            <div key={n} style={{
              padding: '.5rem 1rem', font: `500 .95rem ${SANS}`, color: n === 'Home' ? C.accent : C.inkSoft,
              opacity: a, transform: `translateY(${(1 - a) * 6}px)`,
            }}>{n}</div>
          );
        })}
        <div style={{ marginLeft: '1rem', whiteSpace: 'nowrap', opacity: MOTION.enter(CUES.Wipe + 0.9, 0.5)(T) }}>
          <Button size="sm">Book a call</Button>
        </div>
      </div>

      {/* hero grid: copy + system window */}
      <div style={{
        position: 'absolute', left: 40, right: 40, top: 150, display: 'grid',
        gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,.95fr)', gap: '3rem', alignItems: 'center',
      }}>
        <div>
          <div style={{ opacity: eyeIn, transform: `translateY(${(1 - eyeIn) * 8}px)` }}>
            <Eyebrow>// Stop losing enquiries to missed calls and slow follow-up</Eyebrow>
          </div>
          <h1 style={{
            margin: '1rem 0 1.5rem', maxWidth: 540, font: `700 2.5rem/1.12 ${SANS}`, letterSpacing: '-0.03em',
            color: C.heading, textWrap: 'pretty', opacity: headIn, transform: `translateY(${(1 - headIn) * 16}px)`,
          }}>
            Turn more enquiries into <span style={{ color: C.accent }}>booked customers</span>, without adding more admin.
          </h1>
          <p style={{
            margin: '0 0 1.75rem', maxWidth: 520, font: `400 1.12rem/1.62 ${SANS}`, color: C.muted,
            opacity: leadIn, transform: `translateY(${(1 - leadIn) * 12}px)`,
          }}>
            I build AI voice agents, chat assistants and automations that answer quickly, capture the right details and move serious enquiries towards a booking.
          </p>
          <div style={{ display: 'flex', gap: '.75rem', whiteSpace: 'nowrap', opacity: ctaIn, transform: `scale(${0.96 + ctaIn * 0.04})`, transformOrigin: 'left center' }}>
            <Button>Book a 20-minute call</Button>
            <Button variant="outline">See client work</Button>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '2rem', opacity: statsIn, transform: `translateY(${(1 - statsIn) * 10}px)` }}>
            <StatItem value="12+" label="Years building software" />
            <StatItem value="30+" label="Projects delivered" />
            <StatItem value="98%" label="Client satisfaction" />
            <StatItem value="<48h" label="Average response" />
          </div>
        </div>

        <div style={{ opacity: winIn, transform: `translateY(${(1 - winIn) * 26}px) scale(${0.975 + winIn * 0.025})` }}>
          <SystemWindow title="Voice agent · live call" live tilt={-1.25}
                        meta={'00:' + String(6 + Math.floor(clamp(T - CUES.Wipe, 0, 30) * 3)).padStart(2, '0')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem', padding: '.9rem 1rem' }}>
              <span style={{
                display: 'grid', placeItems: 'center', width: '2.4rem', height: '2.4rem', borderRadius: '50%',
                background: C.navy, color: C.accentDark, border: '1px solid rgba(98,255,152,.48)', font: `700 .7rem/1 ${MONO}`,
              }}>PC</span>
              <div style={{ display: 'grid' }}>
                <strong style={{ color: C.heading, fontSize: '.86rem' }}>Prince’s Assistant</strong>
                <small style={{ color: C.muted, fontSize: '.75rem' }}>Answering the reception line</small>
              </div>
              <span style={{ marginLeft: 'auto', color: '#16835a', font: `600 .68rem/1 ${MONO}`, textTransform: 'uppercase' }}>
                {live > 0.5 ? 'Speaking' : 'Ready'}
              </span>
            </div>
            <Wave T={T} live={live} />
            <div style={{ opacity: MOTION.enter(CUES.Reveal + 0.45, 0.35)(T) }}>
            <TranscriptLine speaker="Agent">
              {typed('I can book that for Thursday at 10:30. Should I send the confirmation to this number?', T, CUES.Reveal + 0.55, 46)}
            </TranscriptLine>
            </div>
            <div style={{ paddingBottom: '.75rem', opacity: MOTION.enter(CUES.Reveal + 2.0, 0.5)(T) }}>
              <SystemOutcome title="Appointment held">Calendar slot reserved for 5 minutes</SystemOutcome>
            </div>
          </SystemWindow>
        </div>
      </div>
    </DesignSpace>
  );
}

/* ---------- the piece ---------- */

function SplashPiece() {
  const { T, CUES, authoredTotal } = useComposition();
  const w = clamp((T - CUES.Wipe) / 1.0, 0, 1);
  const wipe = Easing.easeInOutQuart ? Easing.easeInOutQuart(w) : w;
  const zoom = MOTION.drift(1.05, 1.0, CUES.Wipe - 0.2, CUES.Reveal + 0.4)(T);
  const settle = MOTION.drift(0, -14, CUES.Reveal, authoredTotal)(T);

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom}) translateY(${settle}px)`, transformOrigin: '50% 42%' }}>
        <Orbs T={T} dark={false} />
        <SiteHero T={T} CUES={CUES} />
      </div>

      {/* the dark intro band the site is revealed from */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: 1080, background: C.navy,
        transform: `translateY(${-wipe * 1080}px)`,
        borderBottom: wipe > 0.02 && wipe < 0.99 ? `1px solid ${C.accentDark}` : 'none',
      }}>
        <Orbs T={T} dark />
        <HairGrid o={1 - clamp((T - CUES.Wipe + 0.2) / 0.6, 0, 1)} />
        <BootLines T={T} />
        <MarkSupport T={T} CUES={CUES} />
      </div>

      <TravellingMark T={T} CUES={CUES} settle={settle} />
    </div>
  );
}

function SplashApp() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS || {});
  return (
    <React.Fragment>
      <CompositionStage width={1920} height={1080} bg={C.navy}
                        scenes={window.OM_SCENES} playback={window.OM_PLAYBACK}>
        <SplashPiece />
      </CompositionStage>
      <TweaksPanel>
        <TweakSection label="Splash" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={(v) => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

window.SplashApp = SplashApp;
