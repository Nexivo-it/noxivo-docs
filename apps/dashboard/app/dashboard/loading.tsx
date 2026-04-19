function LoadingBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-surface-card ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <LoadingBlock className="h-6 w-28" />
        <LoadingBlock className="h-12 w-full max-w-xl" />
        <LoadingBlock className="h-5 w-full max-w-3xl" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <LoadingBlock key={index} className="h-40" />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <LoadingBlock className="h-[28rem]" />
        <LoadingBlock className="h-[28rem]" />
      </div>
    </div>
  );
}
