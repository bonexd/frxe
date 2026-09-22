import {
  ArrowRight,
  Download,
  Globe2,
  Heart,
  Layers3,
  Monitor,
  Music2,
  Play,
  Search,
  Smartphone,
  Sparkles,
} from 'lucide-react';

const PLAYER = 'https://vitr.nont.me';
const RELEASES = 'https://github.com/voidnont/vitr/releases';

function Feature({ icon: Icon, title, copy }) {
  return <article className="nont-feature">
    <span className="nont-feature-icon"><Icon size={24} strokeWidth={1.8} /></span>
    <div><h3>{title}</h3><p>{copy}</p></div>
  </article>;
}

function PlayerPreview() {
  return <div className="nont-player-preview" aria-label="Vitr web player preview">
    <div className="preview-rail">
      <div className="preview-brand"><img src="/vitr-icon.png" alt="" /><span>vitr</span></div>
      <span className="preview-nav active" /><span className="preview-nav" /><span className="preview-nav" /><span className="preview-nav short" />
    </div>
    <div className="preview-main">
      <div className="preview-top"><span /><span /><span /></div>
      <div className="preview-hero">
        <div><small>MUSIC FLOWS DIFFERENT HERE.</small><strong>vitr.</strong><p>made by blood</p></div>
        <span className="preview-orbit" />
      </div>
      <div className="preview-label">For You</div>
      <div className="preview-cards">
        <span className="red" /><span /><span className="violet" /><span className="red-soft" /><span />
      </div>
      <div className="preview-label second">Recently Played</div>
      <div className="preview-cards compact">
        <span className="red" /><span /><span /><span className="red-soft" /><span />
      </div>
    </div>
    <div className="preview-player"><span className="preview-cover" /><div><b>Afterdark</b><small>vitr</small></div><span className="preview-line"><i /></span><button aria-label="Preview play"><Play size={17} fill="currentColor" /></button></div>
  </div>;
}

export default function App() {
  return <div className="nont-site">
    <header className="nont-header">
      <a className="nont-wordmark" href="/" aria-label="NONT home">NONT</a>
      <nav aria-label="NONT navigation">
        <a href="#features">Features</a>
        <a href="#vitr">Vitr</a>
        <a href="#download">Download</a>
      </nav>
      <a className="nont-pill light" href={PLAYER}>Open Vitr <ArrowRight size={15} /></a>
    </header>

    <main>
      <section className="nont-hero">
        <div className="nont-hero-copy">
          <span className="nont-kicker">MUSIC FOR A DIFFERENT TOMORROW</span>
          <h1>NONT</h1>
          <h2>More than music.</h2>
          <p>Listen, explore and feel. NONT is the home of Vitr — a fast, focused music player built for the way you actually listen.</p>
          <div className="nont-actions">
            <a className="nont-pill light large" href={PLAYER}>Open Vitr <ArrowRight size={17} /></a>
            <a className="nont-pill ghost large" href="#vitr">Explore <Sparkles size={16} /></a>
          </div>
          <span className="nont-mantra">LISTEN · DISCOVER · CREATE · ANYWHERE</span>
        </div>

        <div className="nont-scene" aria-hidden="true">
          <span className="nont-moon" />
          <span className="nont-mountain back" />
          <span className="nont-mountain front" />
          <span className="nont-reflection" />
        </div>
      </section>

      <section className="nont-feature-grid" id="features">
        <Feature icon={Music2} title="Massive Library" copy="Your music, recommendations and playlists in one focused place." />
        <Feature icon={Search} title="Smart Search" copy="Find songs, artists, genres and mixes without fighting the interface." />
        <Feature icon={Heart} title="Your Playlists" copy="Save favorites, build playlists and return to what matters." />
        <Feature icon={Globe2} title="All Devices" copy="Use Vitr on web, desktop and mobile with the same core experience." />
      </section>

      <section className="nont-vitr" id="vitr">
        <div className="nont-vitr-copy">
          <span className="nont-kicker">MEET VITR</span>
          <h2>A new kind of music player.</h2>
          <p>Vitr is NONT’s web music player: fast, local-first where possible, account-free and designed around music instead of clutter.</p>
          <div className="nont-actions">
            <a className="nont-pill light large" href={PLAYER}>Open Vitr <Play size={16} fill="currentColor" /></a>
            <a className="nont-pill ghost large" href={RELEASES} target="_blank" rel="noreferrer">Get the app <Download size={16} /></a>
          </div>

          <div className="nont-style-panel">
            <div><strong>Three ways to feel the music.</strong><p>Switch instantly. Same player, same functions, different atmosphere.</p></div>
            <div className="nont-style-swatches" aria-label="Vitr interface styles">
              <span className="style-swatch normal"><i /><b>Normal</b></span>
              <span className="style-swatch glass"><i /><b>Liquid Glass</b></span>
              <span className="style-swatch blood"><i /><b>Blood Crystallized</b></span>
            </div>
          </div>
        </div>

        <div className="nont-vitr-preview"><PlayerPreview /></div>
      </section>

      <section className="nont-download" id="download">
        <div><span className="nont-kicker">AVAILABLE EVERYWHERE</span><h2>Same music. Your device.</h2></div>
        <div className="nont-platforms">
          <a href={PLAYER}><Globe2 size={18} /> Web</a>
          <a href={RELEASES} target="_blank" rel="noreferrer"><Monitor size={18} /> Windows</a>
          <a href={RELEASES} target="_blank" rel="noreferrer"><Monitor size={18} /> macOS</a>
          <a href={RELEASES} target="_blank" rel="noreferrer"><Smartphone size={18} /> Android</a>
          <a href={RELEASES} target="_blank" rel="noreferrer"><Smartphone size={18} /> iOS</a>
        </div>
      </section>
    </main>

    <footer className="nont-footer">
      <strong>NONT</strong>
      <span>© 2026 NONT. Music for a different tomorrow.</span>
      <div><a href={PLAYER}>Vitr Web</a><a href={RELEASES} target="_blank" rel="noreferrer">Releases</a></div>
    </footer>
  </div>;
}
