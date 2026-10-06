"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Search, ArrowRight, CornerDownLeft, Sparkles, SunMoon, QrCode, LogOut, Bell, Compass } from "lucide-react";
import "./command-palette.css";

export type CommandItem = {
  id: string;
  label: string;
  category: "Navigation" | "Actions" | "Insights & AI" | "Security & System";
  hint?: string;
  keywords?: string[];
  icon?: React.ElementType;
  onSelect: () => void;
};

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  items: CommandItem[];
}

export function CommandPalette({ isOpen, onClose, items }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter items based on query
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const matchLabel = item.label.toLowerCase().includes(q);
      const matchCategory = item.category.toLowerCase().includes(q);
      const matchHint = item.hint?.toLowerCase().includes(q);
      const matchKeywords = item.keywords?.some((k) => k.toLowerCase().includes(q));
      return matchLabel || matchCategory || matchHint || matchKeywords;
    });
  }, [items, query]);

  const activeIndex = filteredItems.length > 0 ? Math.min(selectedIndex, filteredItems.length - 1) : 0;

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Global Escape handler when open
  useEffect(() => {
    if (!isOpen) return;
    const onGlobalKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onGlobalKey);
    return () => window.removeEventListener("keydown", onGlobalKey);
  }, [isOpen, onClose]);

  // Keyboard navigation inside palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length ? (prev + 1) % filteredItems.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length ? (prev - 1 + filteredItems.length) % filteredItems.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = filteredItems[activeIndex];
      if (selected) {
        selected.onSelect();
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Ensure active element is scrolled into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(".saas-cmd-item.active");
    if (activeEl && typeof activeEl.scrollIntoView === "function") {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  // Lock body and html scroll while command palette is open
  useEffect(() => {
    if (!isOpen) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.classList.add("haven-modal-open");
    document.documentElement.classList.add("haven-modal-open");
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
      document.body.classList.remove("haven-modal-open");
      document.documentElement.classList.remove("haven-modal-open");
    };
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  const content = (
    <div className="saas-cmd-overlay" onClick={onClose} onKeyDown={handleKeyDown} role="dialog" aria-modal="true" aria-label="Command Palette">
      <div className="saas-cmd-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="saas-cmd-search-wrap">
          <Search size={20} className="saas-cmd-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="saas-cmd-input"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            aria-autocomplete="list"
          />
          <button type="button" className="saas-cmd-esc-badge" onClick={onClose} aria-label="Close command palette">
            ESC
          </button>
        </div>

        <div className="saas-cmd-list" ref={listRef} role="listbox">
          {filteredItems.length === 0 ? (
            <div className="saas-cmd-empty">
              <p>No results found for &ldquo;{query}&rdquo;</p>
              <small>Try searching for a page, an action, or a section name.</small>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === activeIndex;
              const Icon = item.icon || ArrowRight;
              return (
                <div
                  key={item.id}
                  className={`saas-cmd-item${isSelected ? " active" : ""}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => {
                    item.onSelect();
                    onClose();
                  }}
                >
                  <div className="saas-cmd-item-icon">
                    <Icon size={16} />
                  </div>
                  <div className="saas-cmd-item-info">
                    <span className="saas-cmd-item-label">{item.label}</span>
                    {item.hint && <small className="saas-cmd-item-hint">{item.hint}</small>}
                  </div>
                  <span className="saas-cmd-item-badge">{item.category}</span>
                  {isSelected && <CornerDownLeft size={14} className="saas-cmd-enter-icon" aria-hidden="true" />}
                </div>
              );
            })
          )}
        </div>

        <div className="saas-cmd-footer">
          <div className="saas-cmd-keys">
            <span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
            <span><kbd>↵</kbd> to select</span>
            <span><kbd>esc</kbd> to close</span>
          </div>
          <span className="saas-cmd-brand">HAVEN SaaS Operations</span>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
