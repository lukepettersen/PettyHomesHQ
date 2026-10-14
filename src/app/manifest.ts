import type { MetadataRoute } from "next";
import { MOSS } from "@/components/AppIcon";

/** Lets "Add to Home Screen" open HQ like an app: full screen, its own icon and name. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Petty Homes HQ", short_name: "HQ", start_url: "/people", display: "standalone",
    background_color: "#fbf6f2", theme_color: MOSS,
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png" }, { src: "/apple-icon", sizes: "180x180", type: "image/png" }],
  };
}
