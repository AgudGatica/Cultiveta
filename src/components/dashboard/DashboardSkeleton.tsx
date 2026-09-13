import React from 'react';

export const DashboardSkeleton: React.FC = () => {
  return (
    <div id="dashboard-skeleton-view" className="space-y-6 sm:space-y-8 animate-fade-in-up">
      {/* 1. Date Filter Bar Skeleton */}
      <div
        id="skeleton-date-filter"
        className="skeleton-card bg-[#0F0F0F] rounded-[28px] p-4 sm:p-6 border border-zinc-800/90 shadow-xl space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl skeleton-shimmer shrink-0"></div>
            <div className="space-y-1.5">
              <div className="w-28 h-4 rounded-md skeleton-shimmer"></div>
              <div className="w-48 h-3 rounded-md skeleton-shimmer"></div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-44 h-8 rounded-xl skeleton-shimmer"></div>
            <div className="w-20 h-8 rounded-xl skeleton-shimmer"></div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="w-24 sm:w-28 h-9 rounded-xl skeleton-shimmer"></div>
          ))}
        </div>
      </div>

      {/* 2. Upcoming Critical Task Widget Skeleton */}
      <div
        id="skeleton-task-widget"
        className="skeleton-card bg-[#0F0F0F] rounded-[28px] p-5 sm:p-6 border border-zinc-800/90 shadow-xl relative overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl skeleton-shimmer shrink-0"></div>
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-24 h-4 rounded-full skeleton-shimmer"></div>
                <div className="w-16 h-4 rounded-full skeleton-shimmer"></div>
              </div>
              <div className="w-64 sm:w-80 h-6 rounded-lg skeleton-shimmer"></div>
              <div className="w-48 sm:w-60 h-3.5 rounded-md skeleton-shimmer"></div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-28 h-10 rounded-2xl skeleton-shimmer"></div>
            <div className="w-32 h-10 rounded-2xl skeleton-shimmer"></div>
          </div>
        </div>
      </div>

      {/* 3. Summary Metric Cards (4 Bento Cards) Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { id: 'skeleton-stat-active-crops' },
          { id: 'skeleton-stat-total-plants' },
          { id: 'skeleton-stat-recent-waterings' },
          { id: 'skeleton-stat-diary-photos' },
        ].map((card) => (
          <div
            key={card.id}
            id={card.id}
            className="skeleton-card bg-[#0F0F0F] rounded-[28px] p-5 sm:p-6 border border-zinc-800/90 flex flex-col justify-between h-36 shadow-md"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-20 sm:w-24 h-3.5 rounded skeleton-shimmer"></div>
              <div className="w-9 h-9 rounded-xl skeleton-shimmer"></div>
            </div>
            <div className="space-y-2">
              <div className="w-16 sm:w-20 h-8 rounded-lg skeleton-shimmer"></div>
              <div className="w-28 sm:w-32 h-3 rounded skeleton-shimmer"></div>
            </div>
          </div>
        ))}
      </div>

      {/* 4. Environmental Progress Historical Chart Skeleton */}
      <div
        id="skeleton-env-chart"
        className="skeleton-card bg-[#0F0F0F] rounded-[32px] p-6 sm:p-8 border border-zinc-800/90 shadow-xl space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
          <div className="space-y-2">
            <div className="w-32 h-3.5 rounded skeleton-shimmer"></div>
            <div className="w-56 sm:w-72 h-6 rounded-lg skeleton-shimmer"></div>
            <div className="w-40 h-3 rounded skeleton-shimmer"></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="w-20 h-7 rounded-xl skeleton-shimmer"></div>
            ))}
          </div>
        </div>

        {/* Mock Chart Area with Grid Shimmer */}
        <div className="h-64 sm:h-72 w-full rounded-2xl bg-zinc-950/60 border border-zinc-800/60 p-4 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute inset-0 skeleton-shimmer opacity-30"></div>
          <div className="w-full flex justify-between">
            <div className="w-10 h-3 rounded skeleton-shimmer"></div>
            <div className="w-10 h-3 rounded skeleton-shimmer"></div>
          </div>
          <div className="w-full h-px bg-zinc-800/50"></div>
          <div className="w-full h-px bg-zinc-800/50"></div>
          <div className="w-full h-px bg-zinc-800/50"></div>
          <div className="w-full flex justify-between pt-2">
            {[1, 2, 3, 4, 5, 6].map((k) => (
              <div key={k} className="w-8 h-3 rounded skeleton-shimmer"></div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. AI Agronomic Assistant Box Skeleton */}
      <div
        id="skeleton-ai-box"
        className="skeleton-card bg-[#0F0F0F] rounded-[32px] p-6 sm:p-8 border border-zinc-800/90 shadow-xl"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 flex-1">
            <div className="w-12 h-12 rounded-2xl skeleton-shimmer shrink-0"></div>
            <div className="space-y-2 flex-1">
              <div className="w-36 h-3.5 rounded skeleton-shimmer"></div>
              <div className="w-60 h-5 rounded-lg skeleton-shimmer"></div>
              <div className="w-72 h-3 rounded skeleton-shimmer"></div>
            </div>
          </div>
          <div className="w-32 h-10 rounded-2xl skeleton-shimmer shrink-0"></div>
        </div>
      </div>

      {/* 6. Active Cultivations Grid Skeleton */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="w-48 h-6 rounded-lg skeleton-shimmer"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((cardIdx) => (
            <div
              key={cardIdx}
              id={`skeleton-crop-card-${cardIdx}`}
              className="skeleton-card bg-[#0F0F0F] rounded-[28px] p-6 border border-zinc-800/90 space-y-4 shadow-xl relative overflow-hidden"
            >
              {/* Header tags */}
              <div className="flex items-center justify-between">
                <div className="w-24 h-5 rounded-full skeleton-shimmer"></div>
                <div className="w-16 h-5 rounded-full skeleton-shimmer"></div>
              </div>

              {/* Title and subtext */}
              <div className="space-y-2 pt-1">
                <div className="w-4/5 h-6 rounded-lg skeleton-shimmer"></div>
                <div className="w-1/2 h-3.5 rounded skeleton-shimmer"></div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between">
                  <div className="w-16 h-3 rounded skeleton-shimmer"></div>
                  <div className="w-12 h-3 rounded skeleton-shimmer"></div>
                </div>
                <div className="w-full h-2 rounded-full skeleton-shimmer"></div>
              </div>

              {/* Parameter 4-matrix */}
              <div className="grid grid-cols-4 gap-2 pt-2">
                {[1, 2, 3, 4].map((p) => (
                  <div key={p} className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 space-y-1 text-center">
                    <div className="w-8 h-2.5 rounded skeleton-shimmer mx-auto"></div>
                    <div className="w-10 h-3.5 rounded skeleton-shimmer mx-auto"></div>
                  </div>
                ))}
              </div>

              {/* Bottom action icons */}
              <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl skeleton-shimmer"></div>
                  <div className="w-8 h-8 rounded-xl skeleton-shimmer"></div>
                  <div className="w-8 h-8 rounded-xl skeleton-shimmer"></div>
                </div>
                <div className="w-20 h-8 rounded-xl skeleton-shimmer"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
