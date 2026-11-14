import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErrorBoundary } from '../components/ErrorBoundary';

function Boom(): React.ReactElement {
  throw new Error('Simulated CryptoCloud failure');
}

describe('ErrorBoundary resilience', () => {
  it('renders children transparently when no error occurs', () => {
    const html = renderToStaticMarkup(
      <ErrorBoundary level="section" sectionName="Галерея">
        <div>Salon Ready</div>
      </ErrorBoundary>
    );
    expect(html).toContain('Salon Ready');
  });

  it('produces minimal hasError fallback state from getDerivedStateFromError without storing sensitive strings', () => {
    const derived = ErrorBoundary.getDerivedStateFromError();
    expect(derived).toEqual({
      hasError: true,
    });
  });

  it('renders section fallback screen cleanly when boundary hasError is triggered', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const boundary = new ErrorBoundary({
      level: 'section',
      sectionName: 'CryptoCloud Swarm [SIM]',
      theme: 'dark',
      children: <Boom />,
    });
    boundary.state = ErrorBoundary.getDerivedStateFromError();

    const fallbackHtml = renderToStaticMarkup(boundary.render() as React.ReactElement);

    expect(fallbackHtml).toContain('CryptoCloud Swarm [SIM]');
    expect(fallbackHtml).toContain('Перезагрузить секцию');
    expect(fallbackHtml).not.toContain('boom at line 42');

    consoleSpy.mockRestore();
  });

  it('renders truthful root fallback screen without false persistence claims when level="root"', () => {
    const boundary = new ErrorBoundary({
      level: 'root',
      theme: 'light',
      children: null,
    });
    boundary.state = ErrorBoundary.getDerivedStateFromError();

    const fallbackHtml = renderToStaticMarkup(boundary.render() as React.ReactElement);

    expect(fallbackHtml).toContain('Салон временно на паузе');
    expect(fallbackHtml).toContain('Попробовать восстановить');
    expect(fallbackHtml).toContain('Обновить страницу');
    expect(fallbackHtml).not.toContain('записи сохранены');
    expect(fallbackHtml).not.toContain('Fatal tree error');
  });
});
