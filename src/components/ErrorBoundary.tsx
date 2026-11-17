import { Component, ErrorInfo, ReactNode } from 'react';
import { Download, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { ThemeMode } from '../types';
import { StorageBackendKind, StorageHealth } from '../domain/storage';
import {
  emergencyDeleteLocalDatabase,
  exportQuarantinedEntriesFromDefaultDb,
  getActiveStorageStatus,
} from '../infrastructure/storage/indexedDbAdapter';

export interface ErrorBoundaryProps {
  children: ReactNode;
  level?: 'root' | 'section';
  sectionName?: string;
  theme?: ThemeMode;
  storageBackend?: StorageBackendKind;
  storageHealth?: StorageHealth;
  onReset?: () => void;
  onEmergencyReset?: () => Promise<void> | void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  isWiping: boolean;
  quarantineStatus?: string;
}

/**
 * Multi-level React Error Boundary for Onyx-Aura / Nailix.
 * - level="root": Protects the entire tree, dynamically reflects actual storage engine/health
 *   (IndexedDB vs Degraded vs Memory Only, L-01), offers emergency reset (L-06),
 *   and allows exporting quarantined raw records before wiping (N-03).
 * - level="section": Isolates [SIM] or heavy sections cleanly.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    isWiping: false,
  };

  public static getDerivedStateFromError(): { hasError: boolean } {
    return {
      hasError: true,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(
      `[ErrorBoundary:${this.props.level || 'section'}${
        this.props.sectionName ? `:${this.props.sectionName}` : ''
      }]`,
      error,
      errorInfo.componentStack
    );
  }

  private handleReset = (): void => {
    this.setState({ hasError: false });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleFullReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleExportQuarantine = (): void => {
    const run = async () => {
      const dump = await exportQuarantinedEntriesFromDefaultDb();
      if (!dump || Object.keys(dump).length === 0) {
        this.setState({ quarantineStatus: 'Записей в карантине не найдено.' });
        return;
      }
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nailix-quarantine-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.setState({ quarantineStatus: 'Архив карантина выгружен (.json).' });
    };
    void run().catch(() => {
      this.setState({ quarantineStatus: 'Не удалось выгрузить карантин.' });
    });
  };

  private handleEmergencyWipe = (): void => {
    this.setState({ isWiping: true });
    const exec = async () => {
      try {
        if (this.props.onEmergencyReset) {
          await this.props.onEmergencyReset();
        } else {
          await emergencyDeleteLocalDatabase();
        }
      } finally {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }
    };
    void exec().catch(() => {
      this.setState({ isWiping: false });
    });
  };

  public render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { level = 'section', sectionName, theme = 'dark' } = this.props;
    const isDark = theme === 'dark';

    const activeStatus = getActiveStorageStatus();
    const backend = this.props.storageBackend ?? activeStatus.backend;
    const health = this.props.storageHealth ?? activeStatus.health;

    if (level === 'root') {
      const storageNote =
        backend === 'memory' || health === 'memory_only'
          ? 'Локальное хранилище сейчас работает во временном режиме памяти (данные этой вкладки не записаны на диск).'
          : health === 'degraded'
          ? 'База IndexedDB работает с частичным сбоем записи: часть недавних изменений может оставаться только в памяти этой вкладки.'
          : 'Ваши локальные данные (записи, отзывы, чат, избранное и точки карты) находятся в базе IndexedDB этого браузера.';

      return (
        <div
          className={`min-h-screen flex items-center justify-center p-6 ${
            isDark ? 'bg-[#07080e] text-[#edeef2]' : 'bg-[#f8f7f4] text-[#1a1e29]'
          }`}
        >
          <div
            className={`max-w-lg w-full rounded-2xl border p-8 text-center shadow-2xl ${
              isDark
                ? 'bg-[#0d101b]/95 border-cyan-500/30 shadow-cyan-950/30'
                : 'bg-white border-amber-500/30 shadow-amber-900/10'
            }`}
          >
            <div
              className={`mx-auto mb-5 w-14 h-14 rounded-2xl flex items-center justify-center border ${
                isDark
                  ? 'bg-cyan-500/10 border-cyan-400/30 text-cyan-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-600'
              }`}
            >
              <ShieldAlert className="w-7 h-7" />
            </div>

            <h1 className="font-display text-xl font-semibold tracking-wide mb-2">
              Салон временно на паузе
            </h1>
            <p className={`text-sm leading-relaxed mb-6 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Возникла непредвиденная ошибка интерфейса. {storageNote}
            </p>

            {this.state.quarantineStatus && (
              <p className="text-xs font-mono text-amber-300 mb-3">
                {this.state.quarantineStatus}
              </p>
            )}

            <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center">
              <button
                type="button"
                onClick={this.handleReset}
                className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${
                  isDark
                    ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                    : 'border-amber-500/40 bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                Попробовать восстановить
              </button>
              <button
                type="button"
                onClick={this.handleFullReload}
                className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${
                  isDark
                    ? 'border-white/15 bg-white/5 text-gray-200 hover:bg-white/10'
                    : 'border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Обновить страницу
              </button>
              <button
                type="button"
                onClick={this.handleExportQuarantine}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-amber-500/40 bg-amber-950/30 text-amber-200 hover:bg-amber-950/50 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Экспорт карантина (.json)
              </button>
              <button
                type="button"
                disabled={this.state.isWiping}
                onClick={this.handleEmergencyWipe}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border border-red-500/40 bg-red-950/30 text-red-200 hover:bg-red-950/50 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {this.state.isWiping ? 'Очищаем...' : 'Сбросить локальные данные'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        role="alert"
        className={`max-w-3xl mx-auto my-6 rounded-2xl border p-6 text-center backdrop-blur-md transition-colors ${
          isDark
            ? 'bg-[#0d101b]/85 border-cyan-500/25 text-[#edeef2]'
            : 'bg-white/90 border-amber-500/30 text-[#1a1e29]'
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center border ${
              isDark
                ? 'bg-cyan-500/10 border-cyan-400/30 text-cyan-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-600'
            }`}
          >
            <ShieldAlert className="w-5 h-5" />
          </div>

          <div>
            <h2 className="font-display text-base font-semibold tracking-wide">
              {sectionName ? `Секция «${sectionName}» отдохнёт пару секунд` : 'Секция временно недоступна'}
            </h2>
            <p className={`mt-1 text-xs sm:text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Произошёл локальный сбой в этом модуле. Остальные разделы салона продолжают работать в штатном режиме.
            </p>
          </div>

          <button
            type="button"
            onClick={this.handleReset}
            className={`mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
              isDark
                ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                : 'border-amber-500/40 bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Перезагрузить секцию
          </button>
        </div>
      </div>
    );
  }
}
