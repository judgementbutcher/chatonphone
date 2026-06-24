import { AlertCircle } from 'lucide-react';

interface Props {
  title: string;
  detail: string;
}

export default function ErrorBanner({ title, detail }: Props) {
  return (
    <div className="errorBanner" role="alert">
      <div className="errorIcon">
        <AlertCircle aria-hidden="true" size={18} strokeWidth={2.25} />
      </div>
      <div className="errorContent">
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}
