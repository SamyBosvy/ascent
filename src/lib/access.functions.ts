import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const INVITE_ONLY = "Ascent is invite-only. Ask the owner for an invitation.";
const norm = (e: string) => e.trim().toLowerCase();
const USER_TABLES = ["push_subscriptions", "reminder_log", "checkins", "reviews", "cards", "notes", "sessions", "milestones", "routes", "user_settings"] as const;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function fail(context: string, error: { message: string } | null | undefined): asserts error is null | undefined {
  if (error) {
    console.error(`[access] ${context}:`, error.message);
    throw new Error(`${context}: ${error.message}`);
  }
}

async function findUserByEmail(email: string) {
  const sb = await admin();
  const { data: id, error } = await sb.rpc("get_user_id_by_email", { _email: email });
  fail("Could not look up user", error);
  if (!id) return null;
  const { data, error: e2 } = await sb.auth.admin.getUserById(id as string);
  fail("Could not load user", e2);
  return data.user;
}

async function wipeUserData(userId: string) {
  const sb = await admin();
  for (const t of USER_TABLES) {
    const { error } = await sb.from(t).delete().eq("user_id", userId);
    fail(`Could not delete ${t}`, error);
  }
  const { error } = await sb.from("user_roles").delete().eq("user_id", userId);
  fail("Could not delete role", error);
}

const setupLink = (origin: string, email: string) => `${origin}/?setup=1&email=${encodeURIComponent(email)}`;

// Public: the only way to create an account. Signup via the public auth API is disabled.
// Owner role comes only from the OWNER_EMAIL server secret; everyone else must be allowlisted.
// Invited users already exist in auth (created by inviteUserByEmail) without a password or role;
// they finish setup here, which sets their password and grants the member role.
export const registerAccount = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ email: z.string().email().max(255), password: z.string().min(8).max(72) }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const email = norm(data.email);
    const ownerEmail = norm(process.env["OWNER_EMAIL"] ?? "");
    const isOwner = !!ownerEmail && email === ownerEmail;
    if (!isOwner) {
      const { data: allowed, error } = await sb.from("allowlist").select("id").eq("email", email).maybeSingle();
      fail("Could not check invitation", error);
      if (!allowed) return { ok: false as const, code: "not_invited" as const, error: INVITE_ONLY };
    }
    const existing = await findUserByEmail(email);
    let userId: string;
    if (existing) {
      const { data: role, error } = await sb.from("user_roles").select("id").eq("user_id", existing.id).maybeSingle();
      fail("Could not check account", error);
      const pendingInvite = !role && !existing.last_sign_in_at;
      if (!pendingInvite) return { ok: false as const, code: "exists" as const, error: "An account with this email already exists. Sign in instead." };
      const { error: upErr } = await sb.auth.admin.updateUserById(existing.id, { password: data.password, email_confirm: true });
      if (upErr) return { ok: false as const, code: "auth" as const, error: upErr.message };
      userId = existing.id;
    } else {
      const { data: created, error } = await sb.auth.admin.createUser({ email, password: data.password, email_confirm: true });
      if (error || !created.user) return { ok: false as const, code: "auth" as const, error: error?.message ?? "Could not create account." };
      userId = created.user.id;
    }
    // Never demote/replace an existing owner row: only insert if no role row exists.
    const { data: hasRole, error: rErr } = await sb.from("user_roles").select("id").eq("user_id", userId).maybeSingle();
    fail("Could not check role", rErr);
    if (!hasRole) {
      const { error } = await sb.from("user_roles").insert({ user_id: userId, role: isOwner ? "owner" : "member" });
      fail("Could not assign role", error);
    }
    if (isOwner) {
      const { error } = await sb.from("allowlist").upsert({ email }, { onConflict: "email" });
      fail("Could not update allowlist", error);
    }
    return { ok: true as const };
  });

async function assertOwner(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "owner" });
  fail("Could not verify owner", error);
  if (!data) throw new Error("Forbidden");
}

export const listAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const sb = await admin();
    const { data: allow, error: aErr } = await sb.from("allowlist").select("*").order("created_at");
    fail("Could not load allowlist", aErr);
    const { data: roles, error: rErr } = await sb.from("user_roles").select("*");
    fail("Could not load roles", rErr);
    const users: { id: string; email?: string; created_at: string; last_sign_in_at?: string | null }[] = [];
    for (let page = 1; ; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
      fail("Could not load members", error);
      users.push(...data.users);
      if (data.users.length < 200) break;
    }
    const members = users
      // Pending invites (never signed in, no role) are shown via the allowlist, not as members.
      .filter((u) => roles?.some((r) => r.user_id === u.id) || u.last_sign_in_at)
      .map((u) => {
        const role = roles?.find((r) => r.user_id === u.id)?.role ?? null;
        return { id: u.id, email: u.email ?? "", created_at: u.created_at, role, revoked: !role };
      });
    return { allowlist: allow ?? [], members };
  });

export const addAllowed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().email().max(255), origin: z.string().url().max(255) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const sb = await admin();
    const email = norm(data.email);
    const origin = new URL(data.origin).origin;
    const link = setupLink(origin, email);
    const { error } = await sb.from("allowlist").upsert({ email }, { onConflict: "email" });
    fail("Could not save invitation", error);
    const u = await findUserByEmail(email);
    if (u) {
      const { data: role, error: rErr } = await sb.from("user_roles").select("id").eq("user_id", u.id).maybeSingle();
      fail("Could not check member", rErr);
      if (u.last_sign_in_at || role) {
        // Restore a previously revoked account
        const { error: bErr } = await sb.auth.admin.updateUserById(u.id, { ban_duration: "none" });
        fail("Could not restore access", bErr);
        if (!role) {
          const { error: iErr } = await sb.from("user_roles").insert({ user_id: u.id, role: "member" });
          fail("Could not restore role", iErr);
        }
        return { ok: true, restored: true, emailSent: false, link };
      }
      // Pending invite: re-send isn't possible for an existing user; share the link.
      return { ok: true, restored: false, emailSent: false, link };
    }
    const { error: invErr } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo: link });
    if (invErr) console.error("[access] invite email failed:", invErr.message);
    return { ok: true, restored: false, emailSent: !invErr, link };
  });

export const removeAllowed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const sb = await admin();
    const { error } = await sb.from("allowlist").delete().eq("id", data.id);
    fail("Could not remove invitation", error);
    return { ok: true };
  });

export const revokeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), deleteData: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You can't revoke your own access.");
    const sb = await admin();
    const { data: u, error: gErr } = await sb.auth.admin.getUserById(data.userId);
    fail("Could not load member", gErr);
    if (u.user?.email) {
      const { error } = await sb.from("allowlist").delete().eq("email", norm(u.user.email));
      fail("Could not remove invitation", error);
    }
    if (data.deleteData) {
      await wipeUserData(data.userId);
      const { error } = await sb.auth.admin.deleteUser(data.userId);
      fail("Could not delete account", error);
    } else {
      const { error } = await sb.from("user_roles").delete().eq("user_id", data.userId);
      fail("Could not remove role", error);
      const { error: bErr } = await sb.auth.admin.updateUserById(data.userId, { ban_duration: "876000h" });
      fail("Could not block sign-in", bErr);
    }
    return { ok: true };
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await admin();
    const email = context.claims.email as string | undefined;
    await wipeUserData(context.userId);
    if (email) {
      const { error } = await sb.from("allowlist").delete().eq("email", norm(email));
      fail("Could not remove invitation", error);
    }
    const { error } = await sb.auth.admin.deleteUser(context.userId);
    fail("Could not delete account", error);
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
    const { error: uErr } = await sb.auth.admin.updateUserById(context.userId, {
      app_metadata: { ...data.user.app_metadata, prev_email: current },
    });
    fail("Could not prepare email change", uErr);
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
      const { error: e1 } = await sb.from("allowlist").upsert({ email: current }, { onConflict: "email" });
      fail("Could not update allowlist", e1);
      const { error: e2 } = await sb.from("allowlist").delete().eq("email", prev);
      fail("Could not update allowlist", e2);
    }
    const { prev_email: _drop, ...rest } = data.user.app_metadata as Record<string, unknown>;
    const { error: e3 } = await sb.auth.admin.updateUserById(context.userId, { app_metadata: rest });
    fail("Could not finish email change", e3);
    return { changed: true };
  });
