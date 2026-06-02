import { redirect } from "next/navigation";

export default async function OldClientsDetailsRedirect(props: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await props.searchParams;
  if (clientId) {
    redirect(`/clients-details/${clientId}/`);
  }
  redirect("/clients/");
}
