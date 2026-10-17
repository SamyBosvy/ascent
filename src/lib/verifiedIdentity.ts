import type { User } from "@supabase/supabase-js";
import { IdentityCache } from "./identityCache";

export const identityCache = new IdentityCache<{ user: User; role: string }>();
