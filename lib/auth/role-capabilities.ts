export const APP_ROLES = ["Owner", "Admin", "Editor", "Viewer"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const ACCOUNT_STATUSES = ["active", "invited", "suspended"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ROLE_CAPABILITIES = {
  Owner: {
    executeSql: true,
    manageSchema: true,
    mutateTableData: true,
    readStorage: true,
    writeStorage: true,
    manageStorage: true,
  },
  Admin: {
    executeSql: true,
    manageSchema: true,
    mutateTableData: true,
    readStorage: true,
    writeStorage: true,
    manageStorage: true,
  },
  Editor: {
    executeSql: false,
    manageSchema: false,
    mutateTableData: true,
    readStorage: true,
    writeStorage: true,
    manageStorage: false,
  },
  Viewer: {
    executeSql: false,
    manageSchema: false,
    mutateTableData: false,
    readStorage: true,
    writeStorage: false,
    manageStorage: false,
  },
} as const satisfies Record<AppRole, {
  executeSql: boolean;
  manageSchema: boolean;
  mutateTableData: boolean;
  readStorage: boolean;
  writeStorage: boolean;
  manageStorage: boolean;
}>;

export type RoleCapability = keyof (typeof ROLE_CAPABILITIES)["Owner"];

export const ROLE_CAPABILITY_DESCRIPTIONS: Record<RoleCapability, string> = {
  executeSql: "Execute arbitrary SQL",
  manageSchema: "Create or change schema (DDL)",
  mutateTableData: "Insert, update, or delete table data",
  readStorage: "Read Storage objects",
  writeStorage: "Upload, rename, or delete Storage objects",
  manageStorage: "Create buckets or change bucket settings",
};

export function roleHasCapability(role: AppRole, capability: RoleCapability): boolean {
  return ROLE_CAPABILITIES[role][capability];
}
