export function getLiveboardRouteName(pathname = window.location.pathname) {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());

  const liveboardIndex = segments.lastIndexOf("liveboard");

  if (liveboardIndex === -1) {
    return null;
  }

  return segments[liveboardIndex + 1] || null;
}

export function getLiveboardPathMode(pathname = window.location.pathname) {
  const route = getLiveboardRouteName(pathname);

  if (route === "display") {
    return "display";
  }

  if (route === "mobile" || route === "kiosk") {
    return "entry";
  }

  if (route === "admin" || route === "setup") {
    return "setup";
  }

  return null;
}

export function isLiveboardKioskPath(pathname = window.location.pathname) {
  return getLiveboardRouteName(pathname) === "kiosk";
}
