import "server-only";
import { loadForm } from "@/server/pa";
import { loadFileForm } from "@/server/files";
import type { PaSection } from "@/lib/pa";

/** The forms whose questions are merge fields, in the order the field list shows them. */
export async function loadMergeForms(): Promise<{ group: string; sections: PaSection[] }[]> {
  const [buyerPa, sellerPa, buyerFile, listingFile] = await Promise.all([loadForm("buyer"), loadForm("seller"), loadFileForm("buyer"), loadFileForm("listing")]);
  return [
    { group: "Contract (buyer side)", sections: buyerPa },
    { group: "Contract (seller side)", sections: sellerPa },
    { group: "Buyer file", sections: buyerFile },
    { group: "Listing file", sections: listingFile },
  ];
}
