import { Suspense } from "react";
import { PlannerView } from "../../../../components/planner/PlannerView";
import { PlanningSkeleton } from "../../../../components/planner/PlanningStates";

export default async function PlannerPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <Suspense fallback={<PlanningSkeleton />}>
      <PlannerView projectId={projectId} />
    </Suspense>
  );
}
