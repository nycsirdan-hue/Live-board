export const EVENT_V2_MARKER = "[[LIVEBOARD_EVENT_V2:";
const EVENT_V2_PATTERN = /\n?\[\[LIVEBOARD_EVENT_V2:(\{[^\n]*\})\]\]\s*$/;

export const ROW_LAYOUTS = {
  "100": [100],
  "50-50": [50, 50],
  "60-40": [60, 40],
  "40-60": [40, 60],
  thirds: [33.333, 33.333, 33.333],
};

export const FIELD_TYPES = [
  ["name", "Name / display name"], ["position", "Role / position"],
  ["select", "Select buttons"], ["text", "Text field"],
  ["textarea", "Textarea"], ["multi-select", "Multi-select"],
  ["checkbox", "Checkbox"], ["social", "Social handle"], ["photo", "Photo"],
];

export const LEGEND_LIBRARY = [
  { key: "name_position", icon: "👤", label: "Name | Position" },
  { key: "identity_seeking", icon: "↔", label: "I am a → Seeking | Orientation" },
  { key: "intention", icon: "💡", label: "Intention" },
  { key: "looking_for", icon: "🔎", label: "Looking for" },
  { key: "social_handles", icon: "@", label: "Social handles" },
  { key: "interests", icon: "👀", label: "Interests" },
  { key: "sexual_preferences", icon: "🍑🍆", label: "Sexual preferences" },
  { key: "likes_to_give", icon: "↑", label: "Likes to give" },
  { key: "likes_to_receive", icon: "↓", label: "Likes to receive" },
  { key: "limits", icon: "⛔", label: "Limits" },
  { key: "experience", icon: "%", label: "Experience" },
];

const createStandardPricing = () => [
  { id: crypto.randomUUID(), key: "solo", label: "Solo", amount: "", currency: "USD", active: true },
  { id: crypto.randomUUID(), key: "partners", label: "Partners (2)", amount: "", currency: "USD", active: true },
  { id: crypto.randomUUID(), key: "members", label: "Members", amount: "", currency: "USD", active: true },
];

export function createEventDefinition() {
  return {
    version: 2,
    slug: "",
    name: "",
    category: "",
    shortLabel: "",
    active: true,
    timing: { startTime: "", endTime: "" },
    pricing: createStandardPricing(),
    media: { slidesEnabled: false, slides: [], mediaDurationSeconds: 60, liveboardDurationSeconds: 300, transitionSeconds: 0.5 },
    entryForm: {
      title: "Event Entry Form",
      rows: [{ id: crypto.randomUUID(), layout: "100", fields: [createEventField("name")] }],
    },
    legend: { items: [] },
    display: { entryFormPreset: "standard", participantLayout: "tiles", sizingMode: "automatic", columns: 4, entryFillDirection: "row", sizing: {} },
  };
}

export function createEventField(type = "select") {
  const typeLabel = FIELD_TYPES.find(([key]) => key === type)?.[1] || "Question";
  return {
    id: crypto.randomUUID(), type, label: typeLabel, helperText: "", required: type === "name",
    visible: true, answerStyle: type === "select" || type === "multi-select" ? "buttons" : "input",
    options: type === "select" || type === "multi-select" ? ["Option 1", "Option 2"] : [],
    displayBehavior: "card", color: "cyan",
  };
}

export function parseEventV2(description = "") {
  const match = String(description).match(EVENT_V2_PATTERN);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

export function stripEventV2(description = "") {
  return String(description).replace(EVENT_V2_PATTERN, "").trimEnd();
}

export function serializeEventV2(description, config) {
  return `${stripEventV2(description)}\n${EVENT_V2_MARKER}${JSON.stringify(config)}]]`.trim();
}

export function eventConfigToLegacyFormConfig(config) {
  const result = {};
  for (const row of config?.entryForm?.rows || []) {
    for (const field of row.fields || []) {
      if (field.visible === false || field.type === "name") continue;
      const keyMap = { position: "position", social: "social", photo: "photo", select: field.id, "multi-select": field.id, text: field.id, textarea: field.id, checkbox: field.id };
      const key = keyMap[field.type] || field.id;
      result[key] = {
        enabled: true, label: field.label, prompt: field.helperText || "",
        options: (field.options || []).map((label) => ({ label, enabled: true })),
        answerStyle: field.answerStyle || "input", rowId: row.id, rowLayout: row.layout,
        customField: {
          enabled: ["text", "textarea"].includes(field.type), label: field.label,
          placeholder: field.helperText || "", required: Boolean(field.required),
          multiline: field.type === "textarea", maxLength: field.type === "textarea" ? 500 : 160,
        },
      };
    }
  }
  return result;
}
