import type { MetadataRoute } from "next";

// App privata dietro login, niente da indicizzare: disallow esplicito
// invece di lasciare i crawler liberi di default.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
