import { redirect } from "next/navigation";

export default async function LegacyClientDetailsPage(props: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await props.params;
  redirect(`/clients/${encodeURIComponent(clientId)}/`);
}
