import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { isChunkLoadError, recoverFromChunkError } from '@/utils/recoverFromChunkError';
import { useLanguage } from '@/context/LanguageContext';

interface Props {
  children: ReactNode;
  /** Rótulo opcional da área protegida, ajuda no log. */
  area?: string;
  /** Fallback customizado. Se ausente, usa a tela padrão. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
}

/** Tela de recuperação. Função à parte para poder usar o idioma (a classe não pode). */
const ErrorFallback: React.FC<{ isChunkError: boolean; error: Error | null; onReset: () => void }> = ({
  isChunkError,
  error,
  onReset,
}) => {
  const { t } = useLanguage();
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-5">
          <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="font-display text-xl font-bold mb-2">
          {isChunkError ? t('ui.err.newVersion') : t('ui.err.generalTitle')}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {isChunkError ? t('ui.err.updated') : t('ui.err.body')}
        </p>
        {error && (
          <pre className="text-left text-xs bg-secondary/40 rounded-lg p-3 mb-6 overflow-auto max-h-32 text-red-600 dark:text-red-400">
            {error.name}: {error.message}
          </pre>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={onReset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition"
          >
            <RefreshCw className="w-4 h-4" /> {t('ui.retry')}
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border font-medium hover:bg-secondary transition"
          >
            <Home className="w-4 h-4" /> {t('ui.home')}
          </a>
        </div>
      </div>
    </div>
  );
};

/**
 * Captura erros de renderização em qualquer componente filho e mostra
 * uma tela de recuperação amigável em vez de quebrar a página inteira.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, isChunkError: false };

  static isChunk(error: Error) {
    return error.name === 'ChunkLoadError' || isChunkLoadError(error.message);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, isChunkError: ErrorBoundary.isChunk(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`❌ [ErrorBoundary${this.props.area ? ` · ${this.props.area}` : ''}]`, error, info.componentStack);
    // PWA deploy: old SW serves stale HTML with old chunk hashes → 404 on import.
    // Limpa o cache do SW e recarrega de forma limpa (com proteção contra loop).
    if (ErrorBoundary.isChunk(error)) {
      void recoverFromChunkError();
    }
  }

  handleReset = () => {
    if (this.state.isChunkError) {
      void recoverFromChunkError();
    } else {
      this.setState({ hasError: false, error: null, isChunkError: false });
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <ErrorFallback
        isChunkError={this.state.isChunkError}
        error={this.state.error}
        onReset={this.handleReset}
      />
    );
  }
}

export default ErrorBoundary;
