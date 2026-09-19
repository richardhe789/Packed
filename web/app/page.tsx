import { Suspense } from "react";
import PackedApp from "@/components/PackedApp";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="map-shell">
          <p className="meta-row" style={{ padding: "1.5rem" }}>
            Loading Packed…
          </p>
        </div>
      }
    >
      <PackedApp />
    </Suspense>
  );
}
