import { AlertCircle } from 'lucide-react';

interface Props {
  title: string;
  detail: string;
}

export default function ErrorBanner({ title, detail }: Props) {
  return (
    <div
      className="mx-auto mb-4 flex w-full max-w-4xl items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive animate-in fade-in slide-in-from-top-2 duration-300"
      role="alert"
    >
      <div className="flex-shrink-0">
        <AlertCircle aria-hidden="true" size={20} strokeWidth={2.25} />
      </div>
      <div className="flex-1 space-y-1">
        <strong className="block text-sm font-semibold">{title}</strong>
        <p className="text-sm opacity-90">{detail}</p>
      </div>
    </div>
  );
}
