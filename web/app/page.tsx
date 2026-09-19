import { Suspense } from "react";
import CampusCrowdApp from "@/components/CampusCrowdApp";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="page">
          <p className="meta-row">Loading Campus Crowd…</p>
        </div>
      }
    >
      <CampusCrowdApp />
    </Suspense>
  );
}
