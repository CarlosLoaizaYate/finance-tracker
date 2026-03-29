import { createServerSupabase } from "./supabase-server";
import { prisma } from "./prisma";

export async function getAuthUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Ensure user exists in our DB (auto-create on first login)
  let dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) {
    dbUser = await prisma.user.create({
      data: {
        id: user.id,
        email: user.email!,
        name: user.user_metadata?.name ?? null,
      },
    });
  }
  return dbUser;
}
