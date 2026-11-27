export const operationsResourcesModule = {
  route: "/operations/resources",
  resource: "resources",
} as const;

export * from "@/domains/operations/resources/resources-page";
export * from "@/domains/operations/resources/resource-form-page";
