import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErrorBoundary } from '../components/ErrorBoundary';

function Boom(): React.ReactElement {
  throw new Error('Simulated CryptoCloud failure');
}

describe('ErrorBoundary resilience & truthful root recovery (K-06 / L-01 / L-06)', () => {
  it('renders children transparently when no error occurs', () => {
    const html = renderToStaticMarkup(
      <ErrorBoundary level="section" sectionName="Галерея">
        <div>Salon Ready</div>
      </ErrorBoundary>
    );
    expect(html).toContain('Salon Ready');
  });

  it('produces minimal hasError fallback state without leaking raw error text', () => {
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
    boundary.state = { hasError: true, isWiping: false };

    const fallbackHtml = renderToStaticMarkup(boundary.render() as React.ReactElement);

    expect(fallbackHtml).toContain('CryptoCloud Swarm [SIM]');
    expect(fallbackHtml).toContain('Перезагрузить секцию');

    consoleSpy.mockRestore();
  });

  it('renders root fallback screen with IndexedDB notice and 3rd emergency data reset button (L-06)', () => {
    const boundary = new ErrorBoundary({
      level: 'root',
      theme: 'light',
      storageBackend: 'indexeddb',
      storageHealth: 'ok',
      children: null,
    });
    boundary.state = { hasError: true, isWiping: false };

    const fallbackHtml = renderToStaticMarkup(boundary.render() as React.ReactElement);

    expect(fallbackHtml).toContain('Салон временно на паузе');
    expect(fallbackHtml).toContain('Попробовать восстановить');
    expect(fallbackHtml).toContain('Обновить страницу');
    expect(fallbackHtml).toContain('Сбросить локальные данные');
    expect(fallbackHtml).toContain('IndexedDB');
  });

  it('reflects dynamic memory_only and degraded storage health honestly in root fallback (L-01)', () => {
    const memoryBoundary = new ErrorBoundary({
      level: 'root',
      storageBackend: 'memory',
      storageHealth: 'memory_only',
      children: null,
    });
    memoryBoundary.state = { hasError: true, isWiping: false };
    const memHtml = renderToStaticMarkup(memoryBoundary.render() as React.ReactElement);
    expect(memHtml).toContain('временном режиме памяти');

    const degradedBoundary = new ErrorBoundary({
      level: 'root',
      storageBackend: 'indexeddb',
      storageHealth: 'degraded',
      children: null,
    });
    degradedBoundary.state = { hasError: true, isWiping: false };
    const degHtml = renderToStaticMarkup(degradedBoundary.render() as React.ReactElement);
    expect(degHtml).toContain('частичным сбоем записи');
  });
});
