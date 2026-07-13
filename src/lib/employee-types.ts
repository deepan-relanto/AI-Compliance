export interface EmployeeRecord {
  id: string;
  employeeNumber: string;
  name: string;
  workEmail: string;
  dateOfBirth: string | null;
  gender: string | null;
  location: string | null;
  department: string | null;
  subDepartment: string | null;
  jobTitle: string | null;
  reportingTo: string | null;
  dateJoined: string | null;
  workerType: string | null;
  batchId: string | null;
  batchLabel: string | null;
}

export interface EmployeeFacets {
  departments: string[];
  locations: string[];
  genders: string[];
  jobTitles: string[];
  workerTypes: string[];
  dateJoinedMin: string | null;
  dateJoinedMax: string | null;
}

export interface EmployeeFilterParams {
  search?: string;
  departments?: string[];
  locations?: string[];
  genders?: string[];
  jobTitles?: string[];
  workerTypes?: string[];
  dateJoinedFrom?: string;
  dateJoinedTo?: string;
  unassignedOnly?: boolean;
  page?: number;
  limit?: number;
  /** Return every matching row (no pagination); capped at 5000. */
  all?: boolean;
}

export interface EmployeeListResult {
  employees: EmployeeRecord[];
  total: number;
  page: number;
  limit: number;
}
