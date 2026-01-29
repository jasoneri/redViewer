interface DragRegionProps {
  children?: React.ReactNode;
}

export function DragRegion({ children }: DragRegionProps) {
  return (
    <div
      data-tauri-drag-region
      className="h-10 flex items-center justify-center select-none cursor-move"
    >
      {children}
    </div>
  );
}
