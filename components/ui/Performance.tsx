"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Server-Sent Events hook for real-time updates
 * Replaces polling with efficient server-push
 */
export interface SSEOptions {
  url: string;
  onMessage?: (data: unknown) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
  retryInterval?: number;
  maxRetries?: number;
  withCredentials?: boolean;
}

export interface SSEResult {
  isConnected: boolean;
  lastMessage: unknown | null;
  error: Event | null;
  reconnect: () => void;
  close: () => void;
}

export function useSSE({
  url,
  onMessage,
  onError,
  onOpen,
  retryInterval = 5000,
  maxRetries = 10,
  withCredentials = false,
}: SSEOptions): SSEResult {
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectRef = useRef<() => void>(() => {});
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<unknown | null>(null);
  const [error, setError] = useState<Event | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const eventSource = new EventSource(url, { withCredentials });
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
        retryCountRef.current = 0;
        onOpen?.();
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          onMessage?.(data);
        } catch (parseError) {
          console.error("Failed to parse SSE message:", parseError);
        }
      };

      eventSource.onerror = (err) => {
        setIsConnected(false);
        setError(err);
        onError?.(err);

        eventSource.close();

        if (retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          retryTimeoutRef.current = setTimeout(() => {
            connectRef.current();
          }, retryInterval * Math.min(retryCountRef.current, 5)); // Exponential backoff
        }
      };
    } catch (err) {
      console.error("Failed to create EventSource:", err);
      setError(err as Event);
      setIsConnected(false);
    }
  }, [url, onMessage, onError, onOpen, retryInterval, maxRetries]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const close = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const reconnect = useCallback(() => {
    close();
    retryCountRef.current = 0;
    connect();
  }, [close, connect]);

  useEffect(() => {
    connect();
    return () => {
      close();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [connect, close]);

  return {
    isConnected,
    lastMessage,
    error,
    reconnect,
    close,
  };
}

/**
 * Hook for managing real-time data with SSE
 * Provides automatic reconnection and data merging
 */
export interface UseRealTimeDataOptions<T> {
  sseUrl: string;
  initialData: T[];
  keyField: keyof T;
  onUpdate?: (data: T[]) => void;
  mergeStrategy?: "replace" | "merge" | "append";
}

export function useRealTimeData<T extends Record<string, unknown>>({
  sseUrl,
  initialData,
  keyField,
  onUpdate,
  mergeStrategy = "merge",
}: UseRealTimeDataOptions<T>) {
  const [data, setData] = useState<T[]>(initialData);
  const dataMapRef = useRef<Map<string, T>>(new Map());

  useEffect(() => {
    dataMapRef.current.clear();
    initialData.forEach((item) => {
      dataMapRef.current.set(String(item[keyField]), item);
    });
  }, [initialData, keyField]);

  const handleMessage = useCallback((message: unknown) => {
    if (!message || typeof message !== "object" || !("type" in message)) return;

    const msg = message as { type: string; payload: unknown };

    setData((prev) => {
      const newMap = new Map(dataMapRef.current);

      switch (msg.type) {
        case "insert": {
          const items = Array.isArray(msg.payload) ? msg.payload : [msg.payload];
          items.forEach((item: T) => {
            newMap.set(String(item[keyField]), item);
          });
          break;
        }
        case "update": {
          const items = Array.isArray(msg.payload) ? msg.payload : [msg.payload];
          items.forEach((item: Partial<T> & { [key: string]: unknown }) => {
            const key = String(item[keyField]);
            const existing = newMap.get(key);
            if (existing) {
              newMap.set(key, { ...existing, ...item });
            }
          });
          break;
        }
        case "delete": {
          const keys = Array.isArray(msg.payload) ? msg.payload : [msg.payload];
          keys.forEach((key: string) => newMap.delete(key));
          break;
        }
        case "replace": {
          const items = Array.isArray(msg.payload) ? msg.payload : [];
          newMap.clear();
          items.forEach((item: T) => {
            newMap.set(String(item[keyField]), item);
          });
          break;
        }
      }

      dataMapRef.current = newMap;
      const newData = Array.from(newMap.values());
      onUpdate?.(newData);
      return newData;
    });
  }, [keyField, onUpdate]);

  const { isConnected, lastMessage, error, reconnect, close } = useSSE({
    url: sseUrl,
    onMessage: handleMessage,
    retryInterval: 3000,
    maxRetries: 20,
  });

  // Update local data when SSE messages arrive
  useEffect(() => {
    if (lastMessage) {
      // Data is already updated in handleMessage
    }
  }, [lastMessage]);

  return {
    data,
    isConnected,
    error,
    reconnect,
    close,
    setData,
  };
}

/**
 * Virtualized list hook for rendering large lists efficiently
 */
export interface VirtualizedListOptions<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
  horizontal?: boolean;
}

export interface VirtualizedListResult<T> {
  visibleItems: { index: number; item: T; style: React.CSSProperties }[];
  totalHeight: number;
  scrollToIndex: (index: number) => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
}

export function useVirtualizedList<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 5,
  horizontal = false,
}: VirtualizedListOptions<T>): VirtualizedListResult<T> {
  const [scrollOffset, setScrollOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollOffset / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollOffset + containerHeight) / itemHeight) + overscan
    );
    return { startIndex, endIndex };
  }, [scrollOffset, itemHeight, containerHeight, overscan, items.length]);

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.startIndex, visibleRange.endIndex + 1).map((item, index) => {
      const actualIndex = visibleRange.startIndex + index;
      const offset = actualIndex * itemHeight;
      return {
        index: actualIndex,
        item,
        style: {
          position: "absolute" as const,
          [horizontal ? "left" : "top"]: offset,
          [horizontal ? "width" : "height"]: itemHeight,
          [horizontal ? "height" : "width"]: "100%",
        },
      };
    });
  }, [items, visibleRange, itemHeight, horizontal]);

  const totalHeight = items.length * itemHeight;

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    setScrollOffset(horizontal ? target.scrollLeft : target.scrollTop);
  }, [horizontal]);

  const scrollToIndex = useCallback((index: number) => {
    if (!containerRef.current) return;
    const offset = index * itemHeight;
    if (horizontal) {
      containerRef.current.scrollLeft = offset;
    } else {
      containerRef.current.scrollTop = offset;
    }
  }, [itemHeight, horizontal]);

  const scrollToTop = useCallback(() => {
    if (!containerRef.current) return;
    if (horizontal) {
      containerRef.current.scrollLeft = 0;
    } else {
      containerRef.current.scrollTop = 0;
    }
  }, [horizontal]);

  const scrollToBottom = useCallback(() => {
    if (!containerRef.current) return;
    const maxScroll = totalHeight - containerHeight;
    if (horizontal) {
      containerRef.current.scrollLeft = maxScroll;
    } else {
      containerRef.current.scrollTop = maxScroll;
    }
  }, [totalHeight, containerHeight, horizontal]);

  return {
    visibleItems,
    totalHeight,
    scrollToIndex,
    scrollToTop,
    scrollToBottom,
  };
}

/**
 * Debounced value hook for search/filter inputs
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Memoized callback factory for stable references
 */
export function useStableCallback<T extends (...args: unknown[]) => unknown>(
  callback: T
): T {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });
  const stable = useCallback((...args: unknown[]) => {
    return callbackRef.current(...args);
  }, []);
  return stable as T;
}

/**
 * Intersection observer hook for lazy loading
 */
export interface IntersectionObserverOptions {
  root?: Element | null;
  rootMargin?: string;
  threshold?: number | number[];
  once?: boolean;
}

export function useIntersectionObserver(
  options: IntersectionObserverOptions = {}
): [React.RefObject<HTMLDivElement>, boolean] {
  const { root = null, rootMargin = "0px", threshold = 0, once = true } = options;
  const [isIntersecting, setIsIntersecting] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          if (once) {
            observer.unobserve(element);
          }
        } else if (!once) {
          setIsIntersecting(false);
        }
      },
      { root, rootMargin, threshold }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [root, rootMargin, threshold, once]);

  return [elementRef, isIntersecting];
}

/**
 * Performance monitoring hook
 */
export function usePerformanceMonitor(name: string) {
  const marksRef = useRef<Map<string, number>>(new Map());

  const mark = useCallback((markName: string) => {
    marksRef.current.set(markName, performance.now());
  }, []);

  const measure = useCallback((measureName: string, startMark: string, endMark?: string) => {
    const start = marksRef.current.get(startMark);
    if (start === undefined) {
      console.warn(`Performance mark "${startMark}" not found`);
      return;
    }
    const end = endMark ? marksRef.current.get(endMark) : performance.now();
    if (end === undefined) {
      console.warn(`Performance mark "${endMark}" not found`);
      return;
    }
    const duration = end - start;
    console.log(`[Performance] ${name} - ${measureName}: ${duration.toFixed(2)}ms`);
    return duration;
  }, [name]);

  const clearMarks = useCallback(() => {
    marksRef.current.clear();
  }, []);

  return { mark, measure, clearMarks };
}

/**
 * Code splitting utilities
 */
export function lazyImport<T extends React.ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(importFn);
}

/**
 * Preload component for faster navigation
 */
export function preloadComponent(importFn: () => Promise<unknown>): void {
  // Trigger the import but don't await it
  importFn().catch(() => {
    // Ignore preload errors
  });
}

/**
 * Resource hints for critical assets
 */
export function addResourceHints(hints: { rel: "preload" | "prefetch" | "preconnect"; href: string; as?: string; crossorigin?: string }[]): void {
  hints.forEach((hint) => {
    const existing = document.querySelector(`link[rel="${hint.rel}"][href="${hint.href}"]`);
    if (existing) return;

    const link = document.createElement("link");
    link.rel = hint.rel;
    link.href = hint.href;
    if (hint.as) link.as = hint.as;
    if (hint.crossorigin) link.crossOrigin = hint.crossorigin;
    document.head.appendChild(link);
  });
}

/**
 * Bundle size optimization - tree-shakable utilities
 */
export const performanceUtils = {
  /**
   * Memoize expensive computations
   */
  memoize: <T extends (...args: unknown[]) => unknown>(fn: T, keyFn?: (...args: unknown[]) => string): T => {
    const cache = new Map<string, unknown>();
    return ((...args: unknown[]) => {
      const key = keyFn ? keyFn(...args) : JSON.stringify(args);
      if (cache.has(key)) return cache.get(key);
      const result = fn(...args);
      cache.set(key, result);
      return result;
    }) as T;
  },

  /**
   * Batch updates to reduce re-renders
   */
  batchUpdates: <T,>(updates: (() => T)[]): T[] => {
    // In React 18+, updates are automatically batched
    // This is a no-op but provides a clear API
    return updates.map((update) => update());
  },

  /**
   * Request idle callback polyfill
   */
  requestIdleCallback: (callback: IdleRequestCallback, options?: IdleRequestOptions): number => {
    if (typeof window.requestIdleCallback === "function") {
      return window.requestIdleCallback(callback, options);
    }
    return window.setTimeout(() => {
      const start = Date.now();
      callback({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
      } as IdleDeadline);
    }, 1) as unknown as number;
  },

  /**
   * Cancel idle callback
   */
  cancelIdleCallback: (id: number): void => {
    if (typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(id);
    } else {
      window.clearTimeout(id);
    }
  },
};

import React from "react";
import { useMemo } from "react";