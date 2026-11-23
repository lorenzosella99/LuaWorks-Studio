import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AI Workbench: erro de renderização recuperado:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, color: '#eee', background: '#101110', fontFamily: 'Manrope, sans-serif' }}>
          <section style={{ width: 'min(440px, 100%)', padding: 24, border: '1px solid #343934', borderRadius: 16, background: '#191c19', textAlign: 'center' }}>
            <h1 style={{ fontSize: 20 }}>O Workbench encontrou um erro</h1>
            <p style={{ color: '#aaa', fontSize: 13, lineHeight: 1.6 }}>A interface foi protegida para evitar a tela preta. Você pode tentar abrir novamente sem perder suas conversas salvas.</p>
            <button type="button" onClick={() => window.location.reload()} style={{ padding: '10px 16px', border: 0, borderRadius: 9, color: '#17210f', background: '#d9f99d', fontWeight: 700, cursor: 'pointer' }}>Reabrir Workbench</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker indisponível:', error));
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
