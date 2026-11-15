import { UserFormPage } from "@/domains/operations/users";

interface UserDetailsPageProps {
  params: Promise<{ userId: string }>;
}

export default async function UserDetailsPage({ params }: UserDetailsPageProps) {
  const { userId } = await params;
  return <UserFormPage userId={userId} />;
}
