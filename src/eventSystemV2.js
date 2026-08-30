export const EVENT_V2_MARKER = "[[LIVEBOARD_EVENT_V2:";
const EVENT_V2_PATTERN = /\n?\[\[LIVEBOARD_EVENT_V2:(\{[^\n]*\})\]\]\s*$/;

export const ROW_LAYOUTS = {
  100: [100],
  "50-50": [50, 50],
  "60-40": [60, 40],
  "40-60": [40, 60],
  thirds: [33.333, 33.333, 33.333],
};

export const FIELD_TYPES = [
  ["name", "Name / display name"],
  ["position", "Role / position"],
  ["select", "Select buttons"],
  ["text", "Text field"],
  ["textarea", "Textarea"],
  ["multi-select", "Multi-select"],
  ["checkbox", "Checkbox"],
  ["social", "Social handle"],
  ["photo", "Photo"],
];

export const SOCIAL_PLATFORM_OPTIONS = [
  "FetLife",
  "Whappz",
  "Twitter",
  "Bluesky",
  "Instagram / IG",
  "Telegram",
];

export const EVENT_FORM_PRESETS = [
  { key: "standard", label: "Standard" },
  { key: "men_only", label: "Men only" },
  { key: "mens_spanking", label: "Men’s spanking" },
  { key: "krinkles_social_play", label: "KrINKles social play" },
  { key: "diaper_debauchery_glow", label: "Diaper Debauchery" },
];

const formPresetOptions = {
  position: ["Top", "Bottom", "Switch"],
  identity: ["Male", "Female", "Other"],
  seeking: ["Male", "Female", "Open", "Other"],
  orientation: ["Straight", "Bi", "Gay", "Queer", "Pan", "Other"],
  intention: [
    "New here",
    "Open to play",
    "Partnered",
    "Scenes planned",
    "Learn New Skills",
    "Watching",
  ],
  sexual: [
    "No Sex",
    "Discuss Sex First",
    "No Sex / Not Sexual",
    "Sex",
    "Oral",
    "Anal",
    "Fisting",
    "Condoms",
    "Safe Only",
  ],
  interests: [
    "BDSM",
    "Impact Play",
    "Spanking",
    "Bondage",
    "Rope",
    "Electro",
    "Floggers",
    "Paddles",
    "Canes",
    "Crops",
    "Straps",
    "Open-Hand Impact",
    "Closed-Hand Impact",
    "Light Impact",
    "Heavy Impact",
    "Warm-Up Needed",
  ],
  spankingIntention: [
    "Open to try",
    "Discuss Limits",
    "Open to Play",
    "Watching",
  ],
  implements: ["Paddles", "Straps", "Belt", "Brushes", "Canes", "Hands"],
  limits: ["No wood", "No leather", "Domestic implements only"],
  experience: [
    "New - No Experience",
    "Beginner",
    "Intermediate",
    "Experienced",
  ],
  socialVibe: [
    "Little",
    "Middle",
    "Big",
    "Caregiver",
    "Mommy",
    "Daddy",
    "Switchy",
    "Shy",
    "Social",
    "Playful",
  ],
  socialLooking: [
    "Friends",
    "Chat",
    "Cuddles",
    "Movie buddy",
    "Playtime",
    "Caregiver connection",
    "Diaper change",
    "Social only",
    "Ask me first",
  ],
  socialActivities: [
    "Coloring",
    "Games",
    "Movies",
    "Story Time",
    "Stuffies",
    "Cuddling",
    "Diaper Play",
    "Changing",
    "Caregiving",
    "Roleplay",
    "Hanging Out",
  ],
  diaperVibe: [
    "Little",
    "Middle",
    "Big",
    "Caregiver",
    "Mommy",
    "Daddy",
    "Kinky",
    "Switchy",
    "Open to connect",
    "Open to play",
  ],
  diaperLooking: [
    "Friends",
    "Chat",
    "Cuddles",
    "Movie buddy",
    "Playtime",
    "Scene partner",
    "Diaper change",
    "Caregiver connection",
    "Social only",
    "Ask me first",
  ],
  diaperSexual: [
    "No Sex",
    "Discuss Sex First",
    "Safe Only",
    "Buzzy Time",
    "Diaper Sexual",
  ],
};

const presetField = (
  legacyKey,
  type,
  label,
  helperText,
  options = [],
  extra = {},
) => ({
  ...createEventField(type),
  legacyKey,
  label,
  helperText,
  options: [...options],
  ...extra,
});

const presetRow = (layout, fields) => ({
  id: crypto.randomUUID(),
  layout,
  fields,
});
const attendeeCustom = (label, placeholder, multiline = true) => ({
  customEntry: {
    enabled: true,
    label,
    placeholder,
    required: false,
    multiline,
  },
});

export function createEventFormFromPreset(presetKey = "standard") {
  const namePhoto = presetRow("50-50", [
    presetField("name", "name", "Name / display name", "Required"),
    presetField(
      "photo",
      "photo",
      "Profile photo",
      "Add an optional profile photo.",
    ),
  ]);
  const social = presetRow("100", [
    presetField(
      "social",
      "social",
      "Social Handles",
      "Select the platforms attendees may add.",
      SOCIAL_PLATFORM_OPTIONS,
      attendeeCustom(
        "Other social platform / handle",
        "Platform and handle",
        false,
      ),
    ),
  ]);
  const position = presetRow("100", [
    presetField(
      "position",
      "position",
      "Position",
      "Choose how you want to be listed.",
      formPresetOptions.position,
    ),
  ]);
  const standardConnection = presetRow("thirds", [
    presetField(
      "identity",
      "select",
      "I am a",
      "Choose one, or use Other.",
      formPresetOptions.identity,
      attendeeCustom("Type identity", "Type identity", false),
    ),
    presetField(
      "seeking",
      "select",
      "Searching for",
      "Choose who you are seeking tonight.",
      formPresetOptions.seeking,
      attendeeCustom(
        "Type who you are seeking",
        "Type who you are seeking",
        false,
      ),
    ),
    presetField(
      "orientation",
      "select",
      "Orientation",
      "Choose one, or use Other.",
      formPresetOptions.orientation,
      attendeeCustom(
        "Type orientation / connection style",
        "Type orientation / connection style",
        false,
      ),
    ),
  ]);
  const selectRow = (key, label, prompt, options, extra = {}) =>
    presetRow("100", [
      presetField(key, "multi-select", label, prompt, options, extra),
    ]);
  const commonTail = [
    selectRow(
      "intention",
      "Intention",
      "Choose all that apply.",
      formPresetOptions.intention,
    ),
    selectRow(
      "sexual",
      "Sexual Preferences",
      "Selections are conversation starters, not consent.",
      formPresetOptions.sexual,
      attendeeCustom(
        "Anything else about sexual preferences or safer sex",
        "Ask me first, condoms only, safer sex notes",
      ),
    ),
    selectRow(
      "interests",
      "Interests",
      "Choose any that apply.",
      formPresetOptions.interests,
      attendeeCustom(
        "Anything else about your interests or kinks",
        "Rope, impact, watching, service, limits",
      ),
    ),
  ];

  let rows;
  if (presetKey === "standard")
    rows = [namePhoto, social, position, standardConnection, ...commonTail];
  else if (presetKey === "men_only")
    rows = [namePhoto, social, position, ...commonTail];
  else if (presetKey === "mens_spanking")
    rows = [
      namePhoto,
      social,
      position,
      selectRow(
        "intention",
        "Intention",
        "Choose all that apply.",
        formPresetOptions.spankingIntention,
      ),
      selectRow(
        "topImplements",
        "As a top I like to use",
        "Choose all that apply.",
        formPresetOptions.implements,
        attendeeCustom(
          "Other / type your own",
          "Other implements you like to use",
        ),
      ),
      selectRow(
        "bottomImplements",
        "As a bottom I like to receive",
        "Choose all that apply.",
        formPresetOptions.implements,
        attendeeCustom(
          "Other / type your own",
          "Other implements you like to receive",
        ),
      ),
      selectRow(
        "limits",
        "Limits",
        "Choose all that apply.",
        formPresetOptions.limits,
        attendeeCustom("Other limits", "Type any other limits"),
      ),
      selectRow(
        "experience",
        "Experience",
        "Choose one.",
        formPresetOptions.experience,
      ),
      selectRow(
        "sexual",
        "Sexual Preferences",
        "Selections are conversation starters, not consent.",
        formPresetOptions.sexual,
        attendeeCustom(
          "Anything else about sexual preferences or safer sex",
          "Safer sex notes or specific limits",
        ),
      ),
      selectRow(
        "interests",
        "Interests",
        "Choose any that apply.",
        formPresetOptions.interests,
        attendeeCustom(
          "Anything else about your interests or kinks",
          "Impact, service, scene interests",
        ),
      ),
    ];
  else if (presetKey === "krinkles_social_play")
    rows = [
      namePhoto,
      social,
      selectRow(
        "vibe",
        "Vibe Tonight",
        "Choose the vibe you want people to see on the board.",
        formPresetOptions.socialVibe,
      ),
      selectRow(
        "lookingFor",
        "Looking For",
        "Choose the kind of connection or company you are open to tonight.",
        formPresetOptions.socialLooking,
      ),
      selectRow(
        "interests",
        "Play & Activities",
        "Choose the kinds of play, activities, or connection you would enjoy.",
        formPresetOptions.socialActivities,
        attendeeCustom(
          "Anything else?",
          "Anything else you'd like people to know",
        ),
      ),
    ];
  else
    rows = [
      namePhoto,
      social,
      selectRow(
        "vibe",
        "Vibe Tonight",
        "Choose the vibe you want people to see on the board.",
        formPresetOptions.diaperVibe,
      ),
      selectRow(
        "lookingFor",
        "Looking For",
        "Choose what kind of connection you are open to tonight.",
        formPresetOptions.diaperLooking,
      ),
      selectRow(
        "sexual",
        "Sexual Preferences",
        "Selections are conversation starters, not consent.",
        formPresetOptions.diaperSexual,
        attendeeCustom(
          "Anything else about sexual preferences or safer sex",
          "Ask me first, safer sex notes, specific limits",
        ),
      ),
      selectRow(
        "interests",
        "Kinks | Fetishes | Responsibilities",
        "Choose any that apply, then type anything else you want people to know.",
        formPresetOptions.interests,
        attendeeCustom(
          "Kinks, fetishes, responsibilities, or scene interests",
          "Diaper play, impact, service, rope, caregiver energy",
        ),
      ),
    ];

  return {
    title:
      EVENT_FORM_PRESETS.find((preset) => preset.key === presetKey)?.label ||
      "Event Entry Form",
    rows,
  };
}

export function createEventBlockLibrary() {
  return EVENT_FORM_PRESETS.flatMap((preset) =>
    createEventFormFromPreset(preset.key).rows.flatMap((row) =>
      row.fields.map((field) => ({
        key: `${preset.key}:${field.legacyKey || field.type}`,
        presetKey: preset.key,
        presetLabel: preset.label,
        label: field.label,
        field,
      })),
    ),
  );
}

export const LEGEND_LIBRARY = [
  { key: "name_position", icon: "👤", label: "Name | Position" },
  {
    key: "identity_seeking",
    icon: "↔",
    label: "I am a → Seeking | Orientation",
  },
  { key: "intention", icon: "💡", label: "Intention" },
  { key: "looking_for", icon: "🔎", label: "Looking for" },
  { key: "social_handles", icon: "@", label: "Social handles" },
  { key: "interests", icon: "👀", label: "Interests" },
  { key: "sexual_preferences", icon: "🍑🍆", label: "Sexual preferences" },
  { key: "likes_to_give", icon: "↑", label: "Likes to give", color: "#ef4444" },
  {
    key: "likes_to_receive",
    icon: "↓",
    label: "Likes to receive",
    color: "#22c55e",
  },
  { key: "switch", icon: "switch", label: "Switch", color: "#3b82f6" },
  { key: "limits", icon: "⛔", label: "Limits" },
  { key: "experience", icon: "%", label: "Experience" },
];

const createStandardPricing = () => [
  {
    id: crypto.randomUUID(),
    key: "solo",
    label: "Solo",
    amount: "",
    currency: "USD",
    active: true,
  },
  {
    id: crypto.randomUUID(),
    key: "partners",
    label: "Partners (2)",
    amount: "",
    currency: "USD",
    active: true,
  },
  {
    id: crypto.randomUUID(),
    key: "members",
    label: "Members",
    amount: "",
    currency: "USD",
    active: true,
  },
];

export function createKioskPreview() {
  return {
    enabled: true,
    name: "Alex",
    socialHandle: "@alex",
    socialPlatform: "FetLife",
    socialOtherPlatform: "",
    photoDataUrl: "",
    socialHandles: { FetLife: "@alex" },
    selections: {
      position: ["Top"],
      intention: ["New here", "Watching"],
      sexual: ["Discuss Sex First"],
      interests: ["BDSM", "Rope", "Impact Play"],
    },
    customEntries: {
      interests: ["Fire Play", "Electro Stimulation"],
    },
  };
}

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
    media: {
      slidesEnabled: false,
      slides: [],
      mediaDurationSeconds: 60,
      liveboardDurationSeconds: 300,
      transitionSeconds: 0.5,
    },
    entryForm: {
      title: "Event Entry Form",
      ...createEventFormFromPreset("standard"),
    },
    kioskPreview: createKioskPreview(),
    legend: {
      items: [],
      columns: 2,
      fillDirection: "column",
      size: 0,
      rowSpacing: 0,
      columnSpacing: 0,
    },
    display: {
      entryFormPreset: "standard",
      backgroundTheme: "red_blue",
      participantLayout: "tiles",
      sizingMode: "automatic",
      columns: 4,
      entryFillDirection: "row",
      sizing: {},
    },
  };
}

export function createEventField(type = "select") {
  const typeLabel =
    FIELD_TYPES.find(([key]) => key === type)?.[1] || "Question";
  const standardOptions =
    type === "position"
      ? [...formPresetOptions.position]
      : type === "select" || type === "multi-select"
        ? ["Option 1", "Option 2"]
        : [];
  return {
    id: crypto.randomUUID(),
    type: type === "position" ? "select" : type,
    ...(type === "position" ? { legacyKey: "position" } : {}),
    label: typeLabel,
    helperText: "",
    required: type === "name",
    visible: true,
    answerStyle:
      type === "select" || type === "multi-select" ? "buttons" : "input",
    options: standardOptions,
    customEntry: {
      enabled: false,
      label: "Other",
      placeholder: "Add your own answer",
      required: false,
      multiline: false,
    },
    displayBehavior: "card",
    color: "blue",
    height: "standard",
  };
}

export function parseEventV2(description = "") {
  const match = String(description).match(EVENT_V2_PATTERN);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
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
      const keyMap = {
        position: "position",
        social: "social",
        photo: "photo",
        select: field.id,
        "multi-select": field.id,
        text: field.id,
        textarea: field.id,
        checkbox: field.id,
      };
      const key = field.legacyKey || keyMap[field.type] || field.id;
      result[key] = {
        enabled: true,
        label: field.label,
        prompt: field.helperText || "",
        options: (field.type === "position" && !(field.options || []).length
          ? formPresetOptions.position
          : field.options || []
        ).map((label) => ({ label, enabled: true })),
        answerStyle: field.answerStyle || "input",
        rowId: row.id,
        rowLayout: row.layout,
        color: field.color || "blue",
        height: field.height || "standard",
        customField: field.customEntry?.enabled
          ? {
              enabled: true,
              label: field.customEntry.label || "Other",
              placeholder:
                field.customEntry.placeholder || "Add your own answer",
              required: Boolean(field.customEntry.required),
              multiline: Boolean(field.customEntry.multiline),
              maxLength: field.customEntry.multiline ? 500 : 160,
            }
          : {
              enabled: ["text", "textarea"].includes(field.type),
              label: field.label,
              placeholder: field.helperText || "",
              required: Boolean(field.required),
              multiline: field.type === "textarea",
              maxLength: field.type === "textarea" ? 500 : 160,
            },
      };
    }
  }
  return result;
}
