interface Props {
  message?: string;
}

export default function LoadingIndicator({ message = '正在加载...' }: Props) {
  return (
    <div className="loadingIndicator">
      <div className="loadingSpinner">
        <div></div>
        <div></div>
        <div></div>
      </div>
      <span>{message}</span>
    </div>
  );
}
