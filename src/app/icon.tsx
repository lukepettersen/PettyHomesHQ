import { ImageResponse } from "next/og";
import { appIconMarkup } from "@/components/AppIcon";

// Browser tab and Android home-screen icon.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";
export default function Icon() {
  return new ImageResponse(appIconMarkup(512, true), size);
}
