/** @type {import('next').NextConfig} */
const nextConfig = {
  // @moss-js/moss-core ships a platform native binding that Turbopack's
  // module runner cannot load; keep it external so Node require() handles it.
  serverExternalPackages: ["@moss-js/moss", "@moss-js/moss-core"],
};

export default nextConfig;
