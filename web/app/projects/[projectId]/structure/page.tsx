import { Suspense } from "react";
import { StructureView } from "../../../../components/structure/StructureView";
import { StateScreen } from "../../../../components/shell/StateScreen";

export default async function StructurePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <Suspense fallback={<StateScreen kind="loading" />}>
      <StructureView projectId={projectId} />
    </Suspense>
  );
}
