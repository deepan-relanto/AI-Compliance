import type { UserRole } from "@/lib/types";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      email?: string | null;
      name?: string | null;
      image?: string | null;
      role?: UserRole;
      batchId?: string;
      displayName?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    batchId?: string;
    displayName?: string;
  }
}
