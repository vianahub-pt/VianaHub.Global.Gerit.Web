import { EquipmentTypeFormPage } from "@/domains/operations/equipment-types";

interface EquipmentTypeDetailsPageProps {
  params: Promise<{ equipmentTypeId: string }>;
}

export default async function EquipmentTypeDetailsPage({ params }: EquipmentTypeDetailsPageProps) {
  const { equipmentTypeId } = await params;
  return <EquipmentTypeFormPage equipmentTypeId={equipmentTypeId} />;
}
