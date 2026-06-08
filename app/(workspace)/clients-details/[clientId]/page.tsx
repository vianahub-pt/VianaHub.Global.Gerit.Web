import { Suspense } from "react";
import { ClientsDetailsPage } from "@/domains/operations/clients";

function ClientsDetailsPageFallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <p className="text-sm text-muted-foreground dark:text-muted-foreground">A carregar...</p>
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
