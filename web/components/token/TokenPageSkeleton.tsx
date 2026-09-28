import { Card, Skeleton } from "@/components/ui";

/** Loading layout matching TokenView (route loading.tsx and the client's first fetch). */
export function TokenPageSkeleton() {
  return (
    <div className="container-page pt-6 pb-16 md:pt-10" aria-busy>
      <div className="grid gap-4 md:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4 md:space-y-6">
          <Card>
            <div className="flex gap-4">
              <Skeleton className="size-20 shrink-0 rounded-image" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-8 w-2/3 max-w-72" />
                <Skeleton className="h-4 w-full max-w-96" />
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-16 rounded-card" />
              ))}
            </div>
          </Card>
          <Card>
            <Skeleton className="h-8 w-64 rounded-full" />
            <Skeleton className="mt-5 h-[320px] rounded-card md:h-[420px]" />
          </Card>
        </div>
        <div className="hidden space-y-6 lg:block">
          <Skeleton className="h-[460px] rounded-section" />
          <Skeleton className="h-32 rounded-section" />
        </div>
      </div>
    </div>
  );
}
