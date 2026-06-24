interface Props {
  title: string;
  detail: string;
}

export default function ErrorBanner({ title, detail }: Props) {
  return (
    <div className="errorBanner" role="alert">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
