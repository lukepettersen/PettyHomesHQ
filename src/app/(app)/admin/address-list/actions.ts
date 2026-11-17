"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded } from "@/server/safe";
import { applyAddressList, previewAddressList, undoAddressList } from "@/server/addressList";
import { applySchema, type ApplyInput } from "@/lib/addressList";

// Import address list (SPEC.md §6.5). Same permission as Import from Follow Up Boss.
export async function previewList(csv: string) {
  return guarded("manageUsers", async () => previewAddressList(z.string().min(1, "Pick a file first.").max(2_000_000, "That file is too big.").parse(csv)));
}

export async function saveList(input: ApplyInput) {
  return guarded("manageUsers", async (user) => {
    const r = await applyAddressList(user.id, applySchema.parse(input));
    revalidatePath("/people"); revalidatePath("/admin/address-list");
    return r;
  });
}

export async function undoList(batchId: string) {
  return guarded("manageUsers", async (user) => {
    const r = await undoAddressList(user.id, z.string().min(1).max(40).parse(batchId));
    revalidatePath("/people"); revalidatePath("/admin/address-list");
    return r;
  });
}
