export const operationsClientsModule = {
  route: "/clients",
  resource: "clients",
} as const;

export * from "@/domains/operations/clients/clients-details";
export * from "@/domains/operations/clients/clients-page";
export * from "@/domains/operations/clients/clients-create";
export * from "@/domains/operations/clients/useAcquisitionSourceTypes";
