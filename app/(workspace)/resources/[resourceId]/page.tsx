import { ResourceFormPage } from "@/domains/operations/resources";

export default async function ResourceDetailsPage(props: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await props.params;
  return <ResourceFormPage resourceId={resourceId} />;
}
