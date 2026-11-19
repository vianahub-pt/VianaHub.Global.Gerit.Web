import { ClientFormPage } from "@/domains/operations/clients/clients-v1";

export default async function ClientDetailPage(props: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await props.params;
  return <ClientFormPage clientId={clientId} />;
}
