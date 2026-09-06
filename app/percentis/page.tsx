import { Suspense } from "react";
import PercentilesView from "@/components/PercentilesView";

export default function Page() {
  return (
    <Suspense fallback={<div className="loading">Carregando…</div>}>
      <PercentilesView />
    </Suspense>
  );
}
