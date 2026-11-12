import { RoleFormPage } from "@/domains/operations/roles";

interface RoleDetailsPageProps {
  params: Promise<{ roleId: string }>;
}

export default async function RoleDetailsPage({ params }: RoleDetailsPageProps) {
  const { roleId } = await params;
  return <RoleFormPage roleId={roleId} />;
}
