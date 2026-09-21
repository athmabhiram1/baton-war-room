import type { MetadataRoute } from "next";

// PWA manifest. First cut candidate if behind schedule (plan §10).
export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#000000",
    display: "standalone",
    icons: [],
    name: "Baton War-Room",
    short_name: "Baton",
    start_url: "/",
    theme_color: "#000000",
  };
}
