export const operationsUsersModule = {
  route: "/users",
  resource: "users",
} as const;

export * from "@/domains/operations/users/users-page";
export * from "@/domains/operations/users/user-form-page";
export * from "@/domains/operations/users/users-contract";
