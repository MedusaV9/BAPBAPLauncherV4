import { useCallback, useEffect, useMemo, useRef, useState, useImperativeHandle } from "react";
import type React from "react";

export interface VirtualizedListProps<T> {
  items: T[];
  itemHeight: number | ((index: number) => number);
  overscan?: number;
  renderItem: (item: T, index: number, style: React.CSSProperties) => React.ReactNode;
  containerHeight?: number | string;
  className?: string;
  emptyState?: React.ReactNode;
  /** Initial scroll offset – used to restore scroll position (e.g. when switching groups). */
  initialScrollTop?: number;
  /** Fires on scroll with the current scrollTop value. */
  onScrollChange?: (scrollTop: number) => void;
  listRef?: React.Ref<{ scrollToIndex: (index: number) => void }>;
}

interface ScrollState {
  scrollTop: number;
  containerHeight: number;
}

function getItemHeight(itemHeight: number | ((index: number) => number), index: number): number {
  return typeof itemHeight === "function" ? itemHeight(index) : itemHeight;
}

function getItemOffset(
  itemHeight: number | ((index: number) => number),
  index: number
): number {
  if (typeof itemHeight === "number") {
    return index * itemHeight;
  }
  let offset = 0;
  for (let i = 0; i < index; i++) {
    offset += itemHeight(i);
  }
  return offset;
}

function getTotalHeight(
  itemHeight: number | ((index: number) => number),
  itemCount: number
): number {
  if (typeof itemHeight === "number") {
    return itemCount * itemHeight;
  }
  let total = 0;
  for (let i = 0; i < itemCount; i++) {
    total += itemHeight(i);
  }
  return total;
}

function getVisibleRange(
  scrollState: ScrollState,
  itemHeight: number | ((index: number) => number),
  itemCount: number,
  overscan: number
): { startIndex: number; endIndex: number } {
  if (itemCount === 0 || scrollState.containerHeight === 0) {
    return { startIndex: 0, endIndex: 0 };
  }

  const { scrollTop, containerHeight } = scrollState;

  let startIndex = 0;
  let endIndex = 0;

  if (typeof itemHeight === "number") {
    startIndex = Math.floor(scrollTop / itemHeight);
    endIndex = Math.ceil((scrollTop + containerHeight) / itemHeight);
  } else {
    // Variable height: scan to find visible range
    let offset = 0;
    for (let i = 0; i < itemCount; i++) {
      const h = itemHeight(i);
      if (offset + h > scrollTop && startIndex === 0 && i > 0) {
        startIndex = i;
      }
      if (offset >= scrollTop && startIndex === 0) {
        startIndex = i;
      }
      if (offset >= scrollTop + containerHeight) {
        endIndex = i;
        break;
      }
      offset += h;
    }
    if (endIndex === 0) {
      endIndex = itemCount;
    }
  }

  // Apply overscan
  startIndex = Math.max(0, startIndex - overscan);
  endIndex = Math.min(itemCount, endIndex + overscan);

  return { startIndex, endIndex };
}

const FALLBACK_MAX_ITEMS = 50;

export function VirtualizedList<T>({
  items,
  itemHeight,
  overscan = 5,
  renderItem,
  containerHeight: containerHeightProp,
  className,
  emptyState,
  initialScrollTop,
  onScrollChange,
  listRef,
}: VirtualizedListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollTopRef = useRef(initialScrollTop ?? 0);
  const [scrollState, setScrollState] = useState<ScrollState>({
    scrollTop: initialScrollTop ?? 0,
    containerHeight: 0,
  });

  const scrollToIndex = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;
    const offset = getItemOffset(itemHeight, index);
    const height = getItemHeight(itemHeight, index);
    const currentScrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;

    if (offset < currentScrollTop) {
      container.scrollTop = offset;
    } else if (offset + height > currentScrollTop + containerHeight) {
      container.scrollTop = offset + height - containerHeight;
    }
  }, [itemHeight]);

  useImperativeHandle(listRef, () => ({
    scrollToIndex,
  }), [scrollToIndex]);

  // Use ResizeObserver to measure container height
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      const height = container.clientHeight;
      setScrollState((prev) => {
        if (prev.containerHeight === height) return prev;
        return { ...prev, containerHeight: height };
      });
    };

    updateHeight();

    const observer = new ResizeObserver(() => {
      updateHeight();
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    scrollTopRef.current = scrollTop;
    setScrollState((prev) => ({ ...prev, scrollTop }));
    onScrollChange?.(scrollTop);
  }, [onScrollChange]);

  // Restore scroll position when initialScrollTop changes (e.g. group switch)
  useEffect(() => {
    if (initialScrollTop == null) return;
    const container = containerRef.current;
    scrollTopRef.current = initialScrollTop;
    setScrollState((prev) => ({ ...prev, scrollTop: initialScrollTop }));
    if (container) {
      container.scrollTop = initialScrollTop;
    }
  }, [initialScrollTop]);

  // Maintain scroll position across re-renders
  useEffect(() => {
    const container = containerRef.current;
    if (container && container.scrollTop !== scrollTopRef.current) {
      container.scrollTop = scrollTopRef.current;
    }
  });

  const itemCount = items.length;

  // Use containerHeightProp directly when it's a number, otherwise rely on ResizeObserver
  const effectiveContainerHeight =
    typeof containerHeightProp === "number" && containerHeightProp > 0
      ? containerHeightProp
      : scrollState.containerHeight;

  // Empty state
  if (itemCount === 0 && emptyState) {
    return (
      <div
        className={className}
        style={{
          height: containerHeightProp ?? "100%",
          overflow: "auto",
          position: "relative",
        }}
      >
        {emptyState}
      </div>
    );
  }

  // If container height is unresolvable (0), fall back to rendering a limited set
  const isMeasured = effectiveContainerHeight > 0;

  const totalHeight = getTotalHeight(itemHeight, itemCount);

  const { startIndex, endIndex } = isMeasured
    ? getVisibleRange(
        { scrollTop: scrollState.scrollTop, containerHeight: effectiveContainerHeight },
        itemHeight,
        itemCount,
        overscan
      )
    : { startIndex: 0, endIndex: Math.min(itemCount, FALLBACK_MAX_ITEMS) };

  const visibleItems: React.ReactNode[] = [];

  for (let i = startIndex; i < endIndex; i++) {
    const offset = getItemOffset(itemHeight, i);
    const height = getItemHeight(itemHeight, i);

    const style: React.CSSProperties = {
      position: "absolute",
      top: offset,
      left: 0,
      right: 0,
      height,
    };

    visibleItems.push(
      <div key={i} data-motion-result="" style={style}>
        {renderItem(items[i], i, style)}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      onScroll={handleScroll}
      style={{
        height: containerHeightProp ?? "100%",
        overflow: "auto",
        position: "relative",
      }}
    >
      <div
        style={{
          height: totalHeight,
          position: "relative",
          width: "100%",
        }}
      >
        {visibleItems}
      </div>
    </div>
  );
}
