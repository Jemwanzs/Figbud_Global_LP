"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

import { StudioProblem } from "@/components/admin/studio-states";

/** A page that fails keeps the Studio around it: say so, retry, or go elsewhere. */
export default function StudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StudioProblem
      title="This section couldn't load"
      lead={`Something went wrong while showing it. Your other work is safe.${error.digest ? ` (Reference ${error.digest})` : ""}`}
      onRetry={() =>
        startTransition(() => {
          router.refresh();
          reset();
        })
      }
    />
  );
}
