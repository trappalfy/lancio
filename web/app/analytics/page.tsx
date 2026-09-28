import type { Metadata } from "next";
import { COPY } from "@lancio/shared";
import { AnalyticsView } from "@/components/analytics/AnalyticsView";

export const metadata: Metadata = {
  title: "Analytics",
  description: COPY.analytics.subtitle,
};

export default function Page() {
  return <AnalyticsView />;
}
