import { Suspense } from "react";
import CampusCrowdApp from "@/components/CampusCrowdApp";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="map-shell">
          <p className="meta-row" style={{ padding: "1.5rem" }}>
            Loading campus map…
          </p>
        </div>
      }
    >
      <CampusCrowdApp />
    </Suspense>
  );
}
