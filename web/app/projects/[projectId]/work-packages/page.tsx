import { Suspense } from "react";
import { WorkPackagesView } from "../../../../components/work-packages/WorkPackagesView";
import { StateScreen } from "../../../../components/shell/StateScreen";

export default async function WorkPackagesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <Suspense fallback={<StateScreen kind="loading" />}>
      <WorkPackagesView projectId={projectId} />
    </Suspense>
  );
}
