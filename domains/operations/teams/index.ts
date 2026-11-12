export const operationsTeamsModule = {
  route: "/operations/teams",
  resource: "teams",
} as const;

export * from "@/domains/operations/teams/teams-page";
export * from "@/domains/operations/teams/team-form-page";
