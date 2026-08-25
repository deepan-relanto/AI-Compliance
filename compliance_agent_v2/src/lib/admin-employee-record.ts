import type { EmployeeRecord } from "@/lib/employee-types";

/** Picker row for an admin who is not in the HR `employees` table. */
export function mapAdminUserToEmployeeRecord(input: {
  id: string;
  email: string;
  displayName?: string | null;
  batchId?: string | null;
  batchLabel?: string | null;
}): EmployeeRecord {
  const workEmail = input.email.trim().toLowerCase();
  const name =
    (input.displayName ?? "").trim() ||
    workEmail.split("@")[0] ||
    workEmail;
  return {
    id: input.id,
    employeeNumber: "",
    name,
    workEmail,
    dateOfBirth: null,
    gender: null,
    location: null,
    department: "Admin",
    subDepartment: null,
    jobTitle: "Admin",
    reportingTo: null,
    dateJoined: null,
    workerType: null,
    batchId: input.batchId ?? null,
    batchLabel: input.batchLabel ?? null,
    isAdmin: true,
  };
}
