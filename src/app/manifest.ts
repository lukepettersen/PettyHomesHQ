import type { MetadataRoute } from "next";
import { MOSS } from "@/components/AppIcon";

/** Lets "Add to Home Screen" open HQ like an app: full screen, its own icon and name. No start_url,
 * so the icon opens the page you were on when you added it (owner request 2026-10-26). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Petty Homes HQ", short_name: "HQ", display: "standalone",
    background_color: "#fbf6f2", theme_color: MOSS,
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png" }, { src: "/apple-icon", sizes: "180x180", type: "image/png" }],
  };
}
