import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const INVITE_ONLY = "Ascent is invite-only. Ask the owner for an invitation.";
const norm = (e: string) => e.trim().toLowerCase();
const USER_TABLES = ["checkins", "reviews", "cards", "notes", "sessions", "milestones", "routes"] as const;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function findUserByEmail(email: string) {
  const sb = await admin();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const u = data.users.find((x) => x.email?.toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function wipeUserData(userId: string) {
  const sb = await admin();
  for (const t of USER_TABLES) await sb.from(t).delete().eq("user_id", userId);
  await sb.from("user_roles").delete().eq("user_id", userId);
}

// Public: the only way to create an account. Signup via the public auth API is disabled.
export const registerAccount = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ email: z.string().email().max(255), password: z.string().min(8).max(72) }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const email = norm(data.email);
    const { count } = await sb.from("user_roles").select("id", { count: "exact", head: true });
    const isFirst = (count ?? 0) === 0;
    if (!isFirst) {
      const { data: allowed } = await sb.from("allowlist").select("id").eq("email", email).maybeSingle();
      if (!allowed) return { ok: false as const, error: INVITE_ONLY };
    }
    if (await findUserByEmail(email)) return { ok: false as const, error: "An account with this email already exists. Sign in instead." };
    const { data: created, error } = await sb.auth.admin.createUser({ email, password: data.password, email_confirm: true });
    if (error || !created.user) return { ok: false as const, error: error?.message ?? "Could not create account." };
    await sb.from("user_roles").insert({ user_id: created.user.id, role: isFirst ? "owner" : "member" });
    if (isFirst) await sb.from("allowlist").upsert({ email }, { onConflict: "email" });
    return { ok: true as const };
  });

async function assertOwner(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "owner" });
  if (!data) throw new Error("Forbidden");
}

export const listAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const sb = await admin();
    const { data: allow } = await sb.from("allowlist").select("*").order("created_at");
    const { data: roles } = await sb.from("user_roles").select("*");
    const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 });
    const members = (users?.users ?? []).map((u) => {
      const role = roles?.find((r) => r.user_id === u.id)?.role ?? null;
      return {
        id: u.id,
        email: u.email ?? "",
        created_at: u.created_at,
        role,
        revoked: !role,
      };
    });
    return { allowlist: allow ?? [], members };
  });

export const addAllowed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().email().max(255) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const sb = await admin();
    const email = norm(data.email);
    await sb.from("allowlist").upsert({ email }, { onConflict: "email" });
    // Restore a previously revoked account
    const u = await findUserByEmail(email);
    if (u) {
      await sb.auth.admin.updateUserById(u.id, { ban_duration: "none" });
      await sb.from("user_roles").upsert({ user_id: u.id, role: "member" }, { onConflict: "user_id" });
    }
    return { ok: true };
  });

export const removeAllowed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const sb = await admin();
    await sb.from("allowlist").delete().eq("id", data.id);
    return { ok: true };
  });

export const revokeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), deleteData: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You can't revoke your own access.");
    const sb = await admin();
    const { data: u } = await sb.auth.admin.getUserById(data.userId);
    if (u.user?.email) await sb.from("allowlist").delete().eq("email", norm(u.user.email));
    if (data.deleteData) {
      await wipeUserData(data.userId);
      await sb.auth.admin.deleteUser(data.userId);
    } else {
      await sb.from("user_roles").delete().eq("user_id", data.userId);
      await sb.auth.admin.updateUserById(data.userId, { ban_duration: "876000h" });
    }
    return { ok: true };
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await admin();
    const email = context.claims.email as string | undefined;
    await wipeUserData(context.userId);
    if (email) await sb.from("allowlist").delete().eq("email", norm(email));
    await sb.auth.admin.deleteUser(context.userId);
    return { ok: true };
  });

// Records the caller's current (pre-change) email server-side so the allowlist can be moved
// to the new address once the change is confirmed. Access itself is keyed on user_id (user_roles).
export const rememberEmailChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await admin();
    const { data, error } = await sb.auth.admin.getUserById(context.userId);
    if (error || !data.user) throw new Error(error?.message ?? "User not found");
    const current = norm(data.user.email ?? "");
    await sb.auth.admin.updateUserById(context.userId, {
      app_metadata: { ...data.user.app_metadata, prev_email: current },
    });
    return { ok: true };
  });

// After an email change is confirmed: move the allowlist entry from the old to the new address.
export const syncMyAllowlistEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await admin();
    const { data, error } = await sb.auth.admin.getUserById(context.userId);
    if (error || !data.user) throw new Error(error?.message ?? "User not found");
    const current = norm(data.user.email ?? "");
    const prev = (data.user.app_metadata as { prev_email?: string } | undefined)?.prev_email;
    if (!prev || !current || prev === current) return { changed: false };
    const { data: role } = await sb.from("user_roles").select("id").eq("user_id", context.userId).maybeSingle();
    if (role) {
      await sb.from("allowlist").upsert({ email: current }, { onConflict: "email" });
      await sb.from("allowlist").delete().eq("email", prev);
    }
    const { prev_email: _drop, ...rest } = data.user.app_metadata as Record<string, unknown>;
    await sb.auth.admin.updateUserById(context.userId, { app_metadata: rest });
    return { changed: true };
  });
