import { Suspense } from "react";
import { ClientsDetailsPage } from "@/domains/operations/clients";

function ClientsDetailsPageFallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <p className="text-sm text-[#7aa4c0] dark:text-[#84a0c0]">A carregar...</p>
    </div>
  );
}

export default async function ClientsDetailsPageWrapper(props: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await props.params;
  return (
    <Suspense fallback={<ClientsDetailsPageFallback />}>
      <ClientsDetailsPage clientId={clientId} />
    </Suspense>
  );
}
