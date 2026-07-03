/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,

  images: {
    unoptimized: true,
  },

  // Preload removido: a imagem gerit-login-light.jpg já é carregada com loading="eager" e fetchPriority="high"
  // no componente LoginVisualPanel, tornando o preload via Link header redundante.
};

export default nextConfig;
