// Type-safe wrapper for content-matrix.json
import matrixJson from './content-matrix.json' with { type: 'json' };

export const contentMatrix = matrixJson as ContentMatrix;

export interface RoleMatrix {
  allowedNav: string[];
  forbiddenNav: string[];
  allowedPages: string[];
  forbiddenPages: string[];
  forbiddenText: string[];
  dashboardWidgets: string[];
  actionButtons: string[];
}

export interface ContentMatrix {
  owner: RoleMatrix;
  admin: RoleMatrix;
  manager: RoleMatrix;
  front_desk: RoleMatrix;
  housekeeping: RoleMatrix;
  maintenance: RoleMatrix;
  accounting: RoleMatrix;
  guest: RoleMatrix;
}