import { AlertCircle, RefreshCw, X } from 'lucide-react';

interface Props {
  title: string;
  detail: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}

export default function ErrorBanner({ title, detail, onDismiss, onRetry }: Props) {
  return (
    <div
      className="relative mx-3 mt-3 flex animate-fade-up items-start gap-3 rounded-[1.2rem] bg-destructive/10 px-4 py-3 pr-12 text-destructive shadow-[inset_0_0_0_1px_hsl(var(--destructive)/0.24),0_12px_32px_hsl(var(--destructive)/0.08)] backdrop-blur sm:mx-5 lg:mx-8"
      role="alert"
    >
      <AlertCircle aria-hidden="true" size={20} strokeWidth={2.25} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <strong className="block text-sm font-semibold">{title}</strong>
        <p className="mt-1 break-words text-sm leading-6 opacity-90">{detail}</p>
        {onRetry && (
          <div className="mt-2">
            <button
              type="button"
              className="soft-action inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium"
              aria-label="重试"
              onClick={onRetry}
            >
              <RefreshCw aria-hidden="true" size={12} strokeWidth={2.25} />
              重试
            </button>
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          className="soft-action absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full"
          aria-label="关闭"
          onClick={onDismiss}
        >
          <X aria-hidden="true" size={14} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}
