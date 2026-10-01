import { Suspense } from "react";
import { OverviewView } from "../../../../components/overview/OverviewView";
import { StateScreen } from "../../../../components/shell/StateScreen";

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <Suspense fallback={<StateScreen kind="loading" />}>
      <OverviewView projectId={projectId} />
    </Suspense>
  );
}
