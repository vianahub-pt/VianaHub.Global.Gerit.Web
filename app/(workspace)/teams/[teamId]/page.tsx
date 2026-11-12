import { TeamFormPage } from "@/domains/operations/teams";

interface TeamDetailsPageProps {
  params: Promise<{ teamId: string }>;
}

export default async function TeamDetailsPage({ params }: TeamDetailsPageProps) {
  const { teamId } = await params;
  return <TeamFormPage teamId={teamId} />;
}
