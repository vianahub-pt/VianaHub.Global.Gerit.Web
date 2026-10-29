import { ActionFormPage } from "@/domains/operations/actions";

export default async function ActionDetailsPage(props: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await props.params;
  return <ActionFormPage actionId={actionId} />;
}
