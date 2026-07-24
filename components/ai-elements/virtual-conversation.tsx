"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowDownIcon } from "lucide-react";

/**
 * Virtualized chat transcript with stick-to-bottom behavior.
 * Prefer this over mapping every message into the DOM for long threads.
 */
export function VirtualConversation({
  className,
  children,
  itemCount,
  estimateSize = 120,
  overscan = 6,
  scrollToBottomKey,
}: {
  className?: string;
  /** Render item at index — parent supplies content. */
  children: (index: number) => React.ReactNode;
  itemCount: number;
  estimateSize?: number;
  overscan?: number;
  /** Change when a new live message arrives to scroll to bottom if stuck. */
  scrollToBottomKey?: string | number;
}) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const stickRef = React.useRef(true);
  const [showJump, setShowJump] = React.useState(false);

  const virtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  const onScroll = React.useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < 80;
    stickRef.current = atBottom;
    setShowJump(!atBottom);
  }, []);

  React.useEffect(() => {
    if (!stickRef.current || itemCount === 0) return;
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(itemCount - 1, { align: "end" });
    });
  }, [itemCount, scrollToBottomKey, virtualizer]);

  const jumpToBottom = () => {
    stickRef.current = true;
    setShowJump(false);
    virtualizer.scrollToIndex(itemCount - 1, { align: "end" });
  };

  const items = virtualizer.getVirtualItems();

  return (
    <div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={onScroll}
        ref={parentRef}
        role="log"
      >
        <div
          className="relative mx-auto w-full max-w-3xl px-4 py-6 sm:px-6"
          style={{ height: virtualizer.getTotalSize() }}
        >
          <div
            className="absolute top-0 left-0 w-full"
            style={{
              transform: `translateY(${items[0]?.start ?? 0}px)`,
            }}
          >
            {items.map((virtualRow) => (
              <div
                className="pb-6 [content-visibility:auto] [contain-intrinsic-size:auto_120px]"
                data-index={virtualRow.index}
                key={virtualRow.key}
                ref={virtualizer.measureElement}
              >
                {children(virtualRow.index)}
              </div>
            ))}
          </div>
        </div>
      </div>
      {showJump ? (
        <Button
          className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full"
          onClick={jumpToBottom}
          size="icon"
          type="button"
          variant="outline"
        >
          <ArrowDownIcon className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
