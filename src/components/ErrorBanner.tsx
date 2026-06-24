import { AlertCircle } from 'lucide-react';

interface Props {
  title: string;
  detail: string;
}

export default function ErrorBanner({ title, detail }: Props) {
  return (
    <div
      className="mx-3 mt-3 flex items-start gap-3 rounded-lg border border-destructive/35 bg-destructive/10 px-4 py-3 text-destructive shadow-sm sm:mx-5 lg:mx-8"
      role="alert"
    >
      <AlertCircle aria-hidden="true" size={20} strokeWidth={2.25} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <strong className="block text-sm font-semibold">{title}</strong>
        <p className="mt-1 break-words text-sm leading-6 opacity-90">{detail}</p>
      </div>
    </div>
  );
}
