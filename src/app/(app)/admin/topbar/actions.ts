"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { guarded } from "@/server/safe";
import { logActivity } from "@/server/activity";
import { NAV_ITEMS, NAV_KEY, navOrder } from "@/lib/nav";

/** Admin → Top bar: the order of the tabs at the top of every page, for everyone. */
export async function saveNavOrder(order: string[]) {
  return guarded("manageUsers", async (user) => {
    const keys = navOrder(z.array(z.string().max(20)).max(20).parse(order));
    await db.appSetting.upsert({ where: { key: NAV_KEY }, create: { key: NAV_KEY, value: keys }, update: { value: keys } });
    await logActivity(user.id, "update", "setting", null, `Top bar order: ${keys.map((k) => NAV_ITEMS.find((i) => i.key === k)!.label.replace(" ▾", "")).join(", ")}`);
    revalidatePath("/", "layout");
  });
}
