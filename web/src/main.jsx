import React from 'react';
import { createRoot } from 'react-dom/client';
import { isVitrWebLocation } from './site-mode.js';
import { installPageTransition } from './pageTransition.js';
import './pageTransition.css';

function Recovery({ error }) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#090909',color:'#f4f4f4',fontFamily:'Inter,system-ui,sans-serif',padding:'24px'}}>
    <section style={{width:'min(560px,100%)',border:'1px solid #2a2a2a',borderRadius:'18px',padding:'28px',background:'#111'}}>
      <small style={{letterSpacing:'.16em',opacity:.6}}>VITR RECOVERY</small>
      <h1 style={{fontSize:'28px',margin:'10px 0'}}>The app could not start.</h1>
      <p style={{opacity:.75,lineHeight:1.6}}>Reload the page first. If it keeps happening, the current build or a network dependency may be unavailable.</p>
      <pre style={{whiteSpace:'pre-wrap',wordBreak:'break-word',background:'#080808',padding:'12px',borderRadius:'10px',fontSize:'12px',opacity:.75}}>{message}</pre>
      <button onClick={() => window.location.reload()} style={{marginTop:'14px',padding:'10px 16px',borderRadius:'10px',border:0,fontWeight:700,cursor:'pointer'}}>Reload</button>
    </section>
  </main>;
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('VITR render failure', error, info); }
  render() { return this.state.error ? <Recovery error={this.state.error} /> : this.props.children; }
}

function mount(element) {
  const root = document.getElementById('root');
  if (!root) throw new Error('Root element was not found.');
  createRoot(root).render(<React.StrictMode><ErrorBoundary>{element}</ErrorBoundary></React.StrictMode>);
}

async function boot() {
  installPageTransition();
  const hostname = window.location.hostname.toLowerCase();
  const pathname = window.location.pathname.toLowerCase();
  const musicMode = isVitrWebLocation(hostname, pathname);
  const favicon = document.querySelector('link[rel="icon"]') || document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' }));

  document.title = musicMode ? 'Vitr' : 'NONT';
  favicon.href = musicMode ? '/vitr-icon.png' : '/nont-icon.svg';

  if (musicMode) {
    document.documentElement.removeAttribute('data-theme');
    const [{ default: MusicApp }] = await Promise.all([
      import('./music/VitrWebApp.tsx'),
      import('./music/music.css'),
    ]);
    mount(<MusicApp />);
    return;
  }

  const [{ default: App }] = await Promise.all([
    import('./App.jsx'),
    import('./styles.css'),
    import('./polish.css'),
  ]);
  mount(<App />);
}

boot().catch((error) => {
  console.error('VITR boot failure', error);
  try { mount(<Recovery error={error} />); }
  catch { document.body.textContent = `VITR could not start: ${error instanceof Error ? error.message : String(error)}`; }
});
