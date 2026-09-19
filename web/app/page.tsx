import { Suspense } from "react";
import CampusCrowdApp from "@/components/CampusCrowdApp";

export default function HomePage() {
  return (
    <Suspense fallback={<p className="meta">Loading Campus Crowd…</p>}>
      <CampusCrowdApp />
    </Suspense>
  );
}
