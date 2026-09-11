const PHOTO_MARKER = "__LIVEBOARD_PHOTO__:";

function values(value) {
  return Array.isArray(value) ? value : value === null || value === undefined || value === "" ? [] : [value];
}

export function toLiveBoardEntry(card, form) {
  const byId = new Map((form.fields || []).map((field) => [field.id, field]));
  const items = [];
  const customItems = [];
  let position = "Switch";
  let socialHandle = null;
  let whoAmI = null;
  let seeking = null;
  for (const [fieldId, rawValue] of Object.entries(card.answers || {})) {
    const custom = fieldId.endsWith("__custom");
    const baseId = custom ? fieldId.slice(0, -8) : fieldId;
    const field = byId.get(baseId);
    if (!field) continue;
    const labels = new Map((field.options || []).map((option) => [option.id, option.label]));
    const resolved = values(rawValue).map((value) => labels.get(value) || String(value)).filter(Boolean);
    const key = field.legacyKey || field.type;
    if (!custom && key === "position" && resolved[0]) position = resolved[0];
    else if (!custom && key === "social") socialHandle = resolved.join("\n") || null;
    else if (!custom && ["identity", "whoAmI", "who_am_i"].includes(key)) whoAmI = resolved.join(", ") || null;
    else if (!custom && ["seeking", "lookingFor", "looking_for"].includes(key)) seeking = resolved.join(", ") || null;
    else if (!custom && ["select", "multi-select"].includes(field.type)) items.push(...resolved);
    else customItems.push(...resolved.map((answer) => `${field.label}: ${answer}`));
  }
  if (card.photoUrl) customItems.push(PHOTO_MARKER + JSON.stringify({ url: card.photoUrl, path: null }));
  return {
    name: card.displayName || "Anonymous", social_handle: socialHandle, social_platform: null,
    position, who_am_i_text: whoAmI, seeking_text: seeking,
    items: [...new Set(items)].sort((a, b) => a.localeCompare(b)),
    custom_items: [...new Set(customItems)].sort((a, b) => a.localeCompare(b)),
    entry_kind: "participant", active: true, deleted_at: null,
  };
}
