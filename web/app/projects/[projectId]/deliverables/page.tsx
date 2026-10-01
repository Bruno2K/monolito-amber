import { Suspense } from "react";
import { DeliverablesView } from "../../../../components/deliverables/DeliverablesView";
import { StateScreen } from "../../../../components/shell/StateScreen";

export default async function DeliverablesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <Suspense fallback={<StateScreen kind="loading" />}>
      <DeliverablesView projectId={projectId} />
    </Suspense>
  );
}
