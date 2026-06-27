import * as Dialog from '@radix-ui/react-dialog';
import { X, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface ImageLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: Array<{ src: string; alt: string }>;
  initialIndex: number;
}

export default function ImageLightbox({ open, onOpenChange, images, initialIndex }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [open, initialIndex]);

  const currentImage = images[currentIndex];

  // Defensive: an empty image set (or an out-of-range index after the list
  // shrinks) leaves currentImage undefined. Bail before the render reads
  // currentImage.src, which otherwise throws and tears down the whole tree.
  const hasImage = Boolean(currentImage);

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((prev) => Math.min(Math.max(prev + delta, 0.5), 4));
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'IMG') {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: position.x,
        posY: position.y
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!isDragging) {
      return;
    }

    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    setPosition({
      x: dragStartRef.current.posX + deltaX,
      y: dragStartRef.current.posY + deltaY
    });
  }

  function handlePointerUp(e: React.PointerEvent) {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function handlePrevious() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }

  function handleNext() {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentIndex, images.length]);

  function handleDownload() {
    if (!currentImage) {
      return;
    }
    const link = document.createElement('a');
    link.href = currentImage.src;
    link.download = currentImage.alt || 'image';
    link.click();
  }

  if (!hasImage) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-overlay-in fixed inset-0 z-[200] bg-black/85 backdrop-blur-md" />
        <Dialog.Content
          className="fixed inset-0 z-[201] flex items-center justify-center outline-none"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              onOpenChange(false);
            }
          }}
        >
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/80"
              aria-label="下载图片"
              onClick={handleDownload}
            >
              <Download aria-hidden="true" size={18} strokeWidth={2.25} />
            </button>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/80"
                aria-label="关闭"
              >
                <X aria-hidden="true" size={18} strokeWidth={2.25} />
              </button>
            </Dialog.Close>
          </div>

          {images.length > 1 && (
            <>
              {currentIndex > 0 && (
                <button
                  type="button"
                  className="absolute left-4 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/80"
                  aria-label="上一张"
                  onClick={handlePrevious}
                >
                  <ChevronLeft aria-hidden="true" size={24} strokeWidth={2.25} />
                </button>
              )}
              {currentIndex < images.length - 1 && (
                <button
                  type="button"
                  className="absolute right-4 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/80"
                  aria-label="下一张"
                  onClick={handleNext}
                >
                  <ChevronRight aria-hidden="true" size={24} strokeWidth={2.25} />
                </button>
              )}
            </>
          )}

          <div
            ref={containerRef}
            className="relative flex h-full w-full touch-none items-center justify-center overflow-hidden p-16"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            <img
              src={currentImage.src}
              alt={currentImage.alt}
              className="max-h-full max-w-full select-none object-contain"
              draggable={false}
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transition: isDragging ? 'none' : 'transform 0.2s ease'
              }}
            />
          </div>

          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-sm text-white backdrop-blur-sm">
              {currentIndex + 1} / {images.length}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
