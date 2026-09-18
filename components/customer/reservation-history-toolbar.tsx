"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HavenDataToolbar, HavenFilterBadges, HavenSearchInput, HavenSelect } from "@/components/ui";

type FilterOption = { value: string; label: string; count: number };

export function ReservationHistoryToolbar({
  initialQuery,
  initialStatus,
  initialSort,
  statusOptions,
  resultCount,
}: {
  initialQuery: string;
  initialStatus: string;
  initialSort: string;
  statusOptions: FilterOption[];
  resultCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [sort, setSort] = useState(initialSort);

  const navigate = useCallback((next: { query?: string; status?: string; sort?: string }) => {
    const nextQuery = next.query ?? query;
    const nextStatus = next.status ?? status;
    const nextSort = next.sort ?? sort;
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextStatus !== "all") params.set("status", nextStatus);
    if (nextSort !== "recommended") params.set("sort", nextSort);
    const suffix = params.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  }, [pathname, query, router, sort, status]);

  const changeQuery = useCallback((value: string) => {
    setQuery(value);
    navigate({ query: value });
  }, [navigate]);

  const changeStatus = (value: string) => {
    setStatus(value);
    navigate({ status: value });
  };

  const changeSort = (value: string) => {
    setSort(value);
    navigate({ sort: value });
  };

  const clear = () => {
    setQuery("");
    setStatus("all");
    setSort("recommended");
    router.replace(pathname, { scroll: false });
  };

  return (
    <HavenDataToolbar
      variant="customer"
      label="Reservation history search and filters"
      search={
        <HavenSearchInput
          value={query}
          onValueChange={changeQuery}
          label="Search reservations"
          placeholder="Reference, room, or status"
          variant="customer"
        />
      }
      quickFilters={
        <HavenFilterBadges
          value={status}
          onChange={changeStatus}
          options={statusOptions}
          label="Filter reservations by status"
          variant="customer"
        />
      }
      advancedFilters={
        <div className="haven-filter">
          <span>Sort by</span>
          <HavenSelect
            value={sort}
            onChange={changeSort}
            ariaLabel="Sort reservations"
            options={[
              { value: "recommended", label: "Recommended" },
              { value: "stay-oldest", label: "Stay date: oldest first" },
              { value: "stay-newest", label: "Stay date: newest first" },
              { value: "booked-newest", label: "Recently booked" },
            ]}
          />
        </div>
      }
      resultCount={resultCount}
      resultNoun="reservations"
      onClearFilters={clear}
      hasActiveFilters={Boolean(query || status !== "all" || sort !== "recommended")}
    />
  );
}
