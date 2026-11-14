const { websiteUrl } = require("./security.cjs");

// Refresh this verified published address whenever the project's domain changes.
const PUBLISHED_URL = "https://erptablebrowser.lovable.app";

function startupUrl(override, dev, packaged) {
  const url = websiteUrl(override || (dev && !packaged ? "http://localhost:8080" : PUBLISHED_URL));
  if (!url) throw new Error("HELM_URL must be a credential-free HTTP(S) URL");
  return url;
}

module.exports = { PUBLISHED_URL, startupUrl };