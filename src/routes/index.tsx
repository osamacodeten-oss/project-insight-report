import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

const GameView = lazy(() =>
  import("@/components/game/GameView").then((m) => ({ default: m.GameView })),
);

const title = "صيدلية النور — محاكي إدارة صيدلية ثلاثي الأبعاد";
const description =
  "العب وأدر صيدليتك الخاصة في عالم ثلاثي الأبعاد: تجول بين الرفوف، أضف الأدوية، نظّم المخزون وتابع الإحصائيات من جهاز الإدارة.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="h-dvh w-full overflow-hidden bg-background">
      <h1 className="sr-only">صيدلية النور — محاكي إدارة صيدلية ثلاثي الأبعاد</h1>
      {mounted && (
        <Suspense fallback={<div className="h-dvh w-full bg-background" />}>
          <GameView />
        </Suspense>
      )}
    </main>
  );
}
