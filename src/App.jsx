import React, { useEffect, useMemo, useRef, useState } from "react";
import { eventDisplayPresets } from "./eventDisplayPresets";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const EVENT_DISPLAY_BUCKET = "event-display-slides";
const PARTICIPANT_PHOTO_FOLDER = "participant-photos";
const PARTICIPANT_PHOTO_MARKER = "__LIVEBOARD_PHOTO__:";
const EVENT_SCHEDULE_PATTERN = /\n?\[\[LIVEBOARD_SCHEDULE:(\{[^\n]*\})\]\]\s*$/;

function getParticipantPhoto(items = []) {
  const marker = items.find(
    (item) => typeof item === "string" && item.startsWith(PARTICIPANT_PHOTO_MARKER)
  );

  if (!marker) return null;

  try {
    const photo = JSON.parse(marker.slice(PARTICIPANT_PHOTO_MARKER.length));
    return photo?.path && photo?.url ? photo : null;
  } catch {
    return null;
  }
}

function getVisibleEntryItems(items = []) {
  return items.filter(
    (item) => !(typeof item === "string" && item.startsWith(PARTICIPANT_PHOTO_MARKER))
  );
}

function createParticipantPhotoMarker(photo) {
  return PARTICIPANT_PHOTO_MARKER + JSON.stringify(photo);
}

async function uploadParticipantPhoto(file) {
  const extension = file.type === "image/png" ? "png" : "jpg";
  const path = `${PARTICIPANT_PHOTO_FOLDER}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(EVENT_DISPLAY_BUCKET)
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(EVENT_DISPLAY_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

async function prepareParticipantPhoto(file, zoom = 1, horizontalPosition = 50, verticalPosition = 50) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error("Please choose a photo smaller than 15 MB.");
  }

  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise((resolve, reject) => {
      const loader = new Image();
      loader.onload = () => resolve(loader);
      loader.onerror = () => reject(new Error("This photo format could not be read."));
      loader.src = sourceUrl;
    });
    const safeZoom = Math.min(3, Math.max(1, Number(zoom) || 1));
    const side = Math.min(image.naturalWidth, image.naturalHeight) / safeZoom;
    const sourceX = Math.max(
      0,
      (image.naturalWidth - side) * (Math.min(100, Math.max(0, horizontalPosition)) / 100)
    );
    const sourceY = Math.max(
      0,
      (image.naturalHeight - side) * (Math.min(100, Math.max(0, verticalPosition)) / 100)
    );
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    canvas.getContext("2d").drawImage(image, sourceX, sourceY, side, side, 0, 0, 512, 512);

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("The photo could not be prepared.")),
        "image/jpeg",
        0.78
      );
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function parseEventScheduleDescription(value) {
  const rawDescription = String(value || "");
  const match = rawDescription.match(EVENT_SCHEDULE_PATTERN);

  if (!match) {
    return { description: rawDescription, eventStartTime: "", eventEndTime: "", slidesEnabled: true };
  }

  try {
    const schedule = JSON.parse(match[1]);
    return {
      description: rawDescription.replace(EVENT_SCHEDULE_PATTERN, "").trimEnd(),
      eventStartTime: /^\d{2}:\d{2}$/.test(schedule.start || "") ? schedule.start : "",
      eventEndTime: /^\d{2}:\d{2}$/.test(schedule.end || "") ? schedule.end : "",
      slidesEnabled: schedule.slidesEnabled !== false,
    };
  } catch {
    return { description: rawDescription, eventStartTime: "", eventEndTime: "", slidesEnabled: true };
  }
}

function serializeEventScheduleDescription(description, eventStartTime, eventEndTime, slidesEnabled = true) {
  const cleanDescription = String(description || "").replace(EVENT_SCHEDULE_PATTERN, "").trim();

  if (!eventStartTime && !eventEndTime && slidesEnabled) return cleanDescription;

  const schedule = JSON.stringify({
    start: eventStartTime || "",
    end: eventEndTime || "",
    slidesEnabled: Boolean(slidesEnabled),
  });
  return `${cleanDescription}\n[[LIVEBOARD_SCHEDULE:${schedule}]]`.trim();
}

function getEasternSecondsOfDay(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return Number(values.hour) * 3600 + Number(values.minute) * 60 + Number(values.second);
}

function getEventCountdown(eventStartTime, eventEndTime, now) {
  if (!/^\d{2}:\d{2}$/.test(eventEndTime || "")) return null;

  const toSeconds = (value) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 3600 + minutes * 60;
  };
  const nowSeconds = getEasternSecondsOfDay(now);
  const endSeconds = toSeconds(eventEndTime);
  const hasStartTime = /^\d{2}:\d{2}$/.test(eventStartTime || "");
  let remainingSeconds;

  if (!hasStartTime) {
    remainingSeconds = endSeconds - nowSeconds;
  } else {
    const startSeconds = toSeconds(eventStartTime);
    const isOvernightEvent = endSeconds <= startSeconds;

    if (isOvernightEvent) {
      if (nowSeconds >= startSeconds) {
        remainingSeconds = 86400 - nowSeconds + endSeconds;
      } else if (nowSeconds < endSeconds) {
        remainingSeconds = endSeconds - nowSeconds;
      } else {
        remainingSeconds = 86400 - nowSeconds + endSeconds;
      }
    } else {
      remainingSeconds = nowSeconds < endSeconds ? endSeconds - nowSeconds : 0;
    }
  }

  if (remainingSeconds <= 0) return "Event ended";

  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function slugifyEventDisplay(value) {
  return String(value || "event-display")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "event-display";
}

function mapEventDisplayPresetRow(row) {
  const schedule = parseEventScheduleDescription(row.event_description);

  return {
    id: row.id,
    eventName: row.event_name || "Untitled Event",
    eventDescription: schedule.description,
    eventStartTime: schedule.eventStartTime,
    eventEndTime: schedule.eventEndTime,
    slidesEnabled: schedule.slidesEnabled,
    liveboardDurationSeconds: Number(row.liveboard_duration_seconds) || 300,
    transitionSeconds: Number(row.transition_seconds) || 0.5,
    images: Array.isArray(row.images) ? row.images : [],
    source: "supabase",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function uploadEventDisplayImagesToSupabase(images, presetName) {
  if (!supabase) return images;

  const presetSlug = slugifyEventDisplay(presetName);
  const folder = `${presetSlug}-${Date.now()}`;
  const uploadedImages = [];

  for (const [index, image] of images.entries()) {
    if (!image?.imageUrl || !String(image.imageUrl).startsWith("data:")) {
      uploadedImages.push(image);
      continue;
    }

    const response = await fetch(image.imageUrl);
    const blob = await response.blob();
    const contentType = blob.type || "image/png";
    const extension = contentType.split("/")[1] || "png";
    const cleanName = slugifyEventDisplay(image.name || `slide-${index + 1}`);
    const path = `${folder}/${String(index + 1).padStart(2, "0")}-${cleanName}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(EVENT_DISPLAY_BUCKET)
      .upload(path, blob, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage
      .from(EVENT_DISPLAY_BUCKET)
      .getPublicUrl(path);

    uploadedImages.push({
      ...image,
      imageUrl: data.publicUrl,
      storagePath: path,
    });
  }

  return uploadedImages;
}

const DISPLAY_LOGO_SRC = "/sanctuary-sessions-logo.png";

const kinkCatalog = {
  Impact: [
    "Spanking","Flogging","Caning","Paddling","Whipping","Slapping","Tawse","Strapping","Birching","Punch Play","Face Slapping","Corporal Punishment","Beating","Rhythm Play","Crops",
  ],
  Bondage: [
    "Rope Bondage","Shibari","Restraints","Cuffs","Mummification","Predicament Bondage","Hogtie","Spreader Bars","Suspension","Partial Suspension","Bed Restraints","Tape Bondage","Blindfolds","Gags","Collars","Leashes","Chain Bondage","Cocooning","Monobondage",
  ],
  Sensation: [
    "Wax Play","Ice Play","Sensory Deprivation","Sensory Overload","Tickling","Wartenberg Wheel","Feather Play","Temperature Play","Electrical Play","Violet Wand","TENS","Scratching","Nipple Play","Clothespins","Pinwheels","Pressure Play","Hot Oil Massage","Texture Play",
  ],
  PowerExchange: [
    "Dominance","Submission","Service","Protocol","Ritual","Obedience","Discipline","Training","Ownership","Collaring","Authority Transfer","Bratting","Brat Taming","Praise","Humiliation","Degradation","Financial Domination","Tasking","Rules and Rituals",
  ],
  Roleplay: [
    "Age Play","Caregiver/Little","Teacher/Student","Boss/Employee","Medical Roleplay","Interrogation","Pet Play","Pup Play","Kitten Play","Pony Play","Handler Dynamics","Religious Play","Uniform Play","Authority Roleplay","Objectification","Doll Play","Fantasy Roleplay","Primal Play","Hunter/Prey",
  ],
  BodyWorship: [
    "Foot Worship","Boot Worship","Body Worship","Ass Worship","Leg Worship","Muscle Worship","Armpit Worship","Hand Worship","Face Worship","Leather Worship","Scent Worship","Sock Worship","Sneaker Worship","Sweat Worship",
  ],
  EroticControl: [
    "Tease and Denial","Edging","Orgasm Control","Orgasm Denial","Forced Orgasm","Chastity","Ruined Orgasm","Mutual Masturbation","JOI","Cum Control","Keyholding",
  ],
  ToysAndInsertion: [
    "Plug Training","Dildos","Anal Play","Vaginal Penetration","Double Penetration","Sounding","Fisting","Double Fisting","Toy Training","Prostate Play","Beads","Pump Play","Large Toys","Speculum Play",
  ],
  ExhibitionAndVoyeurism: [
    "Exhibitionism","Voyeurism","Group Scene","Public-Style Play","Performance Play","Audience Play","Show and Tell","Camera Play","Striptease","Dressing/Undressing",
  ],
  FetishMaterials: [
    "Leather","Latex","Rubber","PVC","Lycra","Nylon","Corsetry","Lingerie Fetish","Stockings","Gloves","Masks","Gas Masks","Uniforms","Sneaker Fetish","Onesies","Plastic Pants","Pajama Fetish",
  ],
  ServiceAndDomestic: [
    "Domestic Service","Bootblacking","Serving","Protocol Service","Cleaning Service","Meal Service","Personal Attendant","Acts of Devotion","Ritual Service","Caretaking",
  ],
  IntimacyAndAffection: [
    "Cuddling","Aftercare","Massage","Eye Contact","Breath Sync","Tantric Touch","Held Space","Nonsexual Touch","Affirmation","Emotional Submission","Comforting","Nurturing","Emotional Holding",
  ],
  MarkingAndAdornment: [
    "Body Writing","Temporary Marking","Bruising","Bite Marks","Hickeys","Scratches","Collaring","Adornment","Piercing Pulls","Clothing Control",
  ],
  WatersportsAndMess: [
    "Watersports","Mess Play","Food Play","Sploshing","Diaper Play","ABDL","Lactation Play","Saliva Play","Wetting","Simulated Wetting","Messing","Simulated Messing","Messy Diapers","Changing","Diaper Check","Diaper Inspection","Cleanup After Mess","Powdering","Lotioning","Pudding Play","Applesauce Play","Yogurt Play","Oatmeal Play","Bananas","Marshmallows","Whipped Cream","Baby Food Play","Spoon Feeding","Bottle Feeding","Smearing","Hands-On Mess","Texture Play",
  ],
  Other: [
    "Primal Intensity","Fear Play","Kidnapping Fantasy","Crying in Scene","Cathartic Release","Energy Exchange","Meditative Play","Breath Play","Rough Body Play","Knife Play","Fire Play","Public-Style Padding","Crinkling","Padding","Stuffies","Blankets","Nursery Vibes","Bedtime Routine","Bedtime","Naptime","Story Time","Structure","Gentle Correction","Waddling","Pacifiers","Bibs","Sippy Cups",
  ],
};

const positionOptions = ["Top", "Bottom", "Switch"];
const identityOptions = ["Male", "Female", "Other"];
const seekingOptions = ["Male", "Female", "Open", "Other"];
const orientationOptions = ["Straight", "Bi", "Gay", "Queer", "Pan", "Other"];

const defaultSexualPreferenceOptions = [
  "No Sex",
  "Discuss Sex First",
  "No Sex / Not Sexual",
  "Sex",
  "Oral",
  "Anal",
  "Fisting",
  "Condoms",
  "Safe Only",
];

const defaultInterestOptions = [
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
];

const REMOVED_ENTRY_OPTION_PREFIX = "__liveboard_removed_option__:";
const PARTICIPANT_PHOTO_SETTING_PREFIX = "__liveboard_setting__:participant_photos=";
const TELEGRAM_SETTING_PREFIX = "__liveboard_setting__:telegram=";
const PARTICIPANT_COLUMNS_SETTING_PREFIX = "__liveboard_setting__:participant_columns=";

const getRemovedEntryOptionMarker = (option) => REMOVED_ENTRY_OPTION_PREFIX + option;
const isRemovedEntryOptionMarker = (option) =>
  String(option || "").startsWith(REMOVED_ENTRY_OPTION_PREFIX);
const isParticipantPhotoSettingMarker = (option) =>
  String(option || "").startsWith(PARTICIPANT_PHOTO_SETTING_PREFIX);
const getParticipantPhotoSetting = (options) => {
  const marker = (options || []).find(isParticipantPhotoSettingMarker);
  return marker ? marker === PARTICIPANT_PHOTO_SETTING_PREFIX + "on" : true;
};
const withParticipantPhotoSetting = (options, enabled) => [
  ...(options || []).filter((option) => !isParticipantPhotoSettingMarker(option)),
  PARTICIPANT_PHOTO_SETTING_PREFIX + (enabled ? "on" : "off"),
];
const withoutParticipantPhotoSetting = (options) =>
  (options || []).filter((option) => !isParticipantPhotoSettingMarker(option));
const isTelegramSettingMarker = (option) =>
  String(option || "").startsWith(TELEGRAM_SETTING_PREFIX);
const getTelegramSetting = (options) => {
  const marker = (options || []).find(isTelegramSettingMarker);
  return marker ? marker === TELEGRAM_SETTING_PREFIX + "on" : true;
};
const withTelegramSetting = (options, enabled) => [
  ...(options || []).filter((option) => !isTelegramSettingMarker(option)),
  TELEGRAM_SETTING_PREFIX + (enabled ? "on" : "off"),
];
const withoutTelegramSetting = (options) =>
  (options || []).filter((option) => !isTelegramSettingMarker(option));
const isParticipantColumnsSettingMarker = (option) =>
  String(option || "").startsWith(PARTICIPANT_COLUMNS_SETTING_PREFIX);
const clampParticipantColumns = (value) => Math.min(6, Math.max(3, Number(value) || 4));
const getParticipantColumnsSetting = (options) => {
  const marker = (options || []).find(isParticipantColumnsSettingMarker);
  return marker
    ? clampParticipantColumns(marker.slice(PARTICIPANT_COLUMNS_SETTING_PREFIX.length))
    : 4;
};
const withParticipantColumnsSetting = (options, columns) => [
  ...(options || []).filter((option) => !isParticipantColumnsSettingMarker(option)),
  PARTICIPANT_COLUMNS_SETTING_PREFIX + clampParticipantColumns(columns),
];
const withoutParticipantColumnsSetting = (options) =>
  (options || []).filter((option) => !isParticipantColumnsSettingMarker(option));
const quickTagOptions = ["New here", "Open to play", "Partnered", "Scenes planned", "Learn New Skills", "Watching"];

const diaperDebaucheryVibeOptions = [
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
];

const diaperDebaucheryLookingForOptions = [
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
];

const diaperDebaucherySexualPreferenceOptions = [
  "No Sex",
  "Discuss Sex First",
  "Safe Only",
  "Buzzy Time",
  "Diaper Sexual",
];

const handlePlatformOptions = ["FetLife", "Whappz", "Twitter", "Bluesky", "Instagram / IG", "Telegram"];
const spankingImplementOptions = ["Paddles", "Straps", "Belt", "Brushes", "Canes", "Hands"];
const spankingLimitOptions = ["No wood", "No leather", "Domestic implements only"];
const spankingIntentionOptions = ["Open to try", "Discuss Limits", "Open to Play", "Watching"];
const spankingExperienceOptions = ["New - No Experience", "Beginner", "Intermediate", "Experienced"];

const searchAliases = {
  rope: ["Rope Bondage", "Shibari", "Suspension", "Partial Suspension"],
  flog: ["Flogging"],
  spank: ["Spanking"],
  wax: ["Wax Play"],
  electric: ["Electrical Play", "Violet Wand", "TENS"],
  feet: ["Foot Worship"],
  foot: ["Foot Worship"],
  boot: ["Boot Worship", "Bootblacking"],
  leather: ["Leather", "Leather Worship"],
  pup: ["Pup Play", "Pet Play", "Handler Dynamics"],
  primal: ["Primal Play", "Primal Intensity", "Hunter/Prey"],
  chastity: ["Chastity", "Keyholding", "Tease and Denial"],
  edging: ["Edging", "Tease and Denial", "Orgasm Control"],
  anal: ["Anal Play", "Plug Training", "Fisting", "Double Fisting", "Beads"],
  plug: ["Plug Training"],
  fist: ["Fisting", "Double Fisting"],
  gape: ["Fisting", "Double Fisting", "Anal Play", "Large Toys"],
  piss: ["Watersports"],
  pee: ["Watersports"],
  diaper: ["Diaper Play", "ABDL", "Changing", "Messy Diapers"],
  abdl: ["ABDL", "Diaper Play", "Changing", "Caregiver/Little"],
  cuddle: ["Cuddling", "Held Space", "Aftercare"],
  massage: ["Massage", "Hot Oil Massage"],
  knife: ["Knife Play"],
  fire: ["Fire Play"],
  breath: ["Breath Play", "Breath Sync"],
  service: ["Service", "Domestic Service", "Protocol Service"],
  protocol: ["Protocol", "Protocol Service", "Rules and Rituals"],
  humil: ["Humiliation", "Degradation"],
  praise: ["Praise", "Affirmation"],
  banana: ["Bananas"],
  bananas: ["Bananas"],
  marshmallow: ["Marshmallows"],
  marshmallows: ["Marshmallows"],
  messy: ["Messy Diapers", "Mess Play", "Simulated Messing"],
  messing: ["Messing", "Simulated Messing", "Messy Diapers"],
  wetting: ["Wetting", "Simulated Wetting"],
};

const defaultConfig = {
  eventName: "Tonight's Board",
  venueName: "The Kink Collective",
  minSelectedItems: 1,
  maxSelectedItems: 12,
};

const defaultDisplayLayout = {
  host_max_rows: 2,
  host_max_cols: 1,
dm_max_rows: 1,
  dm_max_cols: 2,
  top_max_rows: 4,
  top_max_cols: 4,
  bottom_max_rows: 4,
  bottom_max_cols: 4,
  switch_max_rows: 4,
  switch_max_cols: 4,
};

const catalogSet = new Set(Object.values(kinkCatalog).flat());
const allCatalogItems = Array.from(catalogSet).sort((a, b) => a.localeCompare(b));

const sectionThemes = {
  Host: {
    section: "displayThemeHost",
    inner: "displayThemeHostInner",
    title: "displayThemeHostTitle",
  },
  Top: {
    section: "displayThemeTop",
    inner: "displayThemeTopInner",
    title: "displayThemeTopTitle",
  },
  Bottom: {
    section: "displayThemeBottom",
    inner: "displayThemeBottomInner",
    title: "displayThemeBottomTitle",
  },
  Switch: {
    section: "displayThemeSwitch",
    inner: "displayThemeSwitchInner",
    title: "displayThemeSwitchTitle",
  },
  DM: {
    section: "displayThemeDM",
    inner: "displayThemeDMInner",
    title: "displayThemeDMTitle",
  },
};

function useMode() {
  const readMode = () => {
    const urlMode = new URLSearchParams(window.location.search).get("mode");
    if (urlMode === "setup" || urlMode === "display" || urlMode === "entry") {
      return urlMode;
    }
    if (urlMode === "setup-tabs") return "setup";
    if (urlMode === "admin") return "setup";
    return "entry";
  };

  const [mode, setMode] = useState(readMode);

  useEffect(() => {
    const onPop = () => setMode(readMode());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const updateMode = (nextMode) => {
    const params = new URLSearchParams(window.location.search);
    params.set("mode", nextMode);
    window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`);
    setMode(nextMode);
  };

  return { mode, updateMode };
}

function findKinkStrongMatch(rawValue, availableItems) {
  const term = rawValue.trim().toLowerCase();
  if (!term) return null;

  const exact = availableItems.find((item) => item.toLowerCase() === term);
  if (exact) return exact;

  const aliasMatches = searchAliases[term] || [];
  const aliasItem = aliasMatches.find((item) => availableItems.includes(item));
  if (aliasItem) return aliasItem;

  const startsWith = availableItems.find((item) => item.toLowerCase().startsWith(term));
  if (startsWith) return startsWith;

  return null;
}

function clampLayoutValue(value, min = 1, max = 12) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function joinItems(items) {
  return items.join(", ");
}

function sortDisplayItemsByConfiguredOrder(items = []) {
  const configuredOrder = [
    ...defaultSexualPreferenceOptions,
    ...defaultInterestOptions,
  ];

  return [...items].sort((a, b) => {
    const aIndex = configuredOrder.indexOf(a);
    const bIndex = configuredOrder.indexOf(b);

    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;

    return 0;
  });
}



function getSectionGrid(entriesCount, maxRows, maxCols) {
  const rowLimit = Math.max(1, Number(maxRows) || 1);
  const colLimit = Math.max(1, Number(maxCols) || 1);

  if (entriesCount <= 0) return { rows: 1, cols: 1 };

  const cols = Math.min(colLimit, entriesCount);
  const rows = Math.ceil(entriesCount / cols);

  return {
    rows: Math.max(1, rows),
    cols: Math.max(1, cols),
  };
}

function gridPlacement(index, cols) {
  return {
    gridRow: Math.floor(index / cols) + 1,
    gridColumn: (index % cols) + 1,
  };
}

function SocialPlatformIcon({ platform, className = "" }) {
  const normalized = String(platform || "").trim().toLowerCase();
  const baseClass = `inline-flex h-[1.35em] w-[1.35em] shrink-0 items-center justify-center overflow-hidden rounded-[0.35em] text-[0.82em] font-black leading-none ${className}`;

  if (normalized.includes("instagram") || normalized === "ig") {
    return (
      <span className={`${baseClass} bg-gradient-to-br from-amber-400 via-pink-500 to-violet-600 text-white`} title="Instagram" aria-label="Instagram">
        <svg viewBox="0 0 24 24" className="h-[0.9em] w-[0.9em] fill-none stroke-current" aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" strokeWidth="2" />
          <circle cx="12" cy="12" r="4" strokeWidth="2" />
          <circle cx="17.5" cy="6.8" r="1" fill="currentColor" stroke="none" />
        </svg>
      </span>
    );
  }

  if (normalized.includes("bluesky")) {
    return (
      <span className={`${baseClass} bg-[#101827]`} title="Bluesky" aria-label="Bluesky">
        <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
          <path fill="#1677ff" d="M11.95 10.15C10.7 7.75 7.3 3.3 4.15 1.2 1.15-.8 0 0 0 2.1c0 .43.25 3.62.4 4.14.55 1.88 2.5 2.5 4.3 2.25-3.15.47-5.95 1.62-2.28 5.7 4.03 4.17 5.53-.9 7.48-3.47 1.95 2.57 3.45 7.64 7.48 3.47 3.67-4.08.87-5.23-2.28-5.7 1.8.25 3.75-.37 4.3-2.25.15-.52.4-3.71.4-4.14 0-2.1-1.15-2.9-4.15-.9-3.15 2.1-6.55 6.55-7.8 8.95Z" />
        </svg>
      </span>
    );
  }

  if (normalized === "x" || normalized.includes("twitter")) {
    return <span className={`${baseClass} bg-black text-white ring-1 ring-white/30`} title="X / Twitter" aria-label="X / Twitter">𝕏</span>;
  }

  if (normalized.includes("fetlife")) {
    return (
      <span className={`${baseClass} bg-[#080b10] ring-1 ring-white/10`} title="FetLife" aria-label="FetLife">
        <svg viewBox="0 0 24 24" className="h-[1.08em] w-[1.08em]" aria-hidden="true">
          <path fill="#c90812" d="M12 22S3.4 17.1 3.4 10.2c0-2.6 1.45-4.65 3.7-5.5L5.95 1c2.72.75 4.55 2.2 6.05 4.35C13.5 3.2 15.33 1.75 18.05 1L16.9 4.7c2.25.85 3.7 2.9 3.7 5.5C20.6 17.1 12 22 12 22Z" />
        </svg>
      </span>
    );
  }

  if (normalized.includes("whappz")) {
    return (
      <span className={`${baseClass} bg-[#17191d] ring-1 ring-white/20`} title="Whappz" aria-label="Whappz">
        <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
          <text x="11.3" y="18" textAnchor="middle" fill="#ffe126" fontSize="18" fontWeight="950" fontStyle="italic">W</text>
        </svg>
      </span>
    );
  }

  if (normalized.includes("telegram")) {
    return (
      <span className={`${baseClass} bg-[#12151a] ring-1 ring-white/20`} title="Telegram" aria-label="Telegram">
        <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
          <circle cx="12" cy="12" r="9.7" fill="#229ed9" />
          <path fill="#fff" d="M18.55 6.25 16.7 17.2c-.14.78-.58.96-1.17.6l-2.86-2.11-1.38 1.33c-.15.15-.28.28-.57.28l.2-2.92 5.32-4.8c.23-.21-.05-.33-.36-.12L9.3 13.6l-2.83-.89c-.78-.24-.79-.77.16-1.14l11.07-4.27c.65-.24 1.22.16.87 1.57Z" />
        </svg>
      </span>
    );
  }

  return <span className={`${baseClass} bg-slate-600 text-white`} title={platform || "Social handle"} aria-label={platform || "Social handle"}>@</span>;
}

function SocialPlatformLabel({ platform }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <SocialPlatformIcon platform={platform} />
      <span>{platform}</span>
    </span>
  );
}

function SocialHandleDisplay({ platform, handle }) {
  const rawHandle = String(handle || "").trim();
  if (!rawHandle) return null;

  const knownPlatforms = ["Instagram / IG", "Instagram", "FetLife", "Bluesky", "Twitter", "X", "Whappz", "Telegram", "Other"];
  const lines = rawHandle.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const displayLines = platform
    ? [{ platform, handle: rawHandle }]
    : lines.map((line) => {
        const match = line.match(/^([^:]+):\s*(.+)$/);
        const parsedPlatform = match?.[1]?.trim() || "";
        const recognized = knownPlatforms.find((name) => name.toLowerCase() === parsedPlatform.toLowerCase());
        return recognized
          ? { platform: recognized, handle: match[2].trim() }
          : { platform: "Other", handle: line };
      });

  return (
    <span className="grid w-full grid-cols-2 gap-x-3 gap-y-1">
      {displayLines.map((line, index) => (
        <span key={`${line.platform}-${line.handle}-${index}`} className="inline-flex min-w-0 items-center gap-1.5">
          <SocialPlatformIcon platform={line.platform} />
          <span className="min-w-0 break-all">{line.handle}</span>
        </span>
      ))}
    </span>
  );
}

function EntryLine({
  name,
  participantPhoto = null,
  socialHandle,
  socialPlatform,
  whoAmI,
  seeking,
  items,
  compact = false,
  itemLimit = 8,
  category = "",
  isDM = false,
  isHost = false,
  preserveTaggedCategories = false,
}) {
  const rawItems = getVisibleEntryItems(items || []);

  const cleanDisplayItem = (item) =>
    typeof item === "string"
      ? item
          .replace(/^Interests:\s*/i, "")
          .replace(/^Interest:\s*/i, "")
          .replace(/^Sexual:\s*/i, "")
          .replace(/^Sexual Preference:\s*/i, "")
          .trim()
      : item;

  const intentionTags = rawItems
    .filter((item) => typeof item === "string" && item.startsWith("Quick Tag: "))
    .map((item) =>
      item
        .replace("Quick Tag: ", "")
        .replace("Learn New Skills", "Learning")
    );

  const orientationText = rawItems
    .find((item) => typeof item === "string" && item.startsWith("Orientation: "))
    ?.replace("Orientation: ", "");

  const groupedDisplayPrefixes = [
    "Top likes to use:",
    "Top likes to give:",
    "Bottom likes to receive:",
    "Limits:",
    "Experience:",
  ];

  const getPrefixedDisplayItems = (prefixes) => {
    const values = rawItems
      .filter((item) => typeof item === "string")
      .flatMap((item) => {
        const match = prefixes.find((prefix) =>
          item.toLowerCase().startsWith(prefix.toLowerCase())
        );

        if (!match) return [];

        const value = item.slice(match.length).trim();
        return value ? [value] : [];
      });

    return Array.from(new Set(values));
  };

  const displayItems = rawItems
    .filter(
      (item) =>
        !(
          typeof item === "string" &&
          (
            item.startsWith("Quick Tag: ") ||
            item.startsWith("Orientation: ") ||
            groupedDisplayPrefixes.some((prefix) =>
              item.toLowerCase().startsWith(prefix.toLowerCase())
            )
          )
        )
    )
    .map(cleanDisplayItem)
    .filter(Boolean);

  const orderByList = (list, configuredOrder) =>
    [...list].sort((a, b) => {
      const aIndex = configuredOrder.indexOf(a);
      const bIndex = configuredOrder.indexOf(b);

      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;

      return 0;
    });

  const taggedSexualPreferenceItems = getPrefixedDisplayItems([
    "Sexual:",
    "Sexual Preference:",
    "Sexual Preferences:",
  ]);

  const taggedInterestItems = getPrefixedDisplayItems([
    "Interests:",
    "Interest:",
  ]);

  const sexualPreferenceItems = orderByList(
    preserveTaggedCategories
      ? taggedSexualPreferenceItems
      : displayItems.filter((item) => defaultSexualPreferenceOptions.includes(item)),
    defaultSexualPreferenceOptions
  );

  const interestItems = orderByList(
    preserveTaggedCategories
      ? taggedInterestItems
      : displayItems.filter((item) => !defaultSexualPreferenceOptions.includes(item)),
    defaultInterestOptions
  );

  const topLikesToGiveItems = orderByList(
    getPrefixedDisplayItems(["Top likes to use:", "Top likes to give:"]),
    spankingImplementOptions
  );

  const bottomLikesToReceiveItems = orderByList(
    getPrefixedDisplayItems(["Bottom likes to receive:"]),
    spankingImplementOptions
  );

  const limitItems = orderByList(
    getPrefixedDisplayItems(["Limits:"]),
    spankingLimitOptions
  );

  const experienceItems = orderByList(
    getPrefixedDisplayItems(["Experience:"]),
    spankingExperienceOptions
  );

  const intentionText = intentionTags.join(", ");
  const detailItemLimit = compact ? Math.min(itemLimit, 4) : Math.min(itemLimit, 5);
  const sexualPreferenceText = joinItems(sexualPreferenceItems, Math.min(detailItemLimit, 4));
  const topLikesToGiveText = joinItems(topLikesToGiveItems, detailItemLimit);
  const bottomLikesToReceiveText = joinItems(bottomLikesToReceiveItems, detailItemLimit);
  const limitsText = joinItems(limitItems, Math.min(detailItemLimit, 4));
  const experienceText = joinItems(experienceItems, Math.min(detailItemLimit, 3));
  const interestText = joinItems(interestItems, Math.min(detailItemLimit, 4));

  const detailTextClass = compact ? "text-[0.72rem] md:text-xs" : "text-xs md:text-sm";

  const renderDisplayDetailLine = (label, value, labelClass, marginClass = "mt-0.5") =>
    value ? (
      <div className={`${detailTextClass} ${marginClass} text-slate-300 break-words leading-tight`}>
        <span className={`mr-1.5 inline-block font-black ${labelClass}`}>{label}</span>
        <span>{value}</span>
      </div>
    ) : null;

  return (
    <div className="flow-root py-2">
      {participantPhoto ? (
        <img
          src={participantPhoto.url}
          alt={`${name || "Participant"}'s profile`}
          className="float-left mb-2 mr-3 h-24 w-24 rounded-2xl border border-white/20 object-cover shadow-lg"
        />
      ) : null}

      <div className="text-3xl md:text-4xl font-bold text-slate-100 break-words">
        {name}
      </div>

      {!isDM && !isHost && (whoAmI || seeking || orientationText) ? (
        <div className="mt-0.5 text-base md:text-xl text-white break-words leading-5">
          {whoAmI || "—"}{seeking ? ` → ${seeking}` : ""}{orientationText ? ` | ${orientationText}` : ""}
        </div>
      ) : null}

      {intentionText ? (
        <div className="mt-1 text-sm md:text-base font-semibold text-[#fff4c2] break-words leading-5">
          {intentionText}
        </div>
      ) : null}

      {(isDM || isHost) && category ? (
        <div className={`${compact ? "text-sm md:text-lg" : "text-base md:text-xl"} mt-1 text-slate-100 break-words leading-5`}>
          {category}
        </div>
      ) : null}

      <div className={participantPhoto ? "clear-left" : ""}>
      {renderDisplayDetailLine("🔵", topLikesToGiveText, "text-blue-500", "mt-0.5")}

      {renderDisplayDetailLine("🟢", bottomLikesToReceiveText, "text-green-500", "mt-0.5")}

      {renderDisplayDetailLine("⛔", limitsText, "text-yellow-600", "mt-0.5")}

      {renderDisplayDetailLine("🟠", experienceText, "text-orange-500", "mt-0.5")}

      {renderDisplayDetailLine("👀", interestText, "text-yellow-500", "mt-0.5")}

      {renderDisplayDetailLine("🍑🍆", sexualPreferenceText, "text-blue-500", "mt-0.5")}
      </div>

      {!isDM && socialHandle ? (
        <div className={`${participantPhoto ? "clear-left " : ""}mt-1 text-sm font-semibold tracking-[0.08em] text-slate-400 break-words md:text-base`}>
          <SocialHandleDisplay platform={socialPlatform} handle={socialHandle} />
        </div>
      ) : null}
    </div>
  );
}

function DisplayCrownIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="displaySectionIconSvg">
      <path d="M10 48h44l4-30-15 12-11-18-11 18L6 18l4 30Z" />
      <path d="M14 54h36" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="32" cy="12" r="3" />
      <circle cx="58" cy="18" r="3" />
    </svg>
  );
}

function DisplayShieldIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="displaySectionIconSvg">
      <path d="M32 6 52 14v17c0 14-8.5 24-20 29C20.5 55 12 45 12 31V14L32 6Z" />
      <path d="M32 14v38" />
    </svg>
  );
}

function DisplayUpArrowIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="displaySectionIconSvg">
      <path d="M32 52V12" />
      <path d="M16 28 32 12l16 16" />
    </svg>
  );
}

function DisplayDownArrowIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="displaySectionIconSvg">
      <path d="M32 12v40" />
      <path d="M16 36l16 16 16-16" />
    </svg>
  );
}

function DisplayRotateIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="displaySectionIconSvg">
      <path d="M48 20a20 20 0 0 0-33 7" />
      <path d="M14 14v13h13" />
      <path d="M16 44a20 20 0 0 0 33-7" />
      <path d="M50 50V37H37" />
    </svg>
  );
}

function getDisplaySectionMeta(title) {
  if (title === "Hosts") {
    return { icon: <DisplayCrownIcon />, subtitle: "Room leaders, offerings, tastings, and guidance" };
  }

  if (title === "Dungeon Monitors") {
    return { icon: <DisplayShieldIcon />, subtitle: "Safety, support, and room care" };
  }

  if (title === "Top") {
    return { icon: <DisplayUpArrowIcon />, subtitle: "Give" };
  }

  if (title === "Bottom") {
    return { icon: <DisplayDownArrowIcon />, subtitle: "Receive" };
  }

  if (title === "Switch") {
    return { icon: <DisplayRotateIcon />, subtitle: "Both Give & Receive" };
  }

  return { icon: null, subtitle: "" };
}

function ParticipantListDisplay({ entries = [], columns = 4 }) {
  const maxLineLength = 40;

  const getPositionRank = (entry) => {
    if (entry.position === "Top") return 0;
    if (entry.position === "Bottom") return 1;
    if (entry.position === "Switch") return 2;
    return 99;
  };

  const getPositionMeta = (position) => {
    if (position === "Top") {
      return {
        accentClass: "bg-red-500",
        icon: <DisplayUpArrowIcon />,
        iconClass: "text-red-400",
      };
    }

    if (position === "Bottom") {
      return {
        accentClass: "bg-emerald-500",
        icon: <DisplayDownArrowIcon />,
        iconClass: "text-emerald-400",
      };
    }

    return {
      accentClass: "bg-sky-500",
      icon: <DisplayRotateIcon />,
      iconClass: "text-sky-400",
    };
  };

  const stripPrefix = (value, prefixes) => {
    const textValue = String(value || "").trim();
    const prefix = prefixes.find((item) =>
      textValue.toLowerCase().startsWith(item.toLowerCase())
    );

    return prefix ? textValue.slice(prefix.length).trim() : "";
  };

  const getPrefixedValues = (items, prefixes) =>
    items
      .map((item) => stripPrefix(item, prefixes))
      .filter(Boolean);

  const getSimpleValues = (items, prefix) =>
    items
      .filter((item) => String(item || "").toLowerCase().startsWith(prefix.toLowerCase()))
      .map((item) => String(item).slice(prefix.length).trim())
      .filter(Boolean);

  const splitLongWord = (word, maxLength) => {
    const pieces = [];
    let current = String(word || "");

    while (current.length > maxLength) {
      pieces.push(current.slice(0, maxLength));
      current = current.slice(maxLength);
    }

    if (current) pieces.push(current);

    return pieces;
  };

  const wrapText = (value, maxLength = maxLineLength) => {
    const words = String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);

    if (words.length === 0) return [];

    const lines = [];
    let current = "";

    words.forEach((word) => {
      if (word.length > maxLength) {
        if (current) {
          lines.push(current);
          current = "";
        }

        splitLongWord(word, maxLength).forEach((piece) => lines.push(piece));
        return;
      }

      const next = current ? current + " " + word : word;

      if (next.length > maxLength && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    });

    if (current) lines.push(current);

    return lines;
  };

  const joinAndWrap = (values, maxLength = maxLineLength) =>
    wrapText(values.join(", "), maxLength);

  const renderDetail = (icon, values) => {
    const lines = joinAndWrap(values);

    if (lines.length === 0) return null;

    return (
      <div className="participantListDetail flex min-w-0 gap-2 text-[0.9rem] font-semibold leading-tight text-slate-100 md:text-[1rem]">
        <div className="w-10 shrink-0 whitespace-nowrap text-center leading-tight">{icon}</div>
        <div className="min-w-0">
          {lines.map((line, index) => (
            <div key={icon + "-" + index} className="break-words">
              {line}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const sortedEntries = [...entries].sort((a, b) => {
    const rankDiff = getPositionRank(a) - getPositionRank(b);
    if (rankDiff !== 0) return rankDiff;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });

  if (sortedEntries.length === 0) {
    return (
      <section className="w-full">
        <div className="rounded-3xl border border-white/15 bg-black/25 px-6 py-8 text-center text-2xl font-semibold text-slate-300 backdrop-blur-md">
          No participant entries yet.
        </div>
      </section>
    );
  }

  return (
    <section className="w-full overflow-hidden">
      <div
        className="w-full"
        style={{
          height: "calc(100vh - 15.5rem)",
          display: "flex",
          flexFlow: "column wrap",
          alignContent: "flex-start",
          alignItems: "flex-start",
          rowGap: "0.625rem",
          columnGap: "0.625rem",
        }}
      >
        {sortedEntries.map((entry) => {
          const meta = getPositionMeta(entry.position);
          const mergedItems = sortDisplayItemsByConfiguredOrder(getVisibleEntryItems([
            ...(entry.items || []),
            ...(entry.custom_items || []),
          ]));
          const participantPhoto = getParticipantPhoto(entry.custom_items || []);
          const participantName = entry.name || "Unnamed";
          const availableNameWidth = participantPhoto ? 240 : 300;
          const participantNameFontSize = Math.max(
            14,
            Math.min(31, availableNameWidth / Math.max(1, participantName.length * 0.58))
          );

          const quickTags = getSimpleValues(mergedItems, "Quick Tag:");
          const topGive = getPrefixedValues(mergedItems, [
            "Top likes to give:",
            "Top likes to use:",
            "Top:",
            "As a top I like to use:",
          ]);
          const bottomReceive = getPrefixedValues(mergedItems, [
            "Bottom likes to receive:",
            "Bottom:",
            "As a bottom I like to receive:",
          ]);
          const limits = getPrefixedValues(mergedItems, ["Limits:", "Limit:"]);
          const experience = getPrefixedValues(mergedItems, ["Experience:", "Experience Level:"]);
          const interests = getPrefixedValues(mergedItems, ["Interests:", "Looking For:", "Looking for:"]);
          const orientation = getPrefixedValues(mergedItems, ["Orientation:"]);
          const sexual = getPrefixedValues(mergedItems, [
            "Sexual:",
            "Sex:",
            "Sexual Preference:",
            "Sexual Preferences:",
          ]);
          const plainItems = mergedItems
            .filter((item) => {
              const lower = String(item || "").toLowerCase();

              return ![
                "quick tag:",
                "top likes to give:",
                "top likes to use:",
                "top:",
                "as a top i like to use:",
                "bottom likes to receive:",
                "bottom:",
                "as a bottom i like to receive:",
                "limits:",
                "limit:",
                "experience:",
                "experience level:",
                "interests:",
                "looking for:",
                "sexual:",
                "sex:",
                "sexual preference:",
                "sexual preferences:",
                "orientation:",
              ].some((prefix) => lower.startsWith(prefix));
            })
            .map((item) => String(item).trim())
            .filter(Boolean);

          return (
            <div
              key={entry.id}
              className="relative overflow-hidden rounded-2xl border border-white/15 bg-black/25 px-4 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-md"
              style={{
                fontSize: "var(--participant-list-detail-size, 1rem)",
                width: `calc((100vw - ${(clampParticipantColumns(columns) - 1) * 0.625}rem - 3rem) / ${clampParticipantColumns(columns)})`,
                flex: "0 0 auto",
                breakInside: "avoid",
                WebkitColumnBreakInside: "avoid",
                pageBreakInside: "avoid",
              }}
            >
              <div className={"absolute left-0 top-0 h-full w-1.5 " + meta.accentClass} />

              <div className="flow-root min-w-0 pl-2">
                {participantPhoto ? (
                  <img
                    src={participantPhoto.url}
                    alt={`${entry.name || "Participant"}'s profile`}
                    className="float-left mb-2 mr-3 h-24 w-24 rounded-2xl border border-white/20 object-cover shadow-lg"
                  />
                ) : null}
                <div className="min-w-0">
                <div className="participantListTitle flex min-w-0 items-center gap-2 text-[1.65rem] font-black leading-none tracking-tight text-white md:text-[1.95rem]">
                  <span
                    className="min-w-0 whitespace-nowrap"
                    style={{ fontSize: `${participantNameFontSize}px` }}
                  >
                    {participantName}
                  </span>
                  <span className="shrink-0 text-slate-400">|</span>
                  <span
                    className={"flex h-9 w-9 shrink-0 items-center justify-center " + meta.iconClass}
                    role="img"
                    aria-label={entry.position || "Entry"}
                  >
                    {meta.icon}
                  </span>
                </div>

                {(entry.who_am_i_text || entry.seeking_text || orientation.length) ? (
                  <div className="participantListDetail mt-1 break-words text-[0.9rem] font-semibold leading-tight text-white md:text-[1rem]">
                    {entry.who_am_i_text || "—"}
                    {entry.seeking_text ? ` → ${entry.seeking_text}` : ""}
                    {orientation.length ? ` | ${orientation.join(", ")}` : ""}
                  </div>
                ) : null}

                {quickTags.length ? (
                  <div className="participantListDetail mt-1 break-words text-[0.9rem] font-black leading-tight text-amber-100 md:text-[1rem]">
                    {joinAndWrap(quickTags, maxLineLength).map((line, index) => (
                      <div key={"quick-" + index}>{line}</div>
                    ))}
                  </div>
                ) : null}

                <div className={`${participantPhoto ? "clear-left" : ""} mt-2 min-w-0 space-y-1`}>
                  {renderDetail("🔵", topGive)}
                  {renderDetail("🟢", bottomReceive)}
                  {renderDetail("⛔", limits)}
                  {renderDetail("🟠", experience)}
                  {renderDetail("👀", interests.length ? interests : plainItems)}
                  {renderDetail("🍑🍆", sexual)}
                </div>

                {entry.social_handle ? (
                  <div className="participantListDetail mt-2 break-words text-[0.85rem] font-black leading-tight tracking-[0.08em] text-slate-400 md:text-[0.95rem]">
                    <SocialHandleDisplay platform={entry.social_platform || ""} handle={entry.social_handle} />
                  </div>
                ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function normalizeEventDisplayPreset(preset) {
  if (!preset) return null;

  const rawImages =
    preset.images ||
    preset.display_images ||
    preset.displayImages ||
    preset.slides ||
    [];

  const imageDurationSeconds =
    Number(preset.imageDurationSeconds) ||
    Number(preset.image_duration_seconds) ||
    Number(preset.displayImageDurationSeconds) ||
    Number(preset.display_image_duration_seconds) ||
    Number(rawImages?.[0]?.durationSeconds) ||
    Number(rawImages?.[0]?.duration_seconds) ||
    60;

  const liveboardDurationSeconds =
    Number(preset.liveboardDurationSeconds) ||
    Number(preset.liveboard_duration_seconds) ||
    Number(preset.displayLiveboardDurationSeconds) ||
    Number(preset.display_liveboard_duration_seconds) ||
    300;

  const images = Array.isArray(rawImages)
    ? rawImages
        .map((image, index) => {
          if (!image) return null;

          if (typeof image === "string") {
            return {
              id: `image-${index}`,
              src: image,
              url: image,
              imageUrl: image,
              durationSeconds: imageDurationSeconds,
            };
          }

          const src =
            image.src ||
            image.url ||
            image.imageUrl ||
            image.image_url ||
            image.publicUrl ||
            image.public_url ||
            image.dataUrl ||
            image.data_url ||
            "";

          if (!src) return null;

          return {
            ...image,
            id: image.id || `image-${index}`,
            src,
            url: src,
            imageUrl: src,
            image_url: src,
            durationSeconds:
              Number(image.durationSeconds) ||
              Number(image.duration_seconds) ||
              imageDurationSeconds,
            duration_seconds:
              Number(image.duration_seconds) ||
              Number(image.durationSeconds) ||
              imageDurationSeconds,
          };
        })
        .filter(Boolean)
    : [];

  return {
    ...preset,
    id: preset.id,
    name: preset.name || preset.event_name || preset.eventName || preset.title || "",
    title: preset.title || preset.event_name || preset.eventName || preset.name || "",
    eventName: preset.eventName || preset.event_name || preset.name || preset.title || "",
    event_name: preset.event_name || preset.eventName || preset.name || preset.title || "",
    eventDescription:
      preset.eventDescription ||
      preset.event_description ||
      preset.description ||
      "",
    event_description:
      preset.event_description ||
      preset.eventDescription ||
      preset.description ||
      "",
    images,
    displayImages: images,
    display_images: images,
    imageDurationSeconds,
    image_duration_seconds: imageDurationSeconds,
    displayImageDurationSeconds: imageDurationSeconds,
    display_image_duration_seconds: imageDurationSeconds,
    liveboardDurationSeconds,
    liveboard_duration_seconds: liveboardDurationSeconds,
    displayLiveboardDurationSeconds: liveboardDurationSeconds,
    display_liveboard_duration_seconds: liveboardDurationSeconds,
  };
}

function DisplayRotationOverlay({ eventDisplay }) {
  const normalizedEventDisplay = useMemo(
    () => normalizeEventDisplayPreset(eventDisplay),
    [eventDisplay]
  );

  const images = normalizedEventDisplay?.slidesEnabled === false
    ? []
    : normalizedEventDisplay?.images || [];
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showImage, setShowImage] = useState(false);
  const [loadedImages, setLoadedImages] = useState({});

  const activeImage = images[currentImageIndex % Math.max(images.length, 1)];

  const imageSignature = images
    .map((image) => `${image.id || ""}:${image.src || ""}:${image.durationSeconds || ""}`)
    .join("|");

  const liveboardDurationSeconds =
    Number(normalizedEventDisplay?.liveboardDurationSeconds) || 300;

  const imageDurationSeconds =
    Number(activeImage?.durationSeconds) ||
    Number(normalizedEventDisplay?.imageDurationSeconds) ||
    60;

  useEffect(() => {
    setCurrentImageIndex(0);
    setShowImage(false);
    setLoadedImages({});
  }, [normalizedEventDisplay?.id, imageSignature]);

  useEffect(() => {
    if (!images.length) return;

    let cancelled = false;

    images.forEach((image) => {
      if (!image?.src) return;

      const loader = new Image();

      loader.onload = () => {
        if (cancelled) return;
        setLoadedImages((current) => ({
          ...current,
          [image.src]: true,
        }));
      };

      loader.onerror = () => {
        if (cancelled) return;
        setLoadedImages((current) => ({
          ...current,
          [image.src]: false,
        }));
      };

      loader.src = image.src;
    });

    return () => {
      cancelled = true;
    };
  }, [imageSignature]);

  const activeImageIsLoaded = activeImage?.src && loadedImages[activeImage.src] === true;

  useEffect(() => {
    if (!normalizedEventDisplay || images.length === 0) {
      setShowImage(false);
      return;
    }

    if (showImage && !activeImageIsLoaded) {
      return;
    }

    const durationMs = showImage
      ? Math.max(1000, imageDurationSeconds * 1000)
      : Math.max(1000, liveboardDurationSeconds * 1000);

    const timer = window.setTimeout(() => {
      if (showImage) {
        setShowImage(false);
        setCurrentImageIndex((current) => (current + 1) % images.length);
      } else {
        setShowImage(true);
      }
    }, durationMs);

    return () => window.clearTimeout(timer);
  }, [
    normalizedEventDisplay?.id,
    images.length,
    imageSignature,
    showImage,
    activeImageIsLoaded,
    imageDurationSeconds,
    liveboardDurationSeconds,
  ]);

  if (
    !normalizedEventDisplay ||
    images.length === 0 ||
    !showImage ||
    !activeImage?.src ||
    !activeImageIsLoaded
  ) {
    return null;
  }

  return (
    <div className="displayRotationOverlay">
      <img
        src={activeImage.src}
        alt={normalizedEventDisplay.eventName || normalizedEventDisplay.name || "Event display slide"}
        className="displayRotationOverlayImage"
        draggable="false"
      />
    </div>
  );
}

function DisplaySection({ title, entries, theme, maxRows, maxCols, isDM = false, connectionBoard = false }) {
  const { rows, cols } = getSectionGrid(entries.length, maxRows, maxCols);
  const gridCols = connectionBoard ? Math.max(1, Number(maxCols) || 4) : cols;
  const compact = rows >= 4 || gridCols >= 3 || entries.length > 8;
  const sectionMeta = getDisplaySectionMeta(title);
  const showInlineRoleSubtitle = ["Top", "Bottom", "Switch"].includes(title);

  return (
    <section className={`displaySectionCard self-start rounded-2xl border px-2.5 pt-2.5 pb-1 shadow-2xl min-h-[120px] ${theme.section}`}>
      <div className={title ? "displaySectionHeader mb-2" : "mb-0"}>
        {sectionMeta.icon ? (
          <div className={`displaySectionIcon ${theme.title}`}>
            {sectionMeta.icon}
          </div>
        ) : null}

        <div className="min-w-0">
          <h3 className={`displaySectionTitle text-4xl md:text-5xl font-semibold tracking-tight ${theme.title}`}>
            {title}

            {showInlineRoleSubtitle && sectionMeta.subtitle ? (
              <>
                <span className="displaySectionTitlePipe">|</span>
                <span className="displaySectionTitleMeta">{sectionMeta.subtitle}</span>
              </>
            ) : null}
          </h3>

          {!showInlineRoleSubtitle && sectionMeta.subtitle ? (
            <div className="displaySectionSubtitle">
              {sectionMeta.subtitle}
            </div>
          ) : null}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-slate-400">
          Nothing posted yet.
        </div>
      ) : isDM ? (
        <div
          className="grid gap-x-4 gap-y-1 items-start content-start"
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${Math.max(1, rows)}, minmax(0, auto))`,
            gridAutoFlow: "row",
            width: "100%",
          }}
        >
          {entries.map((entry, index) => {
            const mergedItems = sortDisplayItemsByConfiguredOrder([
              ...(entry.items || []),
              ...(entry.custom_items || []),
            ]);
            const placement = gridPlacement(index, cols);

            return (
              <div
                key={entry.id}
                style={placement}
                className="min-h-0 self-start border-b border-slate-700/40 last:border-b-0"
              >
                <EntryLine
                  name={entry.entry_kind === "host"
                    ? entry.position ? `${entry.name} | ${entry.position}` : entry.name
                    : entry.entry_kind === "dm"
                      ? `${entry.name} | DM`
                      : entry.name}
                  socialHandle={entry.social_handle || ""}
                  socialPlatform={entry.social_platform || ""}
                  whoAmI={entry.who_am_i_text || ""}
                  seeking={entry.seeking_text || ""}
                  items={mergedItems}
                  category={
                    entry.entry_kind === "host"
                      ? (
                          entry.host_function ||
                          (
                            entry.dm_category !== "Host" && entry.dm_category !== "Co-Host"
                              ? entry.dm_category
                              : ""
                          )
                        )
                      : entry.dm_category || ""
                  }
                  compact={compact}
                  itemLimit={compact ? 8 : 10}
                  isDM
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`displaySectionEntries rounded-2xl border p-5 md:p-6 h-full ${connectionBoard ? "displayConnectionEntries" : ""} ${theme.inner}`}>
          <div
            className={`grid items-start content-start ${connectionBoard ? "displayConnectionEntriesGrid" : "gap-x-4 gap-y-1"}`}
            style={{
              gridTemplateColumns: `repeat(${Math.max(1, gridCols)}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${Math.max(1, rows)}, minmax(0, auto))`,
              gridAutoFlow: "row",
              width: "100%",
            }}
          >
            {entries.map((entry, index) => {
              const mergedItems = sortDisplayItemsByConfiguredOrder([
                ...(entry.items || []),
                ...(entry.custom_items || []),
              ]);
              const placement = gridPlacement(index, gridCols);

              return (
                <div
                  key={entry.id}
                  style={placement}
                  className={connectionBoard
                    ? "displayConnectionEntry min-h-0 self-start"
                    : "min-h-0 self-start border-b border-slate-700/40 last:border-b-0"}
                >
                  <EntryLine
                    name={entry.name}
                    participantPhoto={getParticipantPhoto(entry.custom_items || [])}
                    socialHandle={entry.social_handle || ""}
                    socialPlatform={entry.social_platform || ""}
                    whoAmI={entry.who_am_i_text || ""}
                    seeking={entry.seeking_text || ""}
                    items={mergedItems}
                    category={entry.dm_category || entry.position || ""}
                    compact={compact}
                    itemLimit={compact ? 8 : 10}
                    isDM={false}
                    isHost={false}
                    preserveTaggedCategories={connectionBoard}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}


function StaffNameCrownIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10 48h44l4-30-15 12-11-18-11 18L6 18l4 30Z"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 54h36"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle cx="6" cy="18" r="3" fill="currentColor" />
      <circle cx="32" cy="12" r="3" fill="currentColor" />
      <circle cx="58" cy="18" r="3" fill="currentColor" />
    </svg>
  );
}

function StaffNameShieldIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M32 6 52 14v17c0 14-8.5 24-20 29C20.5 55 12 45 12 31V14L32 6Z"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M32 14v38"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function VerticalStaffSection({
  title,
  entries,
  maxRows,
  maxCols,
  theme,
  isDM = false,
}) {
  const { rows, cols } = getSectionGrid(entries.length, maxRows, maxCols);
  const compact = rows >= 2 || cols >= 2 || entries.length > 2;

  return (
    <section className={`displaySectionCard self-start rounded-2xl border px-2.5 pt-2.5 pb-1 shadow-2xl min-h-[120px] ${theme.outer}`}>
      {title ? (
        <div className="mb-2">
          <h3 className="text-4xl md:text-5xl font-semibold tracking-tight text-white">
            {title}
          </h3>
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-slate-400">
          Nothing posted yet.
        </div>
      ) : (
        <div
          className="grid gap-x-4 gap-y-1 items-start content-start"
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${Math.max(1, rows)}, minmax(0, auto))`,
            gridAutoFlow: "row",
            width: "100%",
          }}
        >
          {entries.map((entry, index) => {
            const mergedItems = [...(entry.items || []), ...(entry.custom_items || [])]
              .filter(Boolean)
              .sort((a, b) => a.localeCompare(b));

            const itemText = mergedItems.join(", ");
            const placement = gridPlacement(index, cols);
            const isHostEntry = (entry.entry_kind || "") === "host";
            const isDmEntry = (entry.entry_kind || "") === "dm";

            const hostRole =
              entry.position === "Host" || entry.position === "Co-Host"
                ? entry.position
                : entry.dm_category === "Host" || entry.dm_category === "Co-Host"
                  ? entry.dm_category
                  : "Host";

            const displayName = isHostEntry
              ? `${entry.name} | ${hostRole}`
              : entry.name;

            const functionText =
              entry.host_function ||
              (
                isHostEntry && entry.dm_category !== "Host" && entry.dm_category !== "Co-Host"
                  ? entry.dm_category
                  : ""
              ) ||
              (
                isDmEntry
                  ? entry.dm_category
                  : ""
              );

            return (
              <div
                key={entry.id}
                style={placement}
                className={`min-h-0 self-start ${theme.inner} rounded-2xl border p-3`}
              >
                <div className={`${compact ? "text-xl md:text-2xl" : "text-2xl md:text-4xl"} font-bold text-white break-words leading-none`}>
                  {displayName}
                </div>

                {functionText ? (
                  <div className={`${compact ? "text-sm md:text-lg" : "text-base md:text-xl"} mt-1 text-slate-100 break-words leading-5`}>
                    <span className="font-bold text-slate-300">Function:</span> {functionText}
                  </div>
                ) : null}

                {itemText ? (
                  <div className={`${compact ? "text-sm md:text-lg" : "text-base md:text-xl"} mt-0.5 text-slate-300 break-words leading-5`}>
                    {itemText}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}


export default function App() {

  const { mode, updateMode } = useMode();
  const isDisplayMode = mode === "display";
  const isEntryMode = mode === "entry";
  const isSetupMode = mode === "setup";
  const isSetupTabsMode = isSetupMode;

  const setupTabOptions = ["Events", "Hosts & DMs", "Entry Form", "Display Sizing", "Entries", "Raffle"];
  const [activeSetupTab, setActiveSetupTab] = useState("Events");
  const isKioskEntryMode =
    isEntryMode && new URLSearchParams(window.location.search).get("kiosk") === "1";

  const [entries, setEntries] = useState([]);
  const [raffleDraws, setRaffleDraws] = useState([]);
  const formatEasternDisplayTime = (date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .format(date)
      .replace(/\s?[AP]M$/i, "");

  const [raffleTicketInput, setRaffleTicketInput] = useState("");
  const [displayNow, setDisplayNow] = useState(() => new Date());
  const [raffleSaving, setRaffleSaving] = useState(false);
  const [lastRemovedEntry, setLastRemovedEntry] = useState(null);
  const [settings, setSettings] = useState(null);

  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dmSaving, setDmSaving] = useState(false);
  const [hostSaving, setHostSaving] = useState(false);

  const [name, setName] = useState("");
  const [socialHandle, setSocialHandle] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("FetLife");
  const [socialHandleDraftPlatform, setSocialHandleDraftPlatform] = useState("FetLife");
  const [socialHandleDraftValue, setSocialHandleDraftValue] = useState("");
  const [socialHandleItems, setSocialHandleItems] = useState([]);
  const [position, setPosition] = useState("");
  const [whoAmIInput, setWhoAmIInput] = useState("");
  const [seekingInput, setSeekingInput] = useState("");
  const [identityChoice, setIdentityChoice] = useState("");
  const [identityOther, setIdentityOther] = useState("");
  const [seekingChoice, setSeekingChoice] = useState("");
  const [seekingOther, setSeekingOther] = useState("");
  const [orientationChoice, setOrientationChoice] = useState("");
  const [orientationOther, setOrientationOther] = useState("");
  const [itemInput, setItemInput] = useState("");
  const [selectedItems, setSelectedItems] = useState([]);
  const [sexualPreferenceInput, setSexualPreferenceInput] = useState("");
  const [sexualPreferenceItems, setSexualPreferenceItems] = useState([]);
  const [interestInput, setInterestInput] = useState("");
  const [interestItems, setInterestItems] = useState([]);
  const [lookingForItems, setLookingForItems] = useState([]);
  const [spankingTopImplements, setSpankingTopImplements] = useState([]);
  const [spankingTopOther, setSpankingTopOther] = useState("");
  const [spankingBottomImplements, setSpankingBottomImplements] = useState([]);
  const [spankingBottomOther, setSpankingBottomOther] = useState("");
  const [spankingLimitItems, setSpankingLimitItems] = useState([]);
  const [spankingLimitsOther, setSpankingLimitsOther] = useState("");
  const [spankingExperienceLevel, setSpankingExperienceLevel] = useState("");
  const [quickTags, setQuickTags] = useState([]);
  const [message, setMessage] = useState("");
  const [entrySuccess, setEntrySuccess] = useState(false);
  const [participantPhotoFile, setParticipantPhotoFile] = useState(null);
  const [participantPhotoPreview, setParticipantPhotoPreview] = useState("");
  const [participantCropSource, setParticipantCropSource] = useState(null);
  const [participantCropZoom, setParticipantCropZoom] = useState(1);
  const [participantCropX, setParticipantCropX] = useState(50);
  const [participantCropY, setParticipantCropY] = useState(50);
  const [participantCropDimensions, setParticipantCropDimensions] = useState(null);
  const [participantCameraOpen, setParticipantCameraOpen] = useState(false);
  const participantCameraVideoRef = useRef(null);
  const participantCameraStreamRef = useRef(null);
  const participantCropDragRef = useRef(null);
  const participantCropPreviewStyle = useMemo(() => {
    if (!participantCropDimensions) return { visibility: "hidden" };

    const { width, height } = participantCropDimensions;
    const side = Math.min(width, height) / participantCropZoom;
    const sourceX = (width - side) * (participantCropX / 100);
    const sourceY = (height - side) * (participantCropY / 100);

    return {
      width: `${(width / side) * 100}%`,
      height: `${(height / side) * 100}%`,
      left: `${-(sourceX / side) * 100}%`,
      top: `${-(sourceY / side) * 100}%`,
    };
  }, [participantCropDimensions, participantCropZoom, participantCropX, participantCropY]);

  const [hostName, setHostName] = useState("");
  const [hostCategory, setHostCategory] = useState("");
  const [hostRole, setHostRole] = useState("");
  const [hostCustomRole, setHostCustomRole] = useState("");
  const [hostFunctions, setHostFunctions] = useState([]);
  const [hostCustomFunction, setHostCustomFunction] = useState("");
  const [hostItemInput, setHostItemInput] = useState("");
  const [hostSelectedItems, setHostSelectedItems] = useState([]);

  const [dmName, setDmName] = useState("");
  const [dmCategory, setDmCategory] = useState("");
  const [dmRoles, setDmRoles] = useState([]);
  const [dmItemInput, setDmItemInput] = useState("");
  const [dmSelectedItems, setDmSelectedItems] = useState([]);

  const [setupSearch, setSetupSearch] = useState("");
  const [setupEventName, setSetupEventName] = useState("");
  const [setupVenueName, setSetupVenueName] = useState("");
  const [layoutSettings, setLayoutSettings] = useState(defaultDisplayLayout);
  const [participantDisplayColumns, setParticipantDisplayColumns] = useState(4);
  const [activeEventDisplayId, setActiveEventDisplayId] = useState(() => {
    return window.localStorage.getItem("activeEventDisplayId") || eventDisplayPresets[0]?.id || "";
  });

  const [savedEventDisplays, setSavedEventDisplays] = useState([]);

  const [hiddenBuiltinEventDisplayIds, setHiddenBuiltinEventDisplayIds] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem("hiddenBuiltinEventDisplayIds") || "[]");
    } catch {
      return [];
    }
  });

  const [displayEventName, setDisplayEventName] = useState("");
  const [displayEventDescription, setDisplayEventDescription] = useState("");
  const [displayEventStartTime, setDisplayEventStartTime] = useState("");
  const [displayEventEndTime, setDisplayEventEndTime] = useState("");
  const [displayImageDurationSeconds, setDisplayImageDurationSeconds] = useState("60");
  const [displayLiveboardDurationSeconds, setDisplayLiveboardDurationSeconds] = useState("300");
  const [displayImages, setDisplayImages] = useState([]);
  const [displaySlidesEnabled, setDisplaySlidesEnabled] = useState(true);
  const [editingEventDisplayId, setEditingEventDisplayId] = useState("");
  const [draggedDisplayImageId, setDraggedDisplayImageId] = useState("");

  const [showSocialHandleField, setShowSocialHandleField] = useState(true);
  const [showSexualPreferenceSection, setShowSexualPreferenceSection] = useState(true);
  const [showInterestSection, setShowInterestSection] = useState(true);
  const [allowParticipantPhotos, setAllowParticipantPhotos] = useState(() => {
    try {
      return window.localStorage.getItem("allowParticipantPhotos") !== "false";
    } catch {
      return true;
    }
  });
  const [allowFetLife, setAllowFetLife] = useState(true);
  const [allowWhappz, setAllowWhappz] = useState(true);
  const [allowTwitter, setAllowTwitter] = useState(true);
  const [allowBluesky, setAllowBluesky] = useState(true);
  const [allowTelegram, setAllowTelegram] = useState(() => {
    try {
      return window.localStorage.getItem("allowTelegram") !== "false";
    } catch {
      return true;
    }
  });
  const [allowOtherPlatform, setAllowOtherPlatform] = useState(true);
  const [entryFormPreset, setEntryFormPreset] = useState(() => {
    try {
      return window.localStorage.getItem("entryFormPreset") || "standard";
    } catch {
      return "standard";
    }
  });

  const [visibleSexualPreferenceOptions, setVisibleSexualPreferenceOptions] = useState(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem("visibleSexualPreferenceOptions") || "null");
      return Array.isArray(stored) && stored.length ? stored : defaultSexualPreferenceOptions;
    } catch {
      return defaultSexualPreferenceOptions;
    }
  });

  const [visibleInterestOptions, setVisibleInterestOptions] = useState(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem("visibleInterestOptions") || "null");
      return Array.isArray(stored) && stored.length ? stored : defaultInterestOptions;
    } catch {
      return defaultInterestOptions;
    }
  });

  const [customSexualPreferenceOptions, setCustomSexualPreferenceOptions] = useState(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem("customSexualPreferenceOptions") || "[]");
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  });
  const [customSexualPreferenceOptionInput, setCustomSexualPreferenceOptionInput] = useState("");

  const [customInterestOptions, setCustomInterestOptions] = useState(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem("customInterestOptions") || "[]");
      return Array.isArray(stored) ? stored.filter(Boolean) : [];
    } catch {
      return [];
    }
  });

  const [customInterestOptionInput, setCustomInterestOptionInput] = useState("");

  const [boardEntryTextSize, setBoardEntryTextSize] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem("boardEntryTextSize") || 0);
      return stored > 10 ? 0 : stored;
    } catch {
      return 0;
    }
  });

  const [staffTextSize, setStaffTextSize] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem("staffTextSize") || 0);
      return stored > 10 ? 0 : stored;
    } catch {
      return 0;
    }
  });

  const displayLayout = {
    host_max_rows: clampLayoutValue(layoutSettings.host_max_rows ?? defaultDisplayLayout.host_max_rows),
    host_max_cols: clampLayoutValue(layoutSettings.host_max_cols ?? defaultDisplayLayout.host_max_cols),
    dm_max_rows: clampLayoutValue(layoutSettings.dm_max_rows ?? defaultDisplayLayout.dm_max_rows),
    dm_max_cols: clampLayoutValue(layoutSettings.dm_max_cols ?? defaultDisplayLayout.dm_max_cols),
    top_max_rows: clampLayoutValue(layoutSettings.top_max_rows ?? defaultDisplayLayout.top_max_rows),
    top_max_cols: clampLayoutValue(layoutSettings.top_max_cols ?? defaultDisplayLayout.top_max_cols),
    bottom_max_rows: clampLayoutValue(layoutSettings.bottom_max_rows ?? defaultDisplayLayout.bottom_max_rows),
    bottom_max_cols: clampLayoutValue(layoutSettings.bottom_max_cols ?? defaultDisplayLayout.bottom_max_cols),
    switch_max_rows: clampLayoutValue(layoutSettings.switch_max_rows ?? defaultDisplayLayout.switch_max_rows),
    switch_max_cols: clampLayoutValue(layoutSettings.switch_max_cols ?? defaultDisplayLayout.switch_max_cols),
  };

  const isMensSpankingEntryForm = entryFormPreset === "mens_spanking";
  const isMenOnlyEntryForm = entryFormPreset === "men_only" || isMensSpankingEntryForm;
  const isDiaperDebaucheryEntryForm = entryFormPreset === "diaper_debauchery_glow";

  const entryMenuSettings = isDiaperDebaucheryEntryForm
    ? {
        type: "abdl",
        usesMultipleSocialHandles: true,
      }
    : isMenOnlyEntryForm
      ? {
          type: "menOnly",
          usesMultipleSocialHandles: true,
        }
      : {
          type: "default",
          usesMultipleSocialHandles: true,
        };

  const displayBoardSettings = isDiaperDebaucheryEntryForm
    ? {
        type: "abdl",
        layout: "singleConnectionBoard",
      }
    : isMenOnlyEntryForm
      ? {
          type: "menOnly",
          layout: "topBottomSwitch",
        }
      : {
          type: "default",
          layout: "topBottomSwitch",
        };

  const usesMultipleSocialHandles = true;
  const usesSingleConnectionBoard = displayBoardSettings.layout === "singleConnectionBoard";
  const isConnectionEntryForm = entryMenuSettings.type === "abdl";

  const allSexualPreferenceOptions = useMemo(() => {
    const removedOptions = new Set(
      customSexualPreferenceOptions
        .filter(isRemovedEntryOptionMarker)
        .map((option) => option.slice(REMOVED_ENTRY_OPTION_PREFIX.length))
    );
    const customOptions = customSexualPreferenceOptions.filter(
      (option) => !isRemovedEntryOptionMarker(option)
    );

    return Array.from(
      new Set([
        ...defaultSexualPreferenceOptions.filter((option) => !removedOptions.has(option)),
        ...customOptions,
      ])
    ).filter(Boolean);
  }, [customSexualPreferenceOptions]);

  const allInterestOptions = useMemo(() => {
    const removedOptions = new Set(
      customInterestOptions
        .filter(isRemovedEntryOptionMarker)
        .map((option) => option.slice(REMOVED_ENTRY_OPTION_PREFIX.length))
    );
    const customOptions = customInterestOptions.filter(
      (option) => !isRemovedEntryOptionMarker(option)
    );

    return Array.from(
      new Set([
        ...defaultInterestOptions.filter((option) => !removedOptions.has(option)),
        ...customOptions,
      ])
    ).filter(Boolean);
  }, [customInterestOptions]);

  const clampTextSizeStep = (value) => Math.max(-20, Math.min(10, Number(value) || 0));

  const updateBoardEntryTextSize = (direction) => {
    setBoardEntryTextSize((current) => clampTextSizeStep(current + direction));
  };

  const updateStaffTextSize = (direction) => {
    setStaffTextSize((current) => clampTextSizeStep(current + direction));
  };

  const eventDisplayOptions = useMemo(() => {
    const options =
      savedEventDisplays.length > 0
        ? savedEventDisplays
        : eventDisplayPresets.filter(
            (eventDisplay) => !hiddenBuiltinEventDisplayIds.includes(eventDisplay.id)
          );

    return options.map(normalizeEventDisplayPreset).filter(Boolean);
  }, [hiddenBuiltinEventDisplayIds, savedEventDisplays]);

  const activeEventDisplay =
    eventDisplayOptions.find((eventDisplay) => eventDisplay.id === activeEventDisplayId) ||
    eventDisplayOptions[0] ||
    null;

  const [pendingEventDisplayId, setPendingEventDisplayId] = useState("");

  const pendingEventDisplay =
    eventDisplayOptions.find((eventDisplay) => eventDisplay.id === pendingEventDisplayId) ||
    activeEventDisplay;

  useEffect(() => {
    // Event display presets are now saved in Supabase.
  }, [savedEventDisplays]);

  useEffect(() => {
    if (activeEventDisplayId) {
      setPendingEventDisplayId(activeEventDisplayId);
    }
  }, [activeEventDisplayId]);

  useEffect(() => {
    if (!isSetupTabsMode || activeSetupTab !== "Events" || !activeEventDisplay) return;

    setEditingEventDisplayId(activeEventDisplay.id);
    setDisplayEventName(activeEventDisplay.eventName || "");
    setDisplayEventDescription(activeEventDisplay.eventDescription || "");
    setDisplayEventStartTime(activeEventDisplay.eventStartTime || "");
    setDisplayEventEndTime(activeEventDisplay.eventEndTime || "");
    setDisplayImages(Array.isArray(activeEventDisplay.images) ? activeEventDisplay.images : []);

    const imageDuration =
      Number(activeEventDisplay.images?.[0]?.durationSeconds) ||
      Number(activeEventDisplay.images?.[0]?.durationMinutes) * 60 ||
      60;

    const liveboardDuration =
      Number(activeEventDisplay.liveboardDurationSeconds) ||
      Number(activeEventDisplay.liveboardDurationMinutes) * 60 ||
      300;

    setDisplayImageDurationSeconds(String(imageDuration));
    setDisplayLiveboardDurationSeconds(String(liveboardDuration));
  }, [isSetupTabsMode, activeSetupTab, activeEventDisplayId]);

  useEffect(() => {
    window.localStorage.setItem(
      "hiddenBuiltinEventDisplayIds",
      JSON.stringify(hiddenBuiltinEventDisplayIds)
    );
  }, [hiddenBuiltinEventDisplayIds]);

  useEffect(() => {
    if (activeEventDisplayId) {
      window.localStorage.setItem("activeEventDisplayId", activeEventDisplayId);
    }
  }, [activeEventDisplayId]);

  useEffect(() => {
    try {
      window.localStorage.setItem("entryFormPreset", entryFormPreset);
    } catch {
      // Local storage may be unavailable in some browser privacy modes.
    }
  }, [entryFormPreset]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "visibleSexualPreferenceOptions",
        JSON.stringify(visibleSexualPreferenceOptions)
      );
    } catch {
      // Local storage may be unavailable in some browser privacy modes.
    }
  }, [visibleSexualPreferenceOptions]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "visibleInterestOptions",
        JSON.stringify(visibleInterestOptions)
      );
    } catch {
      // Local storage may be unavailable in some browser privacy modes.
    }
  }, [visibleInterestOptions]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "customInterestOptions",
        JSON.stringify(customInterestOptions)
      );
    } catch {
      // Local storage may be unavailable in some browser privacy modes.
    }
  }, [customInterestOptions]);

  useEffect(() => {
    try {
      window.localStorage.setItem("allowParticipantPhotos", String(allowParticipantPhotos));
    } catch {
      // Local storage may be unavailable in some browser privacy modes.
    }
  }, [allowParticipantPhotos]);

  useEffect(() => {
    try {
      window.localStorage.setItem("allowTelegram", String(allowTelegram));
    } catch {
      // Local storage may be unavailable in some browser privacy modes.
    }
  }, [allowTelegram]);

  // LIVE ENTRY FORM SETTINGS SYNC
  // Keeps kiosk/setup/display pages in the same browser updated after Entry Form settings change.
  useEffect(() => {
    const readEntryFormSettings = () => {
      try {
        const storedPreset = window.localStorage.getItem("entryFormPreset") || "standard";

        const storedSexualPreferenceOptions = JSON.parse(
          window.localStorage.getItem("visibleSexualPreferenceOptions") || "null"
        );

        const storedInterestOptions = JSON.parse(
          window.localStorage.getItem("visibleInterestOptions") || "null"
        );

        const storedCustomInterestOptions = JSON.parse(
          window.localStorage.getItem("customInterestOptions") || "[]"
        );
        const storedAllowParticipantPhotos =
          window.localStorage.getItem("allowParticipantPhotos") !== "false";
        const storedAllowTelegram =
          window.localStorage.getItem("allowTelegram") !== "false";

        if (storedPreset && storedPreset !== entryFormPreset) {
          setEntryFormPreset(storedPreset);
        }

        if (
          Array.isArray(storedSexualPreferenceOptions) &&
          JSON.stringify(storedSexualPreferenceOptions) !== JSON.stringify(visibleSexualPreferenceOptions)
        ) {
          setVisibleSexualPreferenceOptions(storedSexualPreferenceOptions);
        }

        if (
          Array.isArray(storedInterestOptions) &&
          JSON.stringify(storedInterestOptions) !== JSON.stringify(visibleInterestOptions)
        ) {
          setVisibleInterestOptions(storedInterestOptions);
        }

        if (
          Array.isArray(storedCustomInterestOptions) &&
          JSON.stringify(storedCustomInterestOptions) !== JSON.stringify(customInterestOptions)
        ) {
          setCustomInterestOptions(storedCustomInterestOptions);
        }

        if (storedAllowParticipantPhotos !== allowParticipantPhotos) {
          setAllowParticipantPhotos(storedAllowParticipantPhotos);
        }

        if (storedAllowTelegram !== allowTelegram) {
          setAllowTelegram(storedAllowTelegram);
        }
      } catch {
        // Ignore localStorage read errors.
      }
    };

    const intervalId = window.setInterval(readEntryFormSettings, 1000);
    window.addEventListener("storage", readEntryFormSettings);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", readEntryFormSettings);
    };
  }, [
    entryFormPreset,
    visibleSexualPreferenceOptions,
    visibleInterestOptions,
    customInterestOptions,
    allowParticipantPhotos,
    allowTelegram,
  ]);

  useEffect(() => {
    try {
      window.localStorage.setItem("boardEntryTextSize", String(clampTextSizeStep(boardEntryTextSize)));
    } catch {
      // Local storage may be unavailable in some browser privacy modes.
    }
  }, [boardEntryTextSize]);

  useEffect(() => {
    try {
      window.localStorage.setItem("staffTextSize", String(clampTextSizeStep(staffTextSize)));
    } catch {
      // Local storage may be unavailable in some browser privacy modes.
    }
  }, [staffTextSize]);

  // LIVE DISPLAY TEXT SIZE SYNC
  // The setup page changes localStorage. The display page needs to re-read it live.
  useEffect(() => {
    if (mode !== "display") return;

    const readDisplayTextSizeSettings = () => {
      try {
        const nextBoardSize = clampTextSizeStep(
          Number(window.localStorage.getItem("boardEntryTextSize") || 0)
        );
        const nextStaffSize = clampTextSizeStep(
          Number(window.localStorage.getItem("staffTextSize") || 0)
        );

        setBoardEntryTextSize((current) =>
          current === nextBoardSize ? current : nextBoardSize
        );
        setStaffTextSize((current) =>
          current === nextStaffSize ? current : nextStaffSize
        );
      } catch {
        // Ignore localStorage read errors.
      }
    };

    readDisplayTextSizeSettings();

    const intervalId = window.setInterval(readDisplayTextSizeSettings, 1000);
    window.addEventListener("storage", readDisplayTextSizeSettings);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", readDisplayTextSizeSettings);
    };
  }, [mode]);

  useEffect(() => {
    const syncActiveEventDisplay = () => {
      const storedActiveId = window.localStorage.getItem("activeEventDisplayId");

      if (storedActiveId && storedActiveId !== activeEventDisplayId) {
        setActiveEventDisplayId(storedActiveId);
      }
    };

    const handleStorageChange = (event) => {
      if (event.key === "activeEventDisplayId") {
        syncActiveEventDisplay();
      }
    };

    window.addEventListener("storage", handleStorageChange);

    const interval = window.setInterval(syncActiveEventDisplay, 1500);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.clearInterval(interval);
    };
  }, [activeEventDisplayId]);

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;

    const saveActivePresetToSettings = async (presetId) => {
      if (!presetId) return;

      const { data: existingSettings } = await supabase
        .from("board_settings")
        .select("id")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSettings?.id) {
        await supabase
          .from("board_settings")
          .update({
            active_event_display_preset_id: presetId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingSettings.id);
      } else {
        await supabase.from("board_settings").insert({
          event_name: defaultConfig.eventName,
          venue_name: defaultConfig.venueName,
          active_event_display_preset_id: presetId,
          updated_at: new Date().toISOString(),
        });
      }
    };

    const loadEventDisplayPresets = async () => {
      const { data, error } = await supabase
        .from("event_display_presets")
        .select("id, event_name, event_description, liveboard_duration_seconds, transition_seconds, images, active, created_at, updated_at")
        .eq("active", true)
        .order("updated_at", { ascending: false });

      if (!mounted) return;

      if (error) {
        console.error("Could not load event display presets:", error);
        return;
      }

      const presets = (data || []).map(mapEventDisplayPresetRow);
      setSavedEventDisplays(presets);

      if (presets.length > 0 && !presets.some((preset) => preset.id === activeEventDisplayId)) {
        setActiveEventDisplayId(presets[0].id);
      }
    };

    const migrateLocalEventDisplayPresets = async () => {
      const alreadyMigrated = window.localStorage.getItem("eventDisplayPresetsMigratedToSupabase");
      const rawLocalPresets = window.localStorage.getItem("savedEventDisplays");

      if (alreadyMigrated === "true" || !rawLocalPresets) {
        return;
      }

      let localPresets = [];

      try {
        localPresets = JSON.parse(rawLocalPresets);
      } catch {
        return;
      }

      if (!Array.isArray(localPresets) || localPresets.length === 0) {
        window.localStorage.setItem("eventDisplayPresetsMigratedToSupabase", "true");
        return;
      }

      setMessage("Migrating saved event display presets to Supabase...");

      const localActiveId = window.localStorage.getItem("activeEventDisplayId");
      let migratedActivePresetId = "";

      for (const localPreset of localPresets) {
        if (!localPreset?.eventName || !Array.isArray(localPreset.images) || localPreset.images.length === 0) {
          continue;
        }

        const imageDuration =
          Number(localPreset.images?.[0]?.durationSeconds) ||
          Number(localPreset.images?.[0]?.durationMinutes) * 60 ||
          60;

        const liveboardDuration =
          Number(localPreset.liveboardDurationSeconds) ||
          Number(localPreset.liveboardDurationMinutes) * 60 ||
          300;

        const uploadedImages = await uploadEventDisplayImagesToSupabase(
          localPreset.images.map((image, index) => ({
            ...image,
            id: image.id || `${slugifyEventDisplay(localPreset.eventName)}-image-${index + 1}`,
            durationSeconds:
              Number(image.durationSeconds) ||
              Number(image.durationMinutes) * 60 ||
              imageDuration,
          })),
          localPreset.eventName
        );

        const { data, error } = await supabase
          .from("event_display_presets")
          .insert({
            event_name: localPreset.eventName,
            event_description: localPreset.eventDescription || "",
            liveboard_duration_seconds: liveboardDuration,
            transition_seconds: Number(localPreset.transitionSeconds) || 0.5,
            images: uploadedImages,
            active: true,
            updated_at: new Date().toISOString(),
          })
          .select("id, event_name, event_description, liveboard_duration_seconds, transition_seconds, images, active, created_at, updated_at")
          .single();

        if (error) {
          console.error("Event display preset migration error:", error);
          continue;
        }

        if (localPreset.id === localActiveId) {
          migratedActivePresetId = data.id;
        }
      }

      window.localStorage.setItem("eventDisplayPresetsMigratedToSupabase", "true");

      await loadEventDisplayPresets();

      if (migratedActivePresetId) {
        setActiveEventDisplayId(migratedActivePresetId);
        await saveActivePresetToSettings(migratedActivePresetId);
      }

      setMessage("Event display presets migrated to Supabase.");
      setTimeout(() => setMessage(""), 3500);
    };

    loadEventDisplayPresets().then(migrateLocalEventDisplayPresets);

    const channel = supabase
      .channel("event-display-presets-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_display_presets" },
        () => loadEventDisplayPresets()
      )
      .subscribe();

    const eventDisplayPresetRefreshInterval = window.setInterval(
      loadEventDisplayPresets,
      5000
    );

    return () => {
      mounted = false;
      window.clearInterval(eventDisplayPresetRefreshInterval);
      supabase.removeChannel(channel);
    };
  }, []);

  const appConfig = {
    ...defaultConfig,
    eventName: activeEventDisplay?.eventName || settings?.event_name || defaultConfig.eventName,
    venueName: activeEventDisplay?.eventDescription || settings?.venue_name || defaultConfig.venueName,
  };
  const displayEasternTime = formatEasternDisplayTime(displayNow);
  const eventCountdown = getEventCountdown(
    activeEventDisplay?.eventStartTime,
    activeEventDisplay?.eventEndTime,
    displayNow
  );

  const availableHandlePlatforms = [
    allowFetLife ? "FetLife" : null,
    allowWhappz ? "Whappz" : null,
    allowTwitter ? "Twitter" : null,
    allowBluesky ? "Bluesky" : null,
    allowTelegram ? "Telegram" : null,
    allowOtherPlatform ? "Instagram / IG" : null,
  ].filter(Boolean);

  useEffect(() => {
    if (!availableHandlePlatforms.includes(socialPlatform)) {
      setSocialPlatform(availableHandlePlatforms[0] || "FetLife");
    }
  }, [allowFetLife, allowWhappz, allowTwitter, allowBluesky, allowTelegram, allowOtherPlatform]); // eslint-disable-line

  useEffect(() => {
    if (!isKioskEntryMode || !entrySuccess) return;

    const timer = setTimeout(() => {
      window.location.reload();
    }, 10000);

    return () => clearTimeout(timer);
  }, [isKioskEntryMode, entrySuccess]);

  const itemSuggestions = useMemo(() => {
    const term = itemInput.trim().toLowerCase();
    if (!term) return [];
    const aliasMatches = new Set(searchAliases[term] || []);

    return allCatalogItems
      .filter((item) => {
        const lower = item.toLowerCase();
        return lower.startsWith(term) || aliasMatches.has(item);
      })
      .slice(0, 12);
  }, [itemInput]);

  const dmItemSuggestions = useMemo(() => {
    const term = dmItemInput.trim().toLowerCase();
    if (!term) return [];
    const aliasMatches = new Set(searchAliases[term] || []);

    return allCatalogItems
      .filter((item) => {
        const lower = item.toLowerCase();
        return lower.startsWith(term) || aliasMatches.has(item);
      })
      .slice(0, 12);
  }, [dmItemInput]);

  const hostItemSuggestions = useMemo(() => {
    const term = hostItemInput.trim().toLowerCase();
    if (!term) return [];
    const aliasMatches = new Set(searchAliases[term] || []);

    return allCatalogItems
      .filter((item) => {
        const lower = item.toLowerCase();
        return lower.startsWith(term) || aliasMatches.has(item);
      })
      .slice(0, 12);
  }, [hostItemInput]);

  const participantEntries = useMemo(
    () => entries.filter((entry) => (entry.entry_kind || "participant") === "participant"),
    [entries]
  );

  const dmEntries = useMemo(
    () => entries.filter((entry) => (entry.entry_kind || "participant") === "dm"),
    [entries]
  );

  const hostEntries = useMemo(
    () =>
      [...entries]
        .filter((entry) => (entry.entry_kind || "participant") === "host")
        .sort((a, b) => {
          const rank = (entry) => {
            const role = entry.position || entry.dm_category;
            if (role === "Host") return 0;
            if (role === "Co-Host") return 1;
            return 99;
          };

          const diff = rank(a) - rank(b);
          if (diff !== 0) return diff;

          return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        }),
    [entries]
  );

  const filteredSetupEntries = useMemo(() => {
    if (!setupSearch.trim()) return participantEntries;
    const term = setupSearch.trim().toLowerCase();

    return participantEntries.filter((entry) => {
      const mergedItems = [...(entry.items || []), ...(entry.custom_items || [])];
      return (
        entry.name.toLowerCase().includes(term) ||
        (entry.position || "").toLowerCase().includes(term) ||
        (entry.who_am_i_text || "").toLowerCase().includes(term) ||
        (entry.seeking_text || "").toLowerCase().includes(term) ||
        (entry.social_handle || "").toLowerCase().includes(term) ||
        (entry.social_platform || "").toLowerCase().includes(term) ||
        mergedItems.some((item) => item.toLowerCase().includes(term))
      );
    });
  }, [participantEntries, setupSearch]);

  const topEntries = useMemo(
    () => participantEntries.filter((entry) => entry.position === "Top"),
    [participantEntries]
  );
  const bottomEntries = useMemo(
    () => participantEntries.filter((entry) => entry.position === "Bottom"),
    [participantEntries]
  );
  const switchEntries = useMemo(
    () => participantEntries.filter((entry) => entry.position === "Switch"),
    [participantEntries]
  );

  const currentRaffleDraw = useMemo(() => raffleDraws[0] || null, [raffleDraws]);
  const previousRaffleDraws = useMemo(() => raffleDraws.slice(1, 9), [raffleDraws]);
  const isRaffleDisplayActive = settings?.display_mode === "raffle";
  const participantDisplayLayout = settings?.participant_display_layout === "list" ? "list" : "tiles";

  const getRaffleStatusLabel = (status) => {
    if (status === "winner") return "Winner";
    if (status === "timed_out") return "Timed Out";
    return "Drawn";
  };

  const getRaffleStatusClass = (status) => {
    if (status === "winner") return "border-emerald-300/60 bg-emerald-300/20 text-emerald-100";
    if (status === "timed_out") return "border-rose-300/60 bg-rose-300/20 text-rose-100";
    return "border-sky-300/50 bg-sky-300/15 text-sky-100";
  };

  useEffect(() => {
    const updateEasternTime = () => setDisplayNow(new Date());

    updateEasternTime();

    const easternTimeInterval = window.setInterval(updateEasternTime, 1000);

    return () => window.clearInterval(easternTimeInterval);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setSettingsLoading(false);
      return;
    }

    let mounted = true;

    const loadSettings = async () => {
      const { data, error } = await supabase
        .from("board_settings")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!mounted) return;

      if (!error && data) {
        setSettings(data);
        setSetupEventName(data.event_name || "");
        setSetupVenueName(data.venue_name || "");

        if (data.active_event_display_preset_id) {
          setActiveEventDisplayId(data.active_event_display_preset_id);
        }
        setLayoutSettings({
          host_max_rows: clampLayoutValue(data.host_max_rows ?? defaultDisplayLayout.host_max_rows),
          host_max_cols: clampLayoutValue(data.host_max_cols ?? defaultDisplayLayout.host_max_cols),
          dm_max_rows: clampLayoutValue(data.dm_max_rows ?? defaultDisplayLayout.dm_max_rows),
          dm_max_cols: clampLayoutValue(data.dm_max_cols ?? defaultDisplayLayout.dm_max_cols),
          top_max_rows: clampLayoutValue(data.top_max_rows ?? defaultDisplayLayout.top_max_rows),
          top_max_cols: clampLayoutValue(data.top_max_cols ?? defaultDisplayLayout.top_max_cols),
          bottom_max_rows: clampLayoutValue(data.bottom_max_rows ?? defaultDisplayLayout.bottom_max_rows),
          bottom_max_cols: clampLayoutValue(data.bottom_max_cols ?? defaultDisplayLayout.bottom_max_cols),
          switch_max_rows: clampLayoutValue(data.switch_max_rows ?? defaultDisplayLayout.switch_max_rows),
          switch_max_cols: clampLayoutValue(data.switch_max_cols ?? defaultDisplayLayout.switch_max_cols),
        });
        setShowSocialHandleField(data.show_social_handle_field ?? true);
        setShowSexualPreferenceSection(data.show_sexual_preference_section ?? true);
        setShowInterestSection(data.show_interest_section ?? true);
        setAllowFetLife(data.allow_fetlife ?? true);
        setAllowWhappz(data.allow_whappz ?? true);
        setAllowTwitter(data.allow_twitter ?? true);
        setAllowBluesky(data.allow_bluesky ?? true);
        setAllowOtherPlatform(data.allow_other_platform ?? true);

        if (data.entry_form_preset) {
          setEntryFormPreset(data.entry_form_preset);
        }

        if (Array.isArray(data.visible_sexual_preference_options)) {
          setVisibleSexualPreferenceOptions(data.visible_sexual_preference_options);
        }

        if (Array.isArray(data.custom_sexual_preference_options)) {
          setCustomSexualPreferenceOptions(data.custom_sexual_preference_options);
        }

        if (Array.isArray(data.visible_interest_options)) {
          setVisibleInterestOptions(data.visible_interest_options);
        }

        if (Array.isArray(data.custom_interest_options)) {
          setAllowParticipantPhotos(getParticipantPhotoSetting(data.custom_interest_options));
          setAllowTelegram(getTelegramSetting(data.custom_interest_options));
          setParticipantDisplayColumns(getParticipantColumnsSetting(data.custom_interest_options));
          setCustomInterestOptions(
            withoutParticipantColumnsSetting(
              withoutTelegramSetting(withoutParticipantPhotoSetting(data.custom_interest_options))
            )
          );
        }
      }

      setSettingsLoading(false);
    };

    const loadEntries = async () => {
      const { data, error } = await supabase
        .from("board_entries")
        .select(
          "id, name, social_handle, social_platform, position, who_am_i_text, seeking_text, items, custom_items, entry_kind, dm_category, host_function, active, deleted_at, created_at"
        )
        .eq("active", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (!error) setEntries(data || []);
      setLoading(false);
    };

    const loadRaffleDraws = async () => {
      const { data, error } = await supabase
        .from("raffle_draws")
        .select("id, ticket_number, status, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (!error) setRaffleDraws(data || []);
    };

    loadSettings();
    loadEntries();
    loadRaffleDraws();

    const raffleRefreshInterval = window.setInterval(loadRaffleDraws, 2000);
    const liveBoardRefreshInterval = !isSetupMode
      ? window.setInterval(() => {
          loadSettings();
          loadEntries();
          loadRaffleDraws();
        }, 1500)
      : null;
    const settingsRefreshInterval = !isSetupMode ? window.setInterval(loadSettings, 1000) : null;

    const channel = supabase
      .channel("board-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "board_entries" },
        () => loadEntries()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "board_settings" },
        () => loadSettings()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "raffle_draws" },
        () => loadRaffleDraws()
      )
      .subscribe();

    return () => {
      mounted = false;
      window.clearInterval(raffleRefreshInterval);
      if (liveBoardRefreshInterval) window.clearInterval(liveBoardRefreshInterval);
      if (settingsRefreshInterval) window.clearInterval(settingsRefreshInterval);
      supabase.removeChannel(channel);
    };
  }, []);

  const updateBoardDisplayMode = async (nextDisplayMode, showConfirmation = true) => {
    if (!["liveboard", "raffle"].includes(nextDisplayMode)) return;

    if (!supabase) {
      setMessage("Supabase connection is missing.");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    const updatedAt = new Date().toISOString();
    const payload = {
      display_mode: nextDisplayMode,
      updated_at: updatedAt,
    };

    if (settings?.id) {
      const { data, error } = await supabase
        .from("board_settings")
        .update(payload)
        .eq("id", settings.id)
        .select("*")
        .single();

      if (error) {
        setMessage("Could not switch display mode: " + error.message);
        return;
      }

      setSettings(data);
    } else {
      const { data, error } = await supabase
        .from("board_settings")
        .insert({
          event_name: setupEventName || defaultConfig.eventName,
          venue_name: setupVenueName || defaultConfig.venueName,
          ...payload,
        })
        .select("*")
        .single();

      if (error) {
        setMessage("Could not switch display mode: " + error.message);
        return;
      }

      setSettings(data);
    }

    if (showConfirmation) {
      setMessage(
        nextDisplayMode === "raffle"
          ? "Display switched to Raffle."
          : "Display switched to LiveBoard."
      );
      setTimeout(() => setMessage(""), 2500);
    }
  };

  const updateParticipantDisplayLayout = async (nextLayout) => {
    if (!["tiles", "list"].includes(nextLayout)) return;

    if (!supabase) {
      setMessage("Supabase connection is missing.");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    const updatedAt = new Date().toISOString();
    const payload = {
      participant_display_layout: nextLayout,
      updated_at: updatedAt,
    };

    if (settings?.id) {
      const { data, error } = await supabase
        .from("board_settings")
        .update(payload)
        .eq("id", settings.id)
        .select("*")
        .single();

      if (error) {
        setMessage("Could not switch display layout: " + error.message);
        return;
      }

      setSettings(data);
    } else {
      const { data, error } = await supabase
        .from("board_settings")
        .insert({
          event_name: setupEventName || defaultConfig.eventName,
          venue_name: setupVenueName || defaultConfig.venueName,
          display_mode: "liveboard",
          ...payload,
        })
        .select("*")
        .single();

      if (error) {
        setMessage("Could not switch display layout: " + error.message);
        return;
      }

      setSettings(data);
    }

    setMessage(
      nextLayout === "list"
        ? "Display layout switched to List View."
        : "Display layout switched to Tile View."
    );
    setTimeout(() => setMessage(""), 2500);
  };

  const updateParticipantDisplayColumns = async (nextColumns) => {
    const columns = clampParticipantColumns(nextColumns);

    if (!supabase) {
      setMessage("Supabase connection is missing.");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    const payload = {
      custom_interest_options: withParticipantColumnsSetting(
        withTelegramSetting(
          withParticipantPhotoSetting(customInterestOptions, allowParticipantPhotos),
          allowTelegram
        ),
        columns
      ),
      updated_at: new Date().toISOString(),
    };

    const query = settings?.id
      ? supabase.from("board_settings").update(payload).eq("id", settings.id)
      : supabase.from("board_settings").insert({
          event_name: setupEventName || defaultConfig.eventName,
          venue_name: setupVenueName || defaultConfig.venueName,
          display_mode: "liveboard",
          ...payload,
        });

    const { data, error } = await query.select("*").single();

    if (error) {
      setMessage("Could not change display columns: " + error.message);
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setParticipantDisplayColumns(columns);
    setSettings(data);
    setMessage(`Participant display changed to ${columns} columns.`);
    setTimeout(() => setMessage(""), 2500);
  };

  const addRaffleDraw = async () => {
    const ticketNumber = raffleTicketInput.trim();

    if (!ticketNumber) {
      setMessage("Enter the drawn ticket number first.");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    if (!supabase) {
      setMessage("Supabase connection is missing.");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    setRaffleSaving(true);

    const { data, error } = await supabase
      .from("raffle_draws")
      .insert({
        ticket_number: ticketNumber,
        status: "drawn",
      })
      .select("id, ticket_number, status, created_at, updated_at")
      .single();

    setRaffleSaving(false);

    if (error) {
      setMessage("Could not show raffle number: " + error.message);
      return;
    }

    if (data) {
      setRaffleDraws((current) => [
        data,
        ...current.filter((draw) => draw.id !== data.id),
      ]);
    }

    setRaffleTicketInput("");
    await updateBoardDisplayMode("raffle", false);
    setMessage("Raffle number " + ticketNumber + " is now on display.");
    setTimeout(() => setMessage(""), 2500);
  };

  const updateRaffleDrawStatus = async (draw, nextStatus) => {
    if (!draw) {
      setMessage("No raffle number is selected.");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    if (!supabase) {
      setMessage("Supabase connection is missing.");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    const updatedAt = new Date().toISOString();

    const { error } = await supabase
      .from("raffle_draws")
      .update({
        status: nextStatus,
        updated_at: updatedAt,
      })
      .eq("id", draw.id);

    if (error) {
      setMessage("Could not update raffle number: " + error.message);
      return;
    }

    setRaffleDraws((current) =>
      current.map((raffleDraw) =>
        raffleDraw.id === draw.id
          ? { ...raffleDraw, status: nextStatus, updated_at: updatedAt }
          : raffleDraw
      )
    );

    setMessage("Raffle number " + draw.ticket_number + " marked " + getRaffleStatusLabel(nextStatus) + ".");
    setTimeout(() => setMessage(""), 2500);
  };

  const updateCurrentRaffleStatus = async (nextStatus) => {
    await updateRaffleDrawStatus(currentRaffleDraw, nextStatus);
  };

  const undoLastRaffleDraw = async () => {
    if (!currentRaffleDraw) {
      setMessage("There is no raffle draw to undo.");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    if (!window.confirm('Remove raffle number "' + currentRaffleDraw.ticket_number + '" from the display?')) return;

    const { error } = await supabase
      .from("raffle_draws")
      .delete()
      .eq("id", currentRaffleDraw.id);

    if (error) {
      setMessage("Could not undo raffle draw: " + error.message);
      return;
    }

    setRaffleDraws((current) => current.filter((draw) => draw.id !== currentRaffleDraw.id));

    setMessage("Last raffle draw removed.");
    setTimeout(() => setMessage(""), 2500);
  };

  const clearRaffleDraws = async () => {
    if (!raffleDraws.length) {
      setMessage("There are no raffle numbers to clear.");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    if (!window.confirm("Clear all raffle numbers from the display and history?")) return;

    const ids = raffleDraws.map((draw) => draw.id);

    const { error } = await supabase
      .from("raffle_draws")
      .delete()
      .in("id", ids);

    if (error) {
      setMessage("Could not clear raffle: " + error.message);
      return;
    }

    setRaffleDraws([]);

    setMessage("Raffle cleared. Display will return to the normal board.");
    setTimeout(() => setMessage(""), 2500);
  };

  const addItemValue = (rawValue) => {
    const value = rawValue.trim();
    if (!value) return;

    if (selectedItems.length >= defaultConfig.maxSelectedItems) {
      setMessage(`You can only choose up to ${defaultConfig.maxSelectedItems} items.`);
      return;
    }

    const strongMatch = findKinkStrongMatch(value, allCatalogItems);
    const finalValue = strongMatch || value;

    if (!selectedItems.includes(finalValue)) {
      setSelectedItems((current) => [...current, finalValue]);
    }

    setItemInput("");
  };

  const addDmItemValue = (rawValue) => {
    const value = rawValue.trim();
    if (!value) return;

    if (dmSelectedItems.length >= defaultConfig.maxSelectedItems) {
      setMessage(`You can only choose up to ${defaultConfig.maxSelectedItems} items.`);
      return;
    }

    const strongMatch = findKinkStrongMatch(value, allCatalogItems);
    const finalValue = strongMatch || value;

    if (!dmSelectedItems.includes(finalValue)) {
      setDmSelectedItems((current) => [...current, finalValue]);
    }

    setDmItemInput("");
  };

  const addHostItemValue = (rawValue) => {
    const value = rawValue.trim();
    if (!value) return;

    if (hostSelectedItems.length >= defaultConfig.maxSelectedItems) {
      setMessage(`You can only choose up to ${defaultConfig.maxSelectedItems} items.`);
      return;
    }

    const strongMatch = findKinkStrongMatch(value, allCatalogItems);
    const finalValue = strongMatch || value;

    if (!hostSelectedItems.includes(finalValue)) {
      setHostSelectedItems((current) => [...current, finalValue]);
    }

    setHostItemInput("");
  };

  const removeSelectedItem = (itemToRemove) => {
    setSelectedItems((current) => current.filter((item) => item !== itemToRemove));
  };

  const toggleOpenToItem = (item) => {
    setSelectedItems((current) =>
      current.includes(item)
        ? current.filter((value) => value !== item)
        : [...current, item]
    );
  };

  const toggleSexualPreferenceItem = (item) => {
    setSexualPreferenceItems((current) =>
      current.includes(item)
        ? current.filter((value) => value !== item)
        : [...current, item]
    );
  };

  const toggleInterestItem = (item) => {
    setInterestItems((current) =>
      current.includes(item)
        ? current.filter((value) => value !== item)
        : [...current, item]
    );
  };

  const updateEntryFormPreset = async (nextPreset) => {
    const allowedPresets = ["standard", "men_only", "mens_spanking", "diaper_debauchery_glow"];

    if (!allowedPresets.includes(nextPreset)) return;

    setEntryFormPreset(nextPreset);

    try {
      window.localStorage.setItem("entryFormPreset", nextPreset);
    } catch {
      // Ignore local storage issues.
    }

    if (!supabase) {
      setMessage("Entry form changed locally, but Supabase connection is missing.");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    const payload = {
      entry_form_preset: nextPreset,
      visible_sexual_preference_options: visibleSexualPreferenceOptions,
      custom_sexual_preference_options: customSexualPreferenceOptions,
      visible_interest_options: visibleInterestOptions,
      custom_interest_options: withParticipantColumnsSetting(
        withTelegramSetting(
          withParticipantPhotoSetting(customInterestOptions, allowParticipantPhotos),
          allowTelegram
        ),
        participantDisplayColumns
      ),
      updated_at: new Date().toISOString(),
    };

    const query = settings?.id
      ? supabase
          .from("board_settings")
          .update(payload)
          .eq("id", settings.id)
          .select("*")
          .single()
      : supabase
          .from("board_settings")
          .insert({
            event_name: setupEventName || defaultConfig.eventName,
            venue_name: setupVenueName || defaultConfig.venueName,
            ...payload,
          })
          .select("*")
          .single();

    const { data, error } = await query;

    if (error) {
      setMessage("Could not switch entry form: " + error.message);
      return;
    }

    if (data) setSettings(data);

    const label =
      nextPreset === "men_only"
        ? "Men Only"
        : nextPreset === "mens_spanking"
          ? "Men’s Spanking"
          : nextPreset === "diaper_debauchery_glow"
            ? "KrINKles"
            : "Standard";

    setMessage("Entry form switched to " + label + ".");
    setTimeout(() => setMessage(""), 2500);
  };

  const persistSexualPreferenceButtonOptions = async (
    nextVisibleSexualPreferenceOptions,
    nextCustomSexualPreferenceOptions,
    confirmationMessage = ""
  ) => {
    try {
      window.localStorage.setItem(
        "visibleSexualPreferenceOptions",
        JSON.stringify(nextVisibleSexualPreferenceOptions)
      );
      window.localStorage.setItem(
        "customSexualPreferenceOptions",
        JSON.stringify(nextCustomSexualPreferenceOptions)
      );
    } catch {
      // Ignore local storage issues.
    }

    if (!supabase) return;

    const payload = {
      visible_sexual_preference_options: nextVisibleSexualPreferenceOptions,
      custom_sexual_preference_options: nextCustomSexualPreferenceOptions,
      updated_at: new Date().toISOString(),
    };

    const query = settings?.id
      ? supabase
          .from("board_settings")
          .update(payload)
          .eq("id", settings.id)
          .select("*")
          .single()
      : supabase
          .from("board_settings")
          .insert({
            event_name: setupEventName || defaultConfig.eventName,
            venue_name: setupVenueName || defaultConfig.venueName,
            ...payload,
          })
          .select("*")
          .single();

    const { data, error } = await query;

    if (error) {
      setMessage("Could not save Sexual Preference buttons: " + error.message);
      return;
    }

    if (data) setSettings(data);

    if (confirmationMessage) {
      setMessage(confirmationMessage);
      setTimeout(() => setMessage(""), 2500);
    }
  };

  const toggleVisibleSexualPreferenceOption = (item) => {
    const nextVisibleSexualPreferenceOptions = visibleSexualPreferenceOptions.includes(item)
      ? visibleSexualPreferenceOptions.filter((value) => value !== item)
      : [...visibleSexualPreferenceOptions, item];

    setVisibleSexualPreferenceOptions(nextVisibleSexualPreferenceOptions);
    persistSexualPreferenceButtonOptions(
      nextVisibleSexualPreferenceOptions,
      customSexualPreferenceOptions,
      item + (
        nextVisibleSexualPreferenceOptions.includes(item)
          ? " activated for the kiosk."
          : " deactivated from the kiosk."
      )
    );
  };

  const persistInterestButtonOptions = async (
    nextVisibleInterestOptions,
    nextCustomInterestOptions,
    confirmationMessage = ""
  ) => {
    try {
      window.localStorage.setItem(
        "visibleInterestOptions",
        JSON.stringify(nextVisibleInterestOptions)
      );
      window.localStorage.setItem(
        "customInterestOptions",
        JSON.stringify(nextCustomInterestOptions)
      );
    } catch {
      // Ignore local storage issues.
    }

    if (!supabase) return;

    const payload = {
      visible_interest_options: nextVisibleInterestOptions,
      custom_interest_options: withParticipantPhotoSetting(nextCustomInterestOptions, allowParticipantPhotos),
      updated_at: new Date().toISOString(),
    };

    const query = settings?.id
      ? supabase
          .from("board_settings")
          .update(payload)
          .eq("id", settings.id)
          .select("*")
          .single()
      : supabase
          .from("board_settings")
          .insert({
            event_name: setupEventName || defaultConfig.eventName,
            venue_name: setupVenueName || defaultConfig.venueName,
            ...payload,
          })
          .select("*")
          .single();

    const { data, error } = await query;

    if (error) {
      setMessage("Could not save Interest buttons: " + error.message);
      return;
    }

    if (data) setSettings(data);

    if (confirmationMessage) {
      setMessage(confirmationMessage);
      setTimeout(() => setMessage(""), 2500);
    }
  };

  const toggleVisibleInterestOption = (item) => {
    const nextVisibleInterestOptions = visibleInterestOptions.includes(item)
      ? visibleInterestOptions.filter((value) => value !== item)
      : [...visibleInterestOptions, item];

    setVisibleInterestOptions(nextVisibleInterestOptions);
    persistInterestButtonOptions(
      nextVisibleInterestOptions,
      customInterestOptions,
      item + (
        nextVisibleInterestOptions.includes(item)
          ? " activated for the kiosk."
          : " deactivated from the kiosk."
      )
    );
  };

  const addCustomSexualPreferenceOption = () => {
    const value = customSexualPreferenceOptionInput.trim();

    if (!value) {
      setMessage("Enter a custom Sexual Preference option first.");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    const alreadyExists = allSexualPreferenceOptions.some(
      (option) => option.toLowerCase() === value.toLowerCase()
    );

    if (alreadyExists) {
      setMessage(value + " already exists as a Sexual Preference option.");
      setCustomSexualPreferenceOptionInput("");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    const removedMarker = getRemovedEntryOptionMarker(value);
    const nextCustomSexualPreferenceOptions = defaultSexualPreferenceOptions.includes(value)
      ? customSexualPreferenceOptions.filter((option) => option !== removedMarker)
      : [...customSexualPreferenceOptions.filter((option) => option !== removedMarker), value];
    const nextVisibleSexualPreferenceOptions = visibleSexualPreferenceOptions.includes(value)
      ? visibleSexualPreferenceOptions
      : [...visibleSexualPreferenceOptions, value];

    setCustomSexualPreferenceOptions(nextCustomSexualPreferenceOptions);
    setVisibleSexualPreferenceOptions(nextVisibleSexualPreferenceOptions);
    setCustomSexualPreferenceOptionInput("");

    persistSexualPreferenceButtonOptions(
      nextVisibleSexualPreferenceOptions,
      nextCustomSexualPreferenceOptions,
      value + " added to Sexual Preference Buttons."
    );
  };

  const removeCustomSexualPreferenceOption = (item) => {
    const removedMarker = getRemovedEntryOptionMarker(item);
    const withoutOption = customSexualPreferenceOptions.filter(
      (value) => value !== item && value !== removedMarker
    );
    const nextCustomSexualPreferenceOptions = defaultSexualPreferenceOptions.includes(item)
      ? [...withoutOption, removedMarker]
      : withoutOption;
    const nextVisibleSexualPreferenceOptions = visibleSexualPreferenceOptions.filter((value) => value !== item);

    setCustomSexualPreferenceOptions(nextCustomSexualPreferenceOptions);
    setVisibleSexualPreferenceOptions(nextVisibleSexualPreferenceOptions);
    setSexualPreferenceItems((current) => current.filter((value) => value !== item));

    persistSexualPreferenceButtonOptions(
      nextVisibleSexualPreferenceOptions,
      nextCustomSexualPreferenceOptions,
      item + " removed from Sexual Preference options."
    );
  };

  const addCustomInterestOption = () => {
    const value = customInterestOptionInput.trim();

    if (!value) return;

    const alreadyExists = allInterestOptions.some(
      (option) => option.toLowerCase() === value.toLowerCase()
    );

    if (alreadyExists) {
      setMessage(`${value} already exists as an Interest option.`);
      setCustomInterestOptionInput("");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    const removedMarker = getRemovedEntryOptionMarker(value);
    const nextCustomInterestOptions = defaultInterestOptions.includes(value)
      ? customInterestOptions.filter((option) => option !== removedMarker)
      : [...customInterestOptions.filter((option) => option !== removedMarker), value];
    const nextVisibleInterestOptions = visibleInterestOptions.includes(value)
      ? visibleInterestOptions
      : [...visibleInterestOptions, value];

    setCustomInterestOptions(nextCustomInterestOptions);
    setVisibleInterestOptions(nextVisibleInterestOptions);
    setCustomInterestOptionInput("");

    persistInterestButtonOptions(
      nextVisibleInterestOptions,
      nextCustomInterestOptions,
      value + " added to Interest Buttons."
    );
  };

  const removeCustomInterestOption = (item) => {
    const removedMarker = getRemovedEntryOptionMarker(item);
    const withoutOption = customInterestOptions.filter(
      (value) => value !== item && value !== removedMarker
    );
    const nextCustomInterestOptions = defaultInterestOptions.includes(item)
      ? [...withoutOption, removedMarker]
      : withoutOption;
    const nextVisibleInterestOptions = visibleInterestOptions.filter((value) => value !== item);

    setCustomInterestOptions(nextCustomInterestOptions);
    setVisibleInterestOptions(nextVisibleInterestOptions);
    setInterestItems((current) => current.filter((value) => value !== item));

    persistInterestButtonOptions(
      nextVisibleInterestOptions,
      nextCustomInterestOptions,
      item + " removed from Interest options."
    );
  };

  const toggleQuickTag = (tag) => {
    setQuickTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag]
    );
  };

  const removeDmSelectedItem = (itemToRemove) => {
    setDmSelectedItems((current) => current.filter((item) => item !== itemToRemove));
  };

  const removeHostSelectedItem = (itemToRemove) => {
    setHostSelectedItems((current) => current.filter((item) => item !== itemToRemove));
  };

  const resetEntryForm = () => {
    setName("");
    setSocialHandle("");
    setSocialPlatform(availableHandlePlatforms[0] || "FetLife");
    setSocialHandleDraftPlatform(availableHandlePlatforms[0] || "FetLife");
    setSocialHandleDraftValue("");
    setSocialHandleItems([]);
    setPosition("");
    setWhoAmIInput("");
    setSeekingInput("");
    setIdentityChoice("");
    setIdentityOther("");
    setSeekingChoice("");
    setSeekingOther("");
    setOrientationChoice("");
    setOrientationOther("");
    setQuickTags([]);
    setItemInput("");
    setSelectedItems([]);
    setSexualPreferenceInput("");
    setSexualPreferenceItems([]);
    setInterestInput("");
    setInterestItems([]);
    setLookingForItems([]);
    setSpankingTopImplements([]);
    setSpankingTopOther("");
    setSpankingBottomImplements([]);
    setSpankingBottomOther("");
    setSpankingLimitItems([]);
    setSpankingLimitsOther("");
    setSpankingExperienceLevel("");
    setMessage("");
    setEntrySuccess(false);
    removeParticipantPhoto();
    stopParticipantCamera();
  };

  const resetDmForm = () => {
    setDmName("");
    setDmCategory("");
    setDmItemInput("");
    setDmSelectedItems([]);
    setMessage("");
  };

  const resetHostForm = () => {
    setHostName("");
      setHostRole("");
      setHostCustomRole("");
      setHostFunctions([]);
      setHostCustomFunction("");
    setHostCategory("");
    setHostItemInput("");
    setHostSelectedItems([]);
    setMessage("");
  };

  const updateLayoutValue = (key, delta) => {
    setLayoutSettings((current) => ({
      ...current,
      [key]: clampLayoutValue((current[key] ?? defaultDisplayLayout[key]) + delta),
    }));
  };

  const saveSettings = async () => {
    if (!supabase) {
      setMessage("Supabase connection is missing.");
      return;
    }

    setSettingsSaving(true);

    const payload = {
      event_name: setupEventName || defaultConfig.eventName,
      venue_name: setupVenueName || defaultConfig.venueName,
      host_max_rows: clampLayoutValue(displayLayout.host_max_rows),
      host_max_cols: clampLayoutValue(displayLayout.host_max_cols),
      dm_max_rows: clampLayoutValue(displayLayout.dm_max_rows),
      dm_max_cols: clampLayoutValue(displayLayout.dm_max_cols),
      top_max_rows: clampLayoutValue(displayLayout.top_max_rows),
      top_max_cols: clampLayoutValue(displayLayout.top_max_cols),
      bottom_max_rows: clampLayoutValue(displayLayout.bottom_max_rows),
      bottom_max_cols: clampLayoutValue(displayLayout.bottom_max_cols),
      switch_max_rows: clampLayoutValue(displayLayout.switch_max_rows),
      switch_max_cols: clampLayoutValue(displayLayout.switch_max_cols),
      show_social_handle_field: showSocialHandleField,
      show_sexual_preference_section: showSexualPreferenceSection,
      show_interest_section: showInterestSection,
      allow_fetlife: allowFetLife,
      allow_whappz: allowWhappz,
      allow_twitter: allowTwitter,
      allow_bluesky: allowBluesky,
      allow_other_platform: allowOtherPlatform,
      entry_form_preset: entryFormPreset,
      visible_sexual_preference_options: visibleSexualPreferenceOptions,
      custom_sexual_preference_options: customSexualPreferenceOptions,
      visible_interest_options: visibleInterestOptions,
      custom_interest_options: withParticipantColumnsSetting(
        withTelegramSetting(
          withParticipantPhotoSetting(customInterestOptions, allowParticipantPhotos),
          allowTelegram
        ),
        participantDisplayColumns
      ),
      active_event_display_preset_id: activeEventDisplayId || null,
      updated_at: new Date().toISOString(),
    };

    if (settings?.id) {
      const { data, error } = await supabase
        .from("board_settings")
        .update(payload)
        .eq("id", settings.id)
        .select()
        .single();

      setSettingsSaving(false);

      if (error) {
        setMessage(`Could not save settings: ${error.message}`);
        return;
      }

      setSettings(data);
      setMessage("Settings saved.");
      setTimeout(() => setMessage(""), 2000);
      return;
    }

    const { data, error } = await supabase
      .from("board_settings")
      .insert(payload)
      .select()
      .single();

    setSettingsSaving(false);

    if (error) {
      setMessage(`Could not save settings: ${error.message}`);
      return;
    }

    setSettings(data);
    setMessage("Settings saved.");
    setTimeout(() => setMessage(""), 2000);
  };

  const compressDisplayImage = async (image) => {
    if (!image?.imageUrl || !image.imageUrl.startsWith("data:image/")) {
      return image;
    }

    return new Promise((resolve) => {
      const sourceImage = new Image();

      sourceImage.onload = () => {
        const maxWidth = 1600;
        const maxHeight = 900;
        const ratio = Math.min(
          1,
          maxWidth / sourceImage.width,
          maxHeight / sourceImage.height
        );

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceImage.width * ratio));
        canvas.height = Math.max(1, Math.round(sourceImage.height * ratio));

        const context = canvas.getContext("2d");
        context.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);

        const compressedUrl = canvas.toDataURL("image/jpeg", 0.78);

        resolve({
          ...image,
          imageUrl: compressedUrl,
          compressed: true,
        });
      };

      sourceImage.onerror = () => {
        resolve(image);
      };

      sourceImage.src = image.imageUrl;
    });
  };

  const compressDisplayImages = async (images) => {
    const compressed = [];

    for (const image of images || []) {
      compressed.push(await compressDisplayImage(image));
    }

    return compressed;
  };

  const updateActiveEventDisplayPreset = async (presetId) => {
    const selectedEventDisplay =
      eventDisplayOptions.find((eventDisplay) => eventDisplay.id === presetId) ||
      activeEventDisplay;

    const selectedEventName =
      selectedEventDisplay?.eventName ||
      selectedEventDisplay?.event_name ||
      setupEventName ||
      defaultConfig.eventName;

    const selectedEventDescription =
      selectedEventDisplay?.eventDescription ||
      selectedEventDisplay?.event_description ||
      setupVenueName ||
      defaultConfig.venueName;

    setActiveEventDisplayId(presetId);
    setSetupEventName(selectedEventName);
    setSetupVenueName(selectedEventDescription);

    if (!supabase) {
      window.localStorage.setItem("activeEventDisplayId", presetId);
      return;
    }

    const payload = {
      event_name: selectedEventName,
      venue_name: selectedEventDescription,
      host_max_rows: clampLayoutValue(displayLayout.host_max_rows),
      host_max_cols: clampLayoutValue(displayLayout.host_max_cols),
      dm_max_rows: clampLayoutValue(displayLayout.dm_max_rows),
      dm_max_cols: clampLayoutValue(displayLayout.dm_max_cols),
      top_max_rows: clampLayoutValue(displayLayout.top_max_rows),
      top_max_cols: clampLayoutValue(displayLayout.top_max_cols),
      bottom_max_rows: clampLayoutValue(displayLayout.bottom_max_rows),
      bottom_max_cols: clampLayoutValue(displayLayout.bottom_max_cols),
      switch_max_rows: clampLayoutValue(displayLayout.switch_max_rows),
      switch_max_cols: clampLayoutValue(displayLayout.switch_max_cols),
      show_social_handle_field: showSocialHandleField,
      show_sexual_preference_section: showSexualPreferenceSection,
      show_interest_section: showInterestSection,
      allow_fetlife: allowFetLife,
      allow_whappz: allowWhappz,
      allow_twitter: allowTwitter,
      allow_bluesky: allowBluesky,
      allow_other_platform: allowOtherPlatform,
      entry_form_preset: entryFormPreset,
      visible_sexual_preference_options: visibleSexualPreferenceOptions,
      custom_sexual_preference_options: customSexualPreferenceOptions,
      visible_interest_options: visibleInterestOptions,
      custom_interest_options: withParticipantColumnsSetting(
        withTelegramSetting(
          withParticipantPhotoSetting(customInterestOptions, allowParticipantPhotos),
          allowTelegram
        ),
        participantDisplayColumns
      ),
      active_event_display_preset_id: presetId || null,
      updated_at: new Date().toISOString(),
    };

    if (settings?.id) {
      const { data, error } = await supabase
        .from("board_settings")
        .update(payload)
        .eq("id", settings.id)
        .select()
        .single();

      if (error) {
        setMessage(`Could not update active preset: ${error.message}`);
        return;
      }

      setSettings(data);
      setMessage("Active display preset updated.");
      setTimeout(() => setMessage(""), 1800);
      return;
    }

    const { data, error } = await supabase
      .from("board_settings")
      .insert(payload)
      .select()
      .single();

    if (error) {
      setMessage(`Could not update active preset: ${error.message}`);
      return;
    }

    setSettings(data);
    setMessage("Active display preset updated.");
    setTimeout(() => setMessage(""), 1800);
  };

  const handleDisplayImageUpload = async (event) => {
    const files = Array.from(event.target.files || []);

    if (!files.length) return;

    const readFileAsDataUrl = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          resolve({
            id: `${Date.now()}-${file.name}`,
            name: file.name,
            imageUrl: reader.result,
            durationSeconds: Number(displayImageDurationSeconds) || 60,
          });
        };

        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

    try {
      setMessage("Compressing image(s)...");
      const uploadedImages = await Promise.all(files.map(readFileAsDataUrl));
      const compressedImages = await compressDisplayImages(uploadedImages);

      setDisplayImages((current) => [...current, ...compressedImages]);
      event.target.value = "";

      setMessage("Image(s) added.");
      setTimeout(() => setMessage(""), 2000);
    } catch {
      setMessage("Could not read one or more image files.");
    }
  };

  const removeDisplayImage = (imageId) => {
    setDisplayImages((current) => current.filter((image) => image.id !== imageId));
  };

  const moveDisplayImage = (imageId, direction) => {
    setDisplayImages((current) => {
      const index = current.findIndex((image) => image.id === imageId);

      if (index === -1) return current;

      const nextIndex = direction === "up" ? index - 1 : index + 1;

      if (nextIndex < 0 || nextIndex >= current.length) return current;

      const reordered = [...current];
      const [image] = reordered.splice(index, 1);
      reordered.splice(nextIndex, 0, image);

      return reordered;
    });
  };

  const reorderDisplayImage = (draggedImageId, targetImageId) => {
    if (!draggedImageId || !targetImageId || draggedImageId === targetImageId) return;

    setDisplayImages((current) => {
      const draggedIndex = current.findIndex((image) => image.id === draggedImageId);
      const targetIndex = current.findIndex((image) => image.id === targetImageId);

      if (draggedIndex === -1 || targetIndex === -1) return current;

      const reordered = [...current];
      const [draggedImage] = reordered.splice(draggedIndex, 1);
      reordered.splice(targetIndex, 0, draggedImage);

      return reordered;
    });
  };

  const saveEventDisplayPreset = async () => {
    const name = displayEventName.trim();

    if (!supabase) {
      setMessage("Supabase connection is missing.");
      return;
    }

    if (!name) {
      setMessage("Please enter an event display name.");
      return;
    }

    if (Boolean(displayEventStartTime) !== Boolean(displayEventEndTime)) {
      setMessage("Please enter both an event start time and end time.");
      return;
    }

    if (displaySlidesEnabled && !displayImages.length) {
      setMessage("Please add at least one image.");
      return;
    }

    const imageDuration = Number(displayImageDurationSeconds) || 60;
    const liveboardDuration = Number(displayLiveboardDurationSeconds) || 300;
    const idBase = slugifyEventDisplay(name);

    setMessage("Uploading image(s) to Supabase...");

    let compressedImages = [];

    try {
      compressedImages = await compressDisplayImages(displayImages);
    } catch {
      setMessage("Could not prepare one or more images.");
      return;
    }

    let uploadedImages = [];

    try {
      uploadedImages = await uploadEventDisplayImagesToSupabase(
        compressedImages.map((image, index) => ({
          ...image,
          id: image.id || `${idBase}-image-${index + 1}`,
          durationSeconds: imageDuration,
        })),
        name
      );
    } catch (error) {
      setMessage(`Could not upload image(s): ${error.message}`);
      return;
    }

    if (editingEventDisplayId) {
      const existingPreset = savedEventDisplays.find(
        (eventDisplay) => eventDisplay.id === editingEventDisplayId
      );

      if (!existingPreset) {
        setMessage("Only saved Supabase presets can be edited.");
        setTimeout(() => setMessage(""), 2500);
        return;
      }

      const { data, error } = await supabase
        .from("event_display_presets")
        .update({
          event_name: name,
          event_description: serializeEventScheduleDescription(
            displayEventDescription,
            displayEventStartTime,
            displayEventEndTime,
            displaySlidesEnabled
          ),
          liveboard_duration_seconds: liveboardDuration,
          transition_seconds: 0.5,
          images: uploadedImages,
          active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingEventDisplayId)
        .select("id, event_name, event_description, liveboard_duration_seconds, transition_seconds, images, active, created_at, updated_at")
        .single();

      if (error) {
        setMessage(`Could not update event display preset: ${error.message}`);
        return;
      }

      const updatedPreset = mapEventDisplayPresetRow(data);

      setSavedEventDisplays((current) =>
        current.map((eventDisplay) =>
          eventDisplay.id === updatedPreset.id ? updatedPreset : eventDisplay
        )
      );

      window.localStorage.setItem(
        "eventDisplayPresetsUpdatedAt",
        new Date().toISOString()
      );

      await updateActiveEventDisplayPreset(updatedPreset.id);

      setEditingEventDisplayId("");
      setDisplayEventName("");
      setDisplayEventDescription("");
      setDisplayEventStartTime("");
      setDisplayEventEndTime("");
      setDisplayImageDurationSeconds("60");
      setDisplayLiveboardDurationSeconds("300");
      setDisplayImages([]);
      setDisplaySlidesEnabled(true);

      setMessage("Event display preset updated.");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    const { data, error } = await supabase
      .from("event_display_presets")
      .insert({
        event_name: name,
        event_description: serializeEventScheduleDescription(
          displayEventDescription,
          displayEventStartTime,
          displayEventEndTime,
          displaySlidesEnabled
        ),
        liveboard_duration_seconds: liveboardDuration,
        transition_seconds: 0.5,
        images: uploadedImages,
        active: true,
        updated_at: new Date().toISOString(),
      })
      .select("id, event_name, event_description, liveboard_duration_seconds, transition_seconds, images, active, created_at, updated_at")
      .single();

    if (error) {
      setMessage(`Could not save event display preset: ${error.message}`);
      return;
    }

    const newPreset = mapEventDisplayPresetRow(data);

    setSavedEventDisplays((current) => [newPreset, ...current]);
    await updateActiveEventDisplayPreset(newPreset.id);

    setDisplayEventName("");
    setDisplayEventDescription("");
    setDisplayEventStartTime("");
    setDisplayEventEndTime("");
    setDisplayImageDurationSeconds("60");
    setDisplayLiveboardDurationSeconds("300");
    setDisplayImages([]);
    setDisplaySlidesEnabled(true);

    setMessage("Event display preset saved to Supabase.");
    setTimeout(() => setMessage(""), 2500);
  };

  const editActiveEventDisplayPreset = (selectedPresetId = activeEventDisplayId) => {
    const activePreset = savedEventDisplays.find(
      (eventDisplay) => eventDisplay.id === selectedPresetId
    );

    if (!activePreset) {
      setMessage("Only custom saved presets can be edited.");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    const firstImage = activePreset.images?.[0] || {};
    const imageDuration =
      firstImage.durationSeconds ??
      ((firstImage.durationMinutes || 1) * 60) ??
      60;

    const liveboardDuration =
      activePreset.liveboardDurationSeconds ??
      ((activePreset.liveboardDurationMinutes || 5) * 60) ??
      300;

    setEditingEventDisplayId(activePreset.id);
    setDisplayEventName(activePreset.eventName || "");
    setDisplayEventDescription(activePreset.eventDescription || "");
    setDisplayEventStartTime(activePreset.eventStartTime || "");
    setDisplayEventEndTime(activePreset.eventEndTime || "");
    setDisplaySlidesEnabled(activePreset.slidesEnabled !== false);
    setDisplayImageDurationSeconds(String(imageDuration));
    setDisplayLiveboardDurationSeconds(String(liveboardDuration));
    setDisplayImages(activePreset.images || []);

    setMessage(`Editing: ${activePreset.eventName}`);
    setTimeout(() => setMessage(""), 2500);
  };

  const cancelEventDisplayEdit = () => {
    setEditingEventDisplayId("");
    setDisplayEventName("");
    setDisplayEventDescription("");
    setDisplayEventStartTime("");
    setDisplayEventEndTime("");
    setDisplaySlidesEnabled(true);
    setDisplayImageDurationSeconds("60");
    setDisplayLiveboardDurationSeconds("300");
    setDisplayImages([]);
    setMessage("Edit cancelled.");
    setTimeout(() => setMessage(""), 2000);
  };

  const deleteActiveEventDisplayPreset = async (selectedPresetId = activeEventDisplayId) => {
    if (!supabase) {
      setMessage("Supabase connection is missing.");
      return;
    }

    const activeCustomPreset = savedEventDisplays.find(
      (eventDisplay) => eventDisplay.id === selectedPresetId
    );

    const activeBuiltinPreset = eventDisplayPresets.find(
      (eventDisplay) => eventDisplay.id === selectedPresetId
    );

    const activePreset = activeCustomPreset || activeBuiltinPreset;

    if (!activePreset) {
      setMessage("No event display preset is selected.");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    const isBuiltinPreset = Boolean(activeBuiltinPreset);

    const confirmMessage = isBuiltinPreset
      ? `Hide built-in preset "${activePreset.eventName}" from this browser?`
      : `Delete event display preset "${activePreset.eventName}" from Supabase?`;

    if (!window.confirm(confirmMessage)) return;

    if (isBuiltinPreset) {
      const nextHiddenIds = Array.from(
        new Set([...hiddenBuiltinEventDisplayIds, activePreset.id])
      );

      const nextOptions = eventDisplayPresets.filter(
        (eventDisplay) =>
          eventDisplay.id !== activePreset.id &&
          !nextHiddenIds.includes(eventDisplay.id)
      );

      setHiddenBuiltinEventDisplayIds(nextHiddenIds);
      setPendingEventDisplayId("");

      if (selectedPresetId === activeEventDisplayId) {
        setActiveEventDisplayId(savedEventDisplays[0]?.id || nextOptions[0]?.id || "");
      }

      setMessage("Built-in sample preset hidden.");
      setTimeout(() => setMessage(""), 2500);
      return;
    }

    const { error } = await supabase
      .from("event_display_presets")
      .delete()
      .eq("id", activePreset.id);

    if (error) {
      setMessage(`Could not delete event display preset: ${error.message}`);
      return;
    }

    const remaining = savedEventDisplays.filter(
      (eventDisplay) => eventDisplay.id !== activePreset.id
    );

    setSavedEventDisplays(remaining);
    setPendingEventDisplayId("");

    if (selectedPresetId === activeEventDisplayId) {
      const nextActiveId =
        remaining[0]?.id ||
        eventDisplayPresets.find(
          (eventDisplay) => !hiddenBuiltinEventDisplayIds.includes(eventDisplay.id)
        )?.id ||
        "";

      if (nextActiveId) {
        await updateActiveEventDisplayPreset(nextActiveId);
      } else {
        setActiveEventDisplayId("");
      }
    }

    if (editingEventDisplayId === selectedPresetId) {
      setEditingEventDisplayId("");
      setDisplayEventName("");
      setDisplayEventDescription("");
      setDisplayImageDurationSeconds("60");
      setDisplayLiveboardDurationSeconds("300");
      setDisplayImages([]);
      setDisplaySlidesEnabled(true);
    }

    setMessage("Event display preset deleted from Supabase.");
    setTimeout(() => setMessage(""), 2500);
  };


  const toggleLookingForItem = (item) => {
    setLookingForItems((current) =>
      current.includes(item) ? current.filter((value) => value !== item) : [...current, item]
    );
  };

  const toggleListItem = (setter, item) => {
    setter((current) =>
      current.includes(item) ? current.filter((value) => value !== item) : [...current, item]
    );
  };

  const toggleSpankingTopImplement = (item) => toggleListItem(setSpankingTopImplements, item);
  const toggleSpankingBottomImplement = (item) => toggleListItem(setSpankingBottomImplements, item);
  const toggleSpankingLimitItem = (item) => toggleListItem(setSpankingLimitItems, item);

  const formatSocialHandleLine = (platform, value) => {
    const cleanPlatform = String(platform || "").trim();
    const cleanValue = String(value || "").trim();

    if (!cleanValue) return "";

    const platformNames = ["Instagram / IG", "FetLife", "Bluesky", "X", "Instagram", "Twitter", "Whappz", "Telegram"];

    const normalizeHandleLines = (rawValue) => {
      let normalized = String(rawValue || "");

      platformNames.forEach((name) => {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        normalized = normalized.replace(
          new RegExp(`\\s+(${escaped}\\s*:)`, "gi"),
          "\\n$1"
        );
      });

      return normalized
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");
    };

    const cleanLines = normalizeHandleLines(cleanValue);

    if (!cleanPlatform) return cleanLines;

    if (new RegExp(`^${cleanPlatform}\\s*:`, "i").test(cleanLines)) {
      return cleanLines;
    }

    return `${cleanPlatform}: ${cleanLines}`;
  };

  const addSocialHandleItem = () => {
    const line = formatSocialHandleLine(socialHandleDraftPlatform, socialHandleDraftValue);

    if (!line) {
      setMessage("Please type a handle before adding it.");
      return;
    }

    setSocialHandleItems((current) =>
      current.includes(line) ? current : [...current, line]
    );
    setSocialHandleDraftValue("");
  };

  const removeSocialHandleItem = (line) => {
    setSocialHandleItems((current) => current.filter((item) => item !== line));
  };

  const openParticipantCropper = (file) => {
    if (participantCropSource?.url) URL.revokeObjectURL(participantCropSource.url);
    setParticipantCropSource({ file, url: URL.createObjectURL(file) });
    setParticipantCropZoom(1);
    setParticipantCropX(50);
    setParticipantCropY(50);
    setParticipantCropDimensions(null);
  };

  const cancelParticipantCrop = () => {
    if (participantCropSource?.url) URL.revokeObjectURL(participantCropSource.url);
    setParticipantCropSource(null);
  };

  const applyParticipantCrop = async () => {
    if (!participantCropSource?.file) return;

    try {
      setMessage("Preparing photo...");
      const preparedPhoto = await prepareParticipantPhoto(
        participantCropSource.file,
        participantCropZoom,
        participantCropX,
        participantCropY
      );
      if (participantPhotoPreview) URL.revokeObjectURL(participantPhotoPreview);
      setParticipantPhotoFile(preparedPhoto);
      setParticipantPhotoPreview(URL.createObjectURL(preparedPhoto));
      cancelParticipantCrop();
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const startParticipantCropDrag = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    participantCropDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCropX: participantCropX,
      startCropY: participantCropY,
      width: event.currentTarget.clientWidth,
      height: event.currentTarget.clientHeight,
    };
  };

  const moveParticipantCrop = (event) => {
    const drag = participantCropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const horizontalChange = ((event.clientX - drag.startClientX) / drag.width) * 100;
    const verticalChange = ((event.clientY - drag.startClientY) / drag.height) * 100;
    setParticipantCropX(Math.min(100, Math.max(0, drag.startCropX - horizontalChange)));
    setParticipantCropY(Math.min(100, Math.max(0, drag.startCropY - verticalChange)));
  };

  const stopParticipantCropDrag = (event) => {
    if (participantCropDragRef.current?.pointerId === event.pointerId) {
      participantCropDragRef.current = null;
    }
  };

  const handleParticipantPhotoChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type?.startsWith("image/") || file.size > 15 * 1024 * 1024) {
      setMessage("Please choose an image smaller than 15 MB.");
      return;
    }

    openParticipantCropper(file);
  };

  const removeParticipantPhoto = () => {
    if (participantPhotoPreview) URL.revokeObjectURL(participantPhotoPreview);
    setParticipantPhotoFile(null);
    setParticipantPhotoPreview("");
    cancelParticipantCrop();
  };

  const stopParticipantCamera = () => {
    participantCameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    participantCameraStreamRef.current = null;
    setParticipantCameraOpen(false);
  };

  const startParticipantCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Camera access is not available in this browser.");
      return;
    }

    try {
      setMessage("Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      participantCameraStreamRef.current = stream;
      setParticipantCameraOpen(true);
      setMessage("");
    } catch (error) {
      setMessage(
        error?.name === "NotAllowedError"
          ? "Camera permission was not granted. You can continue without a photo."
          : `Could not open the camera: ${error.message}`
      );
    }
  };

  useEffect(() => {
    if (!participantCameraOpen || !participantCameraVideoRef.current) return;
    participantCameraVideoRef.current.srcObject = participantCameraStreamRef.current;
  }, [participantCameraOpen]);

  useEffect(() => () => {
    participantCameraStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const captureParticipantPhoto = async () => {
    const video = participantCameraVideoRef.current;
    if (!video?.videoWidth || !video?.videoHeight) {
      setMessage("The camera is still starting. Please try again in a moment.");
      return;
    }

    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

    const photo = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.78)
    );

    if (!photo) {
      setMessage("The photo could not be captured. Please try again.");
      return;
    }

    stopParticipantCamera();
    openParticipantCropper(photo);
    setMessage("");
  };

  const createEntry = async () => {
    if (!supabase) {
      setMessage("Supabase connection is missing.");
      return;
    }

    if (!name.trim()) {
      setMessage("Please enter a display name.");
      return;
    }

    if (!isConnectionEntryForm && !position) {
      setMessage("Please choose Top, Bottom, or Switch.");
      return;
    }

    const finalWhoAmI = isDiaperDebaucheryEntryForm
      ? quickTags.join(" • ")
      : isMenOnlyEntryForm
        ? ""
        : identityChoice === "Other"
          ? identityOther.trim()
          : identityChoice;

    const finalSeeking = isDiaperDebaucheryEntryForm
      ? lookingForItems.join(", ")
      : isMenOnlyEntryForm
        ? ""
        : seekingChoice === "Other"
          ? seekingOther.trim()
          : seekingChoice;

    const finalOrientation = isMenOnlyEntryForm || isConnectionEntryForm
      ? ""
      : orientationChoice === "Other"
        ? orientationOther.trim()
        : orientationChoice;

    if (!isMenOnlyEntryForm && !isConnectionEntryForm && !finalWhoAmI) {
      setMessage("Please choose how you identify.");
      return;
    }

    if (!isMenOnlyEntryForm && !isConnectionEntryForm && !finalSeeking) {
      setMessage("Please choose who you are seeking.");
      return;
    }

    const parsedSexualPreferenceItems = sexualPreferenceInput
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const parsedInterestItems = interestInput
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const finalSexualPreferenceItems = Array.from(new Set([
      ...sexualPreferenceItems.filter((item) => item !== "Other"),
      ...parsedSexualPreferenceItems,
    ]));

    const finalInterestItems = Array.from(new Set([
      ...interestItems.filter((item) => item !== "Other"),
      ...parsedInterestItems,
    ]));

    const parseSpankingTextItems = (value) =>
      String(value || "")
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean);

    const showSpankingTopSection =
      isMensSpankingEntryForm && (position === "Top" || position === "Switch");
    const showSpankingBottomSection =
      isMensSpankingEntryForm && (position === "Bottom" || position === "Switch");
    const showSpankingLimitsSection = isMensSpankingEntryForm && Boolean(position);

    const finalSpankingTopItems = showSpankingTopSection
      ? Array.from(new Set([...spankingTopImplements, ...parseSpankingTextItems(spankingTopOther)]))
      : [];

    const finalSpankingBottomItems = showSpankingBottomSection
      ? Array.from(new Set([...spankingBottomImplements, ...parseSpankingTextItems(spankingBottomOther)]))
      : [];

    const finalSpankingLimitItems = showSpankingLimitsSection
      ? Array.from(new Set([...spankingLimitItems, ...parseSpankingTextItems(spankingLimitsOther)]))
      : [];

    const finalSpankingExperienceItems =
      isMensSpankingEntryForm && spankingExperienceLevel ? [spankingExperienceLevel] : [];

    const finalSpankingEntryItems = [
      ...finalSpankingTopItems,
      ...finalSpankingBottomItems,
      ...finalSpankingLimitItems,
      ...finalSpankingExperienceItems,
    ];

    if (
      finalSexualPreferenceItems.length < 1 &&
      finalInterestItems.length < 1 &&
      finalSpankingEntryItems.length < 1 &&
      !(isMensSpankingEntryForm && quickTags.length > 0) &&
      !isDiaperDebaucheryEntryForm
    ) {
      setMessage("Please add at least one sexual preference, interest, intention, or scene detail.");
      return;
    }

    const taggedSpankingTopItems = finalSpankingTopItems.map((item) => `Top likes to give: ${item}`);
    const taggedSpankingBottomItems = finalSpankingBottomItems.map((item) => `Bottom likes to receive: ${item}`);
    const taggedSpankingLimitItems = finalSpankingLimitItems.map((item) => `Limits: ${item}`);
    const taggedSpankingExperienceItems = finalSpankingExperienceItems.map((item) => `Experience: ${item}`);
    const taggedSexualPreferenceItems = finalSexualPreferenceItems.map((item) => `Sexual: ${item}`);
    const taggedInterestItems = finalInterestItems.map((item) => `Interests: ${item}`);

    const finalOpenToItems = [
      ...taggedSpankingTopItems,
      ...taggedSpankingBottomItems,
      ...taggedSpankingLimitItems,
      ...taggedSpankingExperienceItems,
      ...taggedSexualPreferenceItems,
      ...taggedInterestItems,
    ];

    const standardItems = [];
    const customItems = finalOpenToItems;
    const orientationItem = finalOrientation ? [`Orientation: ${finalOrientation}`] : [];
    const quickTagItems = quickTags.map((tag) =>
      `Quick Tag: ${tag === "Learn New Skills" ? "Learning" : tag}`
    );
    setSaving(true);
    let uploadedParticipantPhoto = null;

    if (participantPhotoFile) {
      try {
        setMessage("Uploading photo...");
        uploadedParticipantPhoto = await uploadParticipantPhoto(participantPhotoFile);
      } catch (error) {
        setSaving(false);
        setMessage(`Could not upload photo: ${error.message}`);
        return;
      }
    }

    const photoItem = uploadedParticipantPhoto
      ? [createParticipantPhotoMarker(uploadedParticipantPhoto)]
      : [];
    const finalCustomItems = [...customItems, ...orientationItem, ...quickTagItems, ...photoItem];

    const draftSocialHandleLine = formatSocialHandleLine(
      socialHandleDraftPlatform,
      socialHandleDraftValue
    );

    const finalDiaperSocialHandles = Array.from(
      new Set(
        [...socialHandleItems, draftSocialHandleLine]
          .filter(Boolean)
          .flatMap((line) => String(line).split(/\n+/))
          .map((line) => line.trim())
          .filter(Boolean)
      )
    );

    const handleValue = showSocialHandleField
      ? usesMultipleSocialHandles
        ? finalDiaperSocialHandles.join("\n")
        : socialHandle.trim()
      : null;

    const platformValue =
      usesMultipleSocialHandles
        ? null
        : showSocialHandleField && handleValue && availableHandlePlatforms.includes(socialPlatform)
          ? socialPlatform
          : null;

    const { error } = await supabase.from("board_entries").insert({
      name: name.trim(),
      social_handle: handleValue || null,
      social_platform: platformValue || null,
      position: isConnectionEntryForm ? "Switch" : position,
      who_am_i_text: finalWhoAmI || null,
      seeking_text: finalSeeking || null,
      items: standardItems.sort((a, b) => a.localeCompare(b)),
      custom_items: finalCustomItems.sort((a, b) => a.localeCompare(b)),
      entry_kind: "participant",
      active: true,
    });

    setSaving(false);

    if (error) {
      if (uploadedParticipantPhoto?.path) {
        await supabase.storage.from(EVENT_DISPLAY_BUCKET).remove([uploadedParticipantPhoto.path]);
      }
      setMessage(`Could not save entry: ${error.message}`);
      return;
    }

    resetEntryForm();
    setEntrySuccess(true);
  };

  const createSupportTeamEntry = async () => {
    if (!supabase) {
      setMessage("Supabase connection is missing.");
      return;
    }

    if (!hostName.trim()) {
      setMessage("Please enter a support team name.");
      return;
    }

    const parsedCustomSupportFunctions = hostCustomFunction
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const finalHostFunctions = Array.from(new Set([
      ...hostFunctions,
      ...parsedCustomSupportFunctions,
    ]));

    if (finalHostFunctions.length < 1) {
      setMessage("Please choose or enter at least one support function.");
      return;
    }

    const parsedSupportItems = hostItemInput
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const finalSupportItems = Array.from(new Set([
      ...hostSelectedItems,
      ...parsedSupportItems,
    ]));

    const standardItems = finalSupportItems.filter((item) => catalogSet.has(item));
    const customItems = finalSupportItems.filter((item) => !catalogSet.has(item));

    setHostSaving(true);

    const finalSupportRole = hostCustomRole.trim() || hostRole;
    const isDmRole = finalSupportRole === "DM";
    const isRolelessSupportEntry = !finalSupportRole;
    const supportFunctionText = finalHostFunctions.join(", ");

    const { error } = await supabase.from("board_entries").insert({
      name: hostName.trim(),
      social_handle: null,
      social_platform: null,
      who_am_i_text: null,
      seeking_text: null,
      position: isDmRole || isRolelessSupportEntry ? null : finalSupportRole,
      dm_category: isDmRole ? supportFunctionText : null,
      host_function: isDmRole ? null : supportFunctionText,
      items: standardItems.sort((a, b) => a.localeCompare(b)),
      custom_items: customItems.sort((a, b) => a.localeCompare(b)),
      entry_kind: isDmRole ? "dm" : "host",
      active: true,
    });

    setHostSaving(false);

    if (error) {
      setMessage(`Could not save support team entry: ${error.message}`);
      return;
    }

    resetHostForm();
    setMessage("Support team entry added.");
    setTimeout(() => setMessage(""), 2000);
  };

  const createDmEntry = async () => {
    if (!supabase) {
      setMessage("Supabase connection is missing.");
      return;
    }

    if (!dmName.trim()) {
      setMessage("Please enter a DM / Facilitator name.");
      return;
    }

    if (dmRoles.length < 1) {
      setMessage("Please choose at least one DM / Facilitator function.");
      return;
    }

    const parsedDmItems = dmItemInput
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const finalDmItems = Array.from(new Set([
      ...dmSelectedItems,
      ...parsedDmItems,
    ]));

    const standardItems = finalDmItems.filter((item) => catalogSet.has(item));
    const customItems = finalDmItems.filter((item) => !catalogSet.has(item));

    setDmSaving(true);

    const { error } = await supabase.from("board_entries").insert({
      name: dmName.trim(),
      social_handle: null,
      social_platform: null,
      who_am_i_text: null,
      seeking_text: null,
      dm_category: dmRoles.join(", "),
      items: standardItems.sort((a, b) => a.localeCompare(b)),
      custom_items: customItems.sort((a, b) => a.localeCompare(b)),
      entry_kind: "dm",
      active: true,
    });

    setDmSaving(false);

    if (error) {
      setMessage(`Could not save DM / Facilitator: ${error.message}`);
      return;
    }

    resetDmForm();
    setMessage("DM / Facilitator saved.");
    setTimeout(() => setMessage(""), 1800);
  };

  const createHostEntry = async () => {
    if (!supabase) {
      setMessage("Supabase connection is missing.");
      return;
    }

    if (!hostName.trim()) {
      setMessage("Please enter a Host name.");
      return;
    }

    if (!hostRole.trim()) {
      setMessage("Please choose Host or Co-Host.");
      return;
    }

    const standardItems = hostSelectedItems.filter((item) => catalogSet.has(item));
    const customItems = hostSelectedItems.filter((item) => !catalogSet.has(item));

    setHostSaving(true);

    const { error } = await supabase.from("board_entries").insert({
      name: hostName.trim(),
      social_handle: null,
      social_platform: null,
      who_am_i_text: null,
      seeking_text: null,
      position: hostRole.trim(),
      dm_category: hostFunctions.join(", "),
      host_function: hostFunctions.length ? hostFunctions.join(", ") : null,
      items: standardItems.sort((a, b) => a.localeCompare(b)),
      custom_items: customItems.sort((a, b) => a.localeCompare(b)),
      entry_kind: "host",
      active: true,
    });

    setHostSaving(false);

    if (error) {
      setMessage(`Could not save Host: ${error.message}`);
      return;
    }

    resetHostForm();
    setMessage("Host saved.");
    setTimeout(() => setMessage(""), 1800);
  };

  const removeEntry = async (id) => {
    if (!supabase) return;

    const entryToRemove = entries.find((entry) => entry.id === id) || null;
    const removedAt = new Date().toISOString();

    const { error } = await supabase
      .from("board_entries")
      .update({ active: false, deleted_at: removedAt })
      .eq("id", id);

    if (error) {
      setMessage(`Could not remove entry: ${error.message}`);
      return;
    }

    if (entryToRemove) {
      setLastRemovedEntry(entryToRemove);
      setMessage(`${entryToRemove.name} removed.`);
    } else {
      setLastRemovedEntry({ id, name: "Entry" });
      setMessage("Entry removed.");
    }

    setTimeout(() => {
      setMessage((current) =>
        current.includes("removed") ? "" : current
      );
    }, 8000);
  };

  const undoRemoveEntry = async () => {
    if (!supabase || !lastRemovedEntry?.id) return;

    const { error } = await supabase
      .from("board_entries")
      .update({ active: true, deleted_at: null })
      .eq("id", lastRemovedEntry.id);

    if (error) {
      setMessage(`Could not undo removal: ${error.message}`);
      return;
    }

    setMessage(`${lastRemovedEntry.name || "Entry"} restored.`);
    setLastRemovedEntry(null);
    setTimeout(() => setMessage(""), 2500);
  };

  const clearBoard = async () => {
    if (!supabase) return;
    if (!window.confirm("Permanently delete every entry from the board? This cannot be undone.")) return;

    setMessage("Deleting participant photos and entries...");

    const { data: storedEntries, error: photoLookupError } = await supabase
      .from("board_entries")
      .select("custom_items");

    if (photoLookupError) {
      setMessage(`Could not inspect stored photos: ${photoLookupError.message}`);
      return;
    }

    const photoPaths = Array.from(new Set(
      (storedEntries || [])
        .map((entry) => getParticipantPhoto(entry.custom_items || [])?.path)
        .filter(Boolean)
    ));

    if (photoPaths.length > 0) {
      const { error: photoDeleteError } = await supabase.storage
        .from(EVENT_DISPLAY_BUCKET)
        .remove(photoPaths);

      if (photoDeleteError) {
        setMessage(`Could not delete participant photos: ${photoDeleteError.message}`);
        return;
      }
    }

    const { error } = await supabase
      .from("board_entries")
      .delete()
      .not("id", "is", null);

    if (error) {
      setMessage(`Could not clear board: ${error.message}`);
      return;
    }

    setLastRemovedEntry(null);
    setEntries([]);
    setMessage(`Board cleared. ${photoPaths.length} participant photo${photoPaths.length === 1 ? "" : "s"} and all entries permanently deleted.`);
    setTimeout(() => setMessage(""), 2500);
  };

  if (settingsLoading && isSetupMode) {
    return (
      <div className="min-h-screen bg-slate-950 p-8 text-slate-100">
        <div className="mx-auto max-w-6xl rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
          Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className={`mx-auto max-w-[2400px] ${isDisplayMode ? "p-2" : "p-5 md:p-8"}`}>
        <div className={`mb-6 ${isDisplayMode ? "mb-8" : ""}`}>
          {isDisplayMode ? (
            <div className="grid items-start gap-[0.375rem] xl:grid-cols-[minmax(520px,1fr)_minmax(760px,1.35fr)_auto]">
              <div className="xl:col-span-2">
                <h1 className="flex items-end gap-3 text-8xl md:text-9xl font-bold tracking-tight">
                  <span>{appConfig.eventName}</span>
                  <span className="text-slate-400 leading-none">|</span>
                  <span className="text-3xl md:text-[2.4rem] font-medium tracking-[0.08em] text-slate-400 leading-none pb-1">
                    {appConfig.venueName}
                  </span>
                </h1>
              </div>

              <div className="flex items-center justify-end pr-2">
                <img
                  src={DISPLAY_LOGO_SRC}
                  alt="Sanctuary Sessions logo"
                  className="h-[110px] w-auto object-contain md:h-[140px]"
                />
              </div>

              <div className="min-w-0">
                <VerticalStaffSection
                    title="Hosts"
                    entries={hostEntries}
                    maxRows={displayLayout.host_max_rows}
                    maxCols={displayLayout.host_max_cols}
                    theme={{ outer: "displayThemeHost", inner: "displayThemeHostInner" }}
                  />
              </div>

              <div className="min-w-0 xl:col-span-2">
                <DisplaySection
                  title="Dungeon Monitors"
                  entries={dmEntries}
                  theme={sectionThemes.DM}
                  maxRows={displayLayout.dm_max_rows}
                  maxCols={displayLayout.dm_max_cols}
                  isDM
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                {isEntryMode ? (
                  <>
                    <div className="overflow-x-auto">
                <div className="flex min-w-max items-baseline gap-3 whitespace-nowrap md:gap-4">
                  <h1 className="text-5xl font-bold tracking-tight text-slate-100 md:text-6xl">
                    {appConfig.eventName}
                  </h1>
                  <span className="text-3xl font-normal text-slate-500 md:text-4xl">|</span>
                  <p className="text-3xl font-normal text-slate-300 md:text-4xl">
                    {appConfig.venueName}
                  </p>
                </div>
              </div>
                  </>
                ) : (
                  <>
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                      {appConfig.eventName}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400 md:text-base">
                      Private backend screen.
                    </p>
                  </>
                )}
              </div>

              {isSetupMode || isSetupTabsMode ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      window.history.pushState({}, "", `${window.location.pathname}?mode=setup`);
                      window.dispatchEvent(new PopStateEvent("popstate"));
                    }}
                    className="rounded-2xl border border-sky-400 bg-sky-400 px-4 py-2 font-semibold text-slate-950"
                  >
                    Backend
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(`${window.location.pathname}?mode=entry&kiosk=1`, "_blank")}
                    className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 font-semibold text-slate-100"
                  >
                    Kiosk
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(`${window.location.pathname}?mode=entry`, "_blank")}
                    className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 font-semibold text-slate-100"
                  >
                    Mobile
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(`${window.location.pathname}?mode=display`, "_blank")}
                    className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 font-semibold text-slate-100"
                  >
                    Display
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {!supabase && (
          <div className="mb-6 rounded-3xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm leading-6 text-rose-100">
            Missing Supabase connection.
          </div>
        )}

        {isSetupTabsMode ? (
          <div className="mx-auto max-w-6xl rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl">
            <div>
              <div>
                <h2 className="text-3xl font-semibold tracking-tight text-slate-100">
                  Backend
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  Manage events, support team, entry forms, display sizing, entries, and raffle controls.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-4">
              {setupTabOptions.map((tab) => {
                const active = activeSetupTab === tab;

                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveSetupTab(tab)}
                    className={`rounded-2xl border px-4 py-4 text-left font-semibold transition ${
                      active
                        ? "border-sky-300 bg-sky-400 text-slate-950"
                        : "border-sky-400/30 bg-sky-400/10 text-sky-100"
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300/80">
                Active Tab
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-100">
                {activeSetupTab}
              </div>

              {activeSetupTab === "Events" ? (
                <div className="mt-5 space-y-5">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <h3 className="text-2xl font-semibold tracking-tight text-slate-100">
                      Events
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Choose or create the event display preset, slides, and timing used by the TV display.
                    </p>

                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-semibold">Event display preset</label>
                      <select
                        value={pendingEventDisplayId || activeEventDisplayId}
                        onChange={(e) => setPendingEventDisplayId(e.target.value)}
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-sky-400"
                      >
                        {eventDisplayOptions.map((eventDisplay) => (
                          <option key={eventDisplay.id} value={eventDisplay.id}>
                            {eventDisplay.eventName}
                          </option>
                        ))}
                      </select>

                      {pendingEventDisplay ? (
                        <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm leading-6 text-slate-300">
                          <div className="font-semibold text-slate-100">
                            {pendingEventDisplay.eventName}
                          </div>
                          <div className="mt-1 text-slate-400">
                            {pendingEventDisplay.eventDescription}
                          </div>
                          <div className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                            {pendingEventDisplay.id === activeEventDisplayId ? "Active display preset" : "Selected but not active yet"} · {pendingEventDisplay.images?.length || 0} image(s) · liveboard {pendingEventDisplay.liveboardDurationSeconds ?? ((pendingEventDisplay.liveboardDurationMinutes || 1) * 60)} second(s) · fade {pendingEventDisplay.transitionSeconds}s
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-4 grid gap-2 sm:grid-cols-4">
                        <button
                          type="button"
                          onClick={() => updateActiveEventDisplayPreset(pendingEventDisplayId || activeEventDisplayId)}
                          disabled={!pendingEventDisplayId || pendingEventDisplayId === activeEventDisplayId}
                          className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Activate Selected Event
                        </button>
                        <button
                          type="button"
                          onClick={() => editActiveEventDisplayPreset(pendingEventDisplayId || activeEventDisplayId)}
                          disabled={!(pendingEventDisplayId || activeEventDisplayId)}
                          className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Edit Selected Event
                        </button>
                        <button
                          type="button"
                          onClick={cancelEventDisplayEdit}
                          className="rounded-2xl border border-sky-400/40 bg-sky-400/10 px-4 py-3 text-sm font-semibold text-sky-100"
                        >
                          New Event
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteActiveEventDisplayPreset(pendingEventDisplayId || activeEventDisplayId)}
                          disabled={!(pendingEventDisplayId || activeEventDisplayId)}
                          className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Delete / hide selected preset
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <h3 className="text-lg font-semibold text-white">
                      {editingEventDisplayId ? "Edit Event Display" : "Create Event Display"}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-400">
                      {editingEventDisplayId
                        ? "Update this saved event display preset."
                        : "Save an event with its own name and description. Image and timing controls will be added to this tab next."}
                    </p>

                    <div className="mt-4 grid gap-4">
                      <div>
                        <label className="mb-2 block text-sm font-semibold">Event display name</label>
                        <input
                          value={displayEventName}
                          onChange={(e) => setDisplayEventName(e.target.value)}
                          placeholder="Example: CORROSION NYC"
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold">Event description</label>
                        <textarea
                          value={displayEventDescription}
                          onChange={(e) => setDisplayEventDescription(e.target.value)}
                          placeholder="A short line that appears with the event slides."
                          rows={3}
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-semibold">Event starts</label>
                          <input
                            type="time"
                            value={displayEventStartTime}
                            onChange={(event) => setDisplayEventStartTime(event.target.value)}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-sky-400"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-semibold">Event ends</label>
                          <input
                            type="time"
                            value={displayEventEndTime}
                            onChange={(event) => setDisplayEventEndTime(event.target.value)}
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-sky-400"
                          />
                        </div>
                      </div>

                      <p className="text-xs leading-5 text-slate-500">
                        Times use Eastern Time. If the end time is earlier than the start time, the event is treated as ending after midnight.
                      </p>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={saveEventDisplayPreset}
                          className="rounded-2xl bg-sky-400 px-5 py-3 font-semibold text-slate-950"
                        >
                          {editingEventDisplayId ? "Save Changes" : "Save Event Display"}
                        </button>

                        {editingEventDisplayId ? (
                          <button
                            type="button"
                            onClick={cancelEventDisplayEdit}
                            className="rounded-2xl border border-slate-700 bg-slate-950 px-5 py-3 font-semibold text-slate-100"
                          >
                            Cancel Edit
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <h3 className="text-lg font-semibold text-white">
                      Images & Timing
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-400">
                      Add slides, set how long each image stays up, and set how long the liveboard appears.
                    </p>

                    <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-white">
                      <input
                        type="checkbox"
                        checked={displaySlidesEnabled}
                        onChange={(event) => setDisplaySlidesEnabled(event.target.checked)}
                        className="h-5 w-5 accent-sky-400"
                      />
                      <span>
                        Enable rotating slides
                        <span className="ml-2 font-normal text-slate-400">
                          {displaySlidesEnabled ? "Slides and LiveBoard will rotate." : "LiveBoard only—slides will not appear."}
                        </span>
                      </span>
                    </label>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-semibold">Image duration, in seconds</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={displayImageDurationSeconds}
                          onChange={(e) => setDisplayImageDurationSeconds(e.target.value)}
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-sky-400"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold">Liveboard duration, in seconds</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={displayLiveboardDurationSeconds}
                          onChange={(e) => setDisplayLiveboardDurationSeconds(e.target.value)}
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-sky-400"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-semibold">Add images</label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleDisplayImageUpload}
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-sky-400 file:px-4 file:py-2 file:font-semibold file:text-slate-950"
                      />
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        Transition is automatically set to a 0.5 second fade. Images are compressed before saving.
                      </p>
                    </div>

                    {displayImages.length > 0 ? (
                      <div className="mt-4 grid gap-2">
                        <div className="text-xs leading-5 text-slate-500">
                          Images play in this order before the liveboard appears. Rearrange slides by dragging images into the order you want, then click Save Changes when finished.
                        </div>

                        {displayImages.map((image, index) => (
                          <div
                            key={image.id}
                            draggable
                            onDragStart={() => setDraggedDisplayImageId(image.id)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => {
                              reorderDisplayImage(draggedDisplayImageId, image.id);
                              setDraggedDisplayImageId("");
                            }}
                            onDragEnd={() => setDraggedDisplayImageId("")}
                            className={`flex items-center justify-between gap-3 rounded-2xl border p-3 transition ${
                              draggedDisplayImageId === image.id
                                ? "border-sky-400 bg-sky-400/10"
                                : "border-slate-800 bg-black"
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                                <img
                                  src={image.imageUrl}
                                  alt={image.name || `Image ${index + 1}`}
                                  className="h-full w-full object-cover"
                                />
                              </div>

                              <div className="min-w-0">
                                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                                  Slide {index + 1}
                                </div>

                                <div className="truncate text-sm font-semibold text-slate-100">
                                  {image.name}
                                </div>

                                <div className="text-xs text-slate-500">
                                  {displayImageDurationSeconds || 1} second(s)
                                </div>

                                <div className="mt-1 text-xs text-slate-600">
                                  Drag to rearrange slides, then click Save Changes when finished.
                                </div>
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => removeDisplayImage(image.id)}
                                className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-5 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={saveEventDisplayPreset}
                        className="rounded-2xl bg-sky-400 px-5 py-3 font-semibold text-slate-950"
                      >
                        {editingEventDisplayId ? "Save Changes" : "Save Event Display"}
                      </button>

                      {editingEventDisplayId ? (
                        <button
                          type="button"
                          onClick={cancelEventDisplayEdit}
                          className="rounded-2xl border border-slate-700 bg-slate-950 px-5 py-3 font-semibold text-slate-100"
                        >
                          Cancel Edit
                        </button>
                      ) : null}
                    </div>
                  </div>
</div>
              ) : activeSetupTab === "Display Sizing" ? (
                <div className="mt-5 space-y-5">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <h3 className="text-2xl font-semibold tracking-tight text-slate-100">
                      Display Sizing
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Control board readability from across the room.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <h3 className="text-lg font-semibold text-white">
                      Display Layout
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-400">
                      Choose how participant entries appear on the public display.
                    </p>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => updateParticipantDisplayLayout("tiles")}
                        className={`rounded-2xl border px-4 py-4 text-left transition ${
                          participantDisplayLayout === "tiles"
                            ? "border-sky-300 bg-sky-400 text-slate-950"
                            : "border-slate-700 bg-slate-950 text-slate-100"
                        }`}
                      >
                        <div className="font-black">Tile View</div>
                        <div className={`mt-1 text-sm leading-5 ${
                          participantDisplayLayout === "tiles" ? "text-slate-800" : "text-slate-400"
                        }`}>
                          Top, Bottom, and Switch display as separate cards.
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => updateParticipantDisplayLayout("list")}
                        className={`rounded-2xl border px-4 py-4 text-left transition ${
                          participantDisplayLayout === "list"
                            ? "border-sky-300 bg-sky-400 text-slate-950"
                            : "border-slate-700 bg-slate-950 text-slate-100"
                        }`}
                      >
                        <div className="font-black">List View</div>
                        <div className={`mt-1 text-sm leading-5 ${
                          participantDisplayLayout === "list" ? "text-slate-800" : "text-slate-400"
                        }`}>
                          One continuous list: Tops first, Bottoms second, Switches third.
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <h3 className="text-lg font-semibold text-white">
                      Display Text Size
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-400">
                      Adjust board readability without changing the layout.
                    </p>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                        <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-400">
                          Board Entry Text Size
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateBoardEntryTextSize(-1)}
                            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-semibold text-white"
                          >
                            −
                          </button>
                          <div className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-center font-semibold text-white">
                            {boardEntryTextSize > 0 ? `+${boardEntryTextSize}` : boardEntryTextSize}
                          </div>
                          <button
                            type="button"
                            onClick={() => updateBoardEntryTextSize(1)}
                            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-semibold text-white"
                          >
                            +
                          </button>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          Controls participant names, handles, intentions, and open-to text. Range: -10 to +10.
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                        <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-400">
                          Host / DM Text Size
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateStaffTextSize(-1)}
                            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-semibold text-white"
                          >
                            −
                          </button>
                          <div className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-center font-semibold text-white">
                            {staffTextSize > 0 ? `+${staffTextSize}` : staffTextSize}
                          </div>
                          <button
                            type="button"
                            onClick={() => updateStaffTextSize(1)}
                            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-semibold text-white"
                          >
                            +
                          </button>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          Controls Host and DM names/functions in the top support row. Range: -10 to +10.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <h3 className="text-lg font-semibold text-white">
                      Participant Columns
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-400">
                      Choose how many entry columns appear on Standard, Men Only, Men&apos;s Spanking, and KrINKles displays.
                    </p>

                    <div className="mt-4 grid grid-cols-4 gap-3">
                      {[3, 4, 5, 6].map((columns) => (
                        <button
                          key={columns}
                          type="button"
                          onClick={() => updateParticipantDisplayColumns(columns)}
                          className={`rounded-2xl border px-4 py-4 text-center transition ${
                            participantDisplayColumns === columns
                              ? "border-sky-300 bg-sky-400 text-slate-950"
                              : "border-slate-700 bg-slate-950 text-slate-100"
                          }`}
                        >
                          <div className="text-2xl font-black">{columns}</div>
                          <div className={`mt-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                            participantDisplayColumns === columns ? "text-slate-800" : "text-slate-400"
                          }`}>
                            Columns
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">
                    Display Sizing includes layout mode, participant columns, board text size, and support-team text size.
                  </div>
                </div>
              ) : activeSetupTab === "Entry Form" ? (
                <div className="mt-5 space-y-5">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <div className="mb-3">
                      <div className="text-sm font-semibold text-slate-100">Entry Form Preset</div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Choose how much the kiosk asks guests before adding them to the board.
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => updateEntryFormPreset("standard")}
                        className={`rounded-2xl border px-4 py-3 text-left ${
                          entryFormPreset === "standard"
                            ? "border-sky-400 bg-sky-400/10 text-sky-100"
                            : "border-slate-700 bg-slate-950 text-slate-200"
                        }`}
                      >
                        <div className="font-semibold">Standard</div>
                        <div className="mt-1 text-xs leading-5 text-slate-400">
                          Shows identity, seeking, orientation, intention, and open-to fields.
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => updateEntryFormPreset("men_only")}
                        className={`rounded-2xl border px-4 py-3 text-left ${
                          entryFormPreset === "men_only"
                            ? "border-amber-400 bg-amber-400/10 text-amber-100"
                            : "border-slate-700 bg-slate-950 text-slate-200"
                        }`}
                      >
                        <div className="font-semibold">Men Only</div>
                        <div className="mt-1 text-xs leading-5 text-slate-400">
                          Hides identity, seeking, and orientation for faster men-only party entry.
                        </div>
                      </button>



                      <button
                        type="button"
                        onClick={() => updateEntryFormPreset("mens_spanking")}
                        className={`rounded-2xl border px-4 py-3 text-left ${
                          entryFormPreset === "mens_spanking"
                            ? "border-amber-400 bg-amber-400/10 text-amber-100"
                            : "border-slate-700 bg-slate-950 text-slate-200"
                        }`}
                      >
                        <div className="font-semibold">Men’s Spanking</div>
                        <div className="mt-1 text-xs leading-5 text-slate-400">
                          Hides identity, seeking, and orientation for faster men-only party entry.
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => updateEntryFormPreset("diaper_debauchery_glow")}
                        className={`rounded-2xl border px-4 py-3 text-left ${
                          entryFormPreset === "diaper_debauchery_glow"
                            ? "border-fuchsia-400 bg-fuchsia-400/10 text-fuchsia-100"
                            : "border-slate-700 bg-slate-950 text-slate-200"
                        }`}
                      >
                        <div className="font-semibold">KrINKles</div>
                        <div className="mt-1 text-xs leading-5 text-slate-400">
                          Glow-themed connection board form with vibe, looking-for, kinks, sexual preferences, and socials.
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <div className="mb-4">
                      <div className="text-sm font-semibold text-slate-100">Entry Button Options</div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Choose which Sexual Preference and Interest buttons appear on the kiosk entry form.
                      </p>
                    </div>

                    <div className="mb-5 rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                        Entry Form Section Visibility
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="flex items-center gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-3 text-sm font-semibold text-sky-100">
                          <input
                            type="checkbox"
                            checked={allowParticipantPhotos}
                            onChange={(event) => {
                              setAllowParticipantPhotos(event.target.checked);
                              if (!event.target.checked) {
                                removeParticipantPhoto();
                                stopParticipantCamera();
                              }
                            }}
                            className="h-4 w-4"
                          />
                          <span>
                            Allow participant photos
                            <span className="mt-1 block text-xs font-normal leading-5 text-sky-100/60">
                              Camera-only on kiosk; camera or library on personal phones.
                            </span>
                          </span>
                        </label>

                        <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-3 text-sm font-semibold text-slate-100">
                          <input
                            type="checkbox"
                            checked={showSexualPreferenceSection}
                            onChange={(event) => {
                              setShowSexualPreferenceSection(event.target.checked);
                              if (!event.target.checked) {
                                setSexualPreferenceItems([]);
                                setSexualPreferenceInput("");
                              }
                            }}
                            className="h-4 w-4"
                          />
                          Show Sexual Preferences
                        </label>

                        <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-3 text-sm font-semibold text-slate-100">
                          <input
                            type="checkbox"
                            checked={showInterestSection}
                            onChange={(event) => {
                              setShowInterestSection(event.target.checked);
                              if (!event.target.checked) {
                                setInterestItems([]);
                                setInterestInput("");
                              }
                            }}
                            className="h-4 w-4"
                          />
                          Show Interests / Kinks
                        </label>
                      </div>

                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        Click Save settings after changing these options. The kiosk never receives access to its files or photo library.
                      </p>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="rounded-2xl border border-red-900/40 bg-red-950/10 p-4">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-red-100/70">
                          Sexual Preference Buttons
                        </div>

                        <div className="grid gap-2">
                          {allSexualPreferenceOptions.map((option) => {
                            return (
                              <div key={option} className="flex items-center justify-between gap-3">
                                <label className="flex min-w-0 items-center gap-3 text-sm text-slate-100">
                                  <input
                                    type="checkbox"
                                    checked={visibleSexualPreferenceOptions.includes(option)}
                                    onChange={() => toggleVisibleSexualPreferenceOption(option)}
                                    className="h-4 w-4"
                                  />
                                  <span className="truncate">{option}</span>
                                </label>

                                <button
                                  type="button"
                                  onClick={() => removeCustomSexualPreferenceOption(option)}
                                  className="shrink-0 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-100"
                                >
                                  Remove
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-4 rounded-2xl border border-red-900/40 bg-slate-950/70 p-3">
                          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-red-100/70">
                            Add Custom Sexual Preference Option
                          </label>

                          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                            <input
                              value={customSexualPreferenceOptionInput}
                              onChange={(event) => setCustomSexualPreferenceOptionInput(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  addCustomSexualPreferenceOption();
                                }
                              }}
                              placeholder="Example: Service Top, Side, Oral Only, Edge Play"
                              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-red-300"
                            />

                            <button
                              type="button"
                              onClick={addCustomSexualPreferenceOption}
                              className="rounded-xl bg-red-400 px-4 py-2 text-sm font-bold text-slate-950"
                            >
                              Add
                            </button>
                          </div>

                          <p className="mt-2 text-xs leading-5 text-slate-500">
                            Custom options are added to this browser and can be checked on/off like the built-in options.
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-amber-800/40 bg-amber-950/10 p-4">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-amber-100/70">
                          Interest Buttons
                        </div>

                        <div className="grid gap-2">
                          {allInterestOptions.map((option) => {
                            return (
                              <div key={option} className="flex items-center justify-between gap-3">
                                <label className="flex min-w-0 items-center gap-3 text-sm text-slate-100">
                                  <input
                                    type="checkbox"
                                    checked={visibleInterestOptions.includes(option)}
                                    onChange={() => toggleVisibleInterestOption(option)}
                                    className="h-4 w-4"
                                  />
                                  <span className="truncate">{option}</span>
                                </label>

                                <button
                                  type="button"
                                  onClick={() => removeCustomInterestOption(option)}
                                  className="shrink-0 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-100"
                                >
                                  Remove
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-4 rounded-2xl border border-amber-800/40 bg-slate-950/70 p-3">
                          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-amber-100/70">
                            Add Custom Interest Option
                          </label>

                          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                            <input
                              value={customInterestOptionInput}
                              onChange={(event) => setCustomInterestOptionInput(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  addCustomInterestOption();
                                }
                              }}
                              placeholder="Example: Paddles, Canes, Straps, No Marks"
                              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-amber-300"
                            />

                            <button
                              type="button"
                              onClick={addCustomInterestOption}
                              className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950"
                            >
                              Add
                            </button>
                          </div>

                          <p className="mt-2 text-xs leading-5 text-slate-500">
                            Custom options are added to this browser and can be checked on/off like the built-in options.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-3">
                    <label className="flex items-center gap-3 text-sm font-semibold text-slate-100">
                      <input
                        type="checkbox"
                        checked={showSocialHandleField}
                        onChange={(e) => setShowSocialHandleField(e.target.checked)}
                        className="h-4 w-4"
                      />
                      Show social handle field
                    </label>

                    {showSocialHandleField ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        <label className="flex items-center gap-3 text-sm text-slate-100">
                          <input type="checkbox" checked={allowFetLife} onChange={(e) => setAllowFetLife(e.target.checked)} className="h-4 w-4" />
                          FetLife
                        </label>
                        <label className="flex items-center gap-3 text-sm text-slate-100">
                          <input type="checkbox" checked={allowWhappz} onChange={(e) => setAllowWhappz(e.target.checked)} className="h-4 w-4" />
                          Whappz
                        </label>
                        <label className="flex items-center gap-3 text-sm text-slate-100">
                          <input type="checkbox" checked={allowTwitter} onChange={(e) => setAllowTwitter(e.target.checked)} className="h-4 w-4" />
                          Twitter
                        </label>
                        <label className="flex items-center gap-3 text-sm text-slate-100">
                          <input type="checkbox" checked={allowBluesky} onChange={(e) => setAllowBluesky(e.target.checked)} className="h-4 w-4" />
                          Bluesky
                        </label>
                        <label className="flex items-center gap-3 text-sm text-slate-100">
                          <input type="checkbox" checked={allowTelegram} onChange={(e) => setAllowTelegram(e.target.checked)} className="h-4 w-4" />
                          <SocialPlatformLabel platform="Telegram" />
                        </label>
                        <label className="flex items-center gap-3 text-sm text-slate-100">
                          <input type="checkbox" checked={allowOtherPlatform} onChange={(e) => setAllowOtherPlatform(e.target.checked)} className="h-4 w-4" />
                          <SocialPlatformLabel platform="Instagram / IG" />
                        </label>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={saveSettings}
                      disabled={settingsSaving}
                      className="rounded-2xl bg-sky-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60"
                    >
                      {settingsSaving ? "Saving..." : "Save settings"}
                    </button>
                  </div>
                </div>
              ) : activeSetupTab === "Hosts & DMs" ? (
                <div className="mt-5 space-y-5">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <h3 className="text-2xl font-semibold tracking-tight text-slate-100">
                      Hosts & DMs
                    </h3>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                      One form for Host, Co-Host, and DM.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Add Host, Co-Host, or DM support team entries from one form. Display order is Host, Co-Host, then DMs.
                    </p>

                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-semibold">Name</label>
                      <input
                        value={hostName}
                        onChange={(e) => setHostName(e.target.value)}
                        placeholder="Example: Cat, Joshua"
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                      />
                    </div>

                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-semibold">Role</label>
                      <div className="flex flex-wrap gap-2">
                        {["Host", "Co-Host", "DM"].map((role) => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => {
                          setHostRole(role);
                          setHostCustomRole("");
                        }}
                            className={`rounded-full px-4 py-2 text-sm font-semibold border ${
                              hostRole === role
                                ? "bg-sky-400 text-slate-950 border-sky-400"
                                : "bg-slate-950 text-slate-100 border-slate-700"
                            }`}
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-semibold">Custom Role</label>
                      <input
                        value={hostCustomRole}
                        onChange={(e) => {
                          setHostCustomRole(e.target.value);
                          if (e.target.value.trim()) setHostRole("");
                        }}
                        placeholder="Type custom role"
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                      />


                    </div>


                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-semibold">Function</label>
                      <div className="flex flex-wrap gap-2">
                        {["Monitor", "Safety", "Tastings", "Q/A"].map((role) => {
                          const active = hostFunctions.includes(role);

                          return (
                            <button
                              key={role}
                              type="button"
                              onClick={() =>
                                setHostFunctions((prev) =>
                                  prev.includes(role)
                                    ? prev.filter((r) => r !== role)
                                    : [...prev, role]
                                )
                              }
                              className={`rounded-full px-4 py-2 text-sm font-semibold border ${
                                active
                                  ? "bg-sky-400 text-slate-950 border-sky-400"
                                  : "bg-slate-950 text-slate-100 border-slate-700"
                              }`}
                            >
                              {role}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-semibold">Custom Function</label>
                      <input
                        value={hostCustomFunction}
                        onChange={(e) => setHostCustomFunction(e.target.value)}
                        placeholder="Type custom function"
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                      />
                      <p className="mt-1 text-xs text-slate-500">Use commas for more than one custom function.</p>


                    </div>


                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-semibold">Kinks and Fetishes</label>
                      <p className="mb-2 text-sm leading-5 text-slate-400">
                        Start typing, then press Enter or tap a match.
                      </p>
                      <input
                        value={hostItemInput}
                        onChange={(e) => setHostItemInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addHostItemValue(hostItemInput);
                          }
                        }}
                        placeholder="Type what they are providing / responsible for"
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                      />
                    </div>

                    {hostItemInput.trim() && hostItemSuggestions.length > 0 ? (
                      <div className="mt-3 max-h-[220px] overflow-auto rounded-2xl border border-slate-800 bg-slate-950/70 pr-1">
                        <div className="divide-y divide-slate-800">
                          {hostItemSuggestions.map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => addHostItemValue(item)}
                              className="block w-full px-4 py-3 text-left transition hover:bg-slate-900"
                            >
                              <div className="font-medium text-slate-100">{item}</div>
                              <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                                {Object.entries(kinkCatalog).find(([, values]) =>
                                  values.includes(item)
                                )?.[0] || "Custom"}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {hostSelectedItems
                        .slice()
                        .sort((a, b) => a.localeCompare(b))
                        .map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => removeHostSelectedItem(item)}
                            className="rounded-full border border-sky-400/40 bg-sky-400/10 px-3 py-1.5 text-sm text-sky-100"
                          >
                            {item} ×
                          </button>
                        ))}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={createSupportTeamEntry}
                        disabled={hostSaving}
                        className="rounded-2xl bg-sky-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60"
                      >
                        {hostSaving ? "Saving..." : "Add Support Team Entry"}
                      </button>

                      <button
                        type="button"
                        onClick={resetHostForm}
                        className="rounded-2xl border border-slate-700 bg-slate-950 px-5 py-3 font-semibold"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {message ? (
                    <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                      {message}
                    </div>
                  ) : null}
                </div>
              ) : activeSetupTab === "Entries" ? (
                <div className="mt-5 space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-semibold tracking-tight text-slate-100">
                        Entries
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        Remove entries as needed or clear the board at the end of the night.
                      </p>

                      {lastRemovedEntry ? (
                        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                          <span>
                            Removed {lastRemovedEntry.name || "entry"}.
                          </span>
                          <button
                            type="button"
                            onClick={undoRemoveEntry}
                            className="rounded-full border border-amber-300/50 bg-amber-300/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-50"
                          >
                            Undo
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={clearBoard}
                      className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 font-semibold text-rose-100"
                    >
                      Clear board
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="flex h-full flex-col justify-between rounded-xl border border-slate-800 bg-slate-950 p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Total</div>
                      <div className="mt-2 text-3xl font-bold">{participantEntries.length}</div>
                    </div>

                    <div className="flex h-full flex-col justify-between rounded-xl border border-slate-800 bg-slate-950 p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Top</div>
                      <div className="mt-2 text-3xl font-bold text-rose-300">{topEntries.length}</div>
                    </div>

                    <div className="flex h-full flex-col justify-between rounded-xl border border-slate-800 bg-slate-950 p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Bottom</div>
                      <div className="mt-2 text-3xl font-bold text-emerald-300">{bottomEntries.length}</div>
                    </div>

                    <div className="flex h-full flex-col justify-between rounded-xl border border-slate-800 bg-slate-950 p-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Switch</div>
                      <div className="mt-2 text-3xl font-bold text-sky-300">{switchEntries.length}</div>
                    </div>
                  </div>

                  <input
                    value={setupSearch}
                    onChange={(e) => setSetupSearch(e.target.value)}
                    placeholder="Search by name, identity, seeking, kink, or position"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                  />

                  <div className="max-h-[720px] overflow-auto pr-1 grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {loading ? (
                      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-slate-400">
                        Loading entries...
                      </div>
                    ) : filteredSetupEntries.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-700 p-5 text-slate-400">
                        No entries match that search.
                      </div>
                    ) : (
                      <>
                        {(() => {
                          const query = setupSearch.trim().toLowerCase();
                          const matchesSearch = (entry) => {
                            if (!query) return true;
                            const mergedItems = [...(entry.items || []), ...(entry.custom_items || [])];
                            const haystack = [
                              entry.name,
                              entry.position,
                              entry.social_handle,
                              entry.social_platform,
                              entry.who_am_i_text,
                              entry.seeking_text,
                              entry.dm_category,
                              ...mergedItems,
                            ]
                              .filter(Boolean)
                              .join(" ")
                              .toLowerCase();
                            return haystack.includes(query);
                          };

                          const groupedColumns = [
                            {
                              key: "hostdm",
                              title: "Host / DM",
                              entries: [...hostEntries, ...dmEntries].filter(matchesSearch),
                              cardClass: "border-slate-700 bg-black/40",
                              chipClass: "border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300",
                            },
                            {
                              key: "top",
                              title: "Top",
                              entries: filteredSetupEntries.filter(
                                (entry) => (entry.position || "").toLowerCase() === "top"
                              ),
                              cardClass: "border-rose-500/35 bg-rose-950/20",
                              chipClass: "border-rose-500/25 bg-rose-500/10 px-2 py-1 text-xs text-rose-100",
                            },
                            {
                              key: "bottom",
                              title: "Bottom",
                              entries: filteredSetupEntries.filter(
                                (entry) => (entry.position || "").toLowerCase() === "bottom"
                              ),
                              cardClass: "border-emerald-500/35 bg-emerald-950/20",
                              chipClass: "border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100",
                            },
                            {
                              key: "switch",
                              title: "Switch",
                              entries: filteredSetupEntries.filter(
                                (entry) => (entry.position || "").toLowerCase() === "switch"
                              ),
                              cardClass: "border-sky-500/35 bg-sky-950/20",
                              chipClass: "border-sky-500/25 bg-sky-500/10 px-2 py-1 text-xs text-sky-100",
                            },
                          ];

                          return groupedColumns.map((column) => (
                            <div key={column.key} className="space-y-3">
                              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                {column.title}
                              </div>

                              {column.entries.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">
                                  No {column.title.toLowerCase()} entries.
                                </div>
                              ) : (
                                column.entries.map((entry) => {
                                  const mergedItems = [...(entry.items || []), ...(entry.custom_items || [])];

                                  return (
                                    <div
                                      key={`${column.key}-${entry.id}`}
                                      className={`rounded-xl border p-3 ${column.cardClass}`}
                                    >
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                          <div className="text-base font-semibold">
                                            {column.key === "hostdm"
                                              ? entry.entry_kind === "dm"
                                                ? entry.name
                                                : `${entry.name} | ${entry.position || "Host"}`
                                              : entry.name}
                                          </div>

                                          {entry.social_handle ? (
                                            <div className="mt-1 text-sm text-slate-400">
                                              {entry.social_platform
                                                ? `${entry.social_platform}: ${entry.social_handle}`
                                                : entry.social_handle}
                                            </div>
                                          ) : null}

                                          {(entry.who_am_i_text || entry.seeking_text) ? (
                                            <div className="mt-2 text-sm text-slate-300">
                                              {entry.who_am_i_text || ""}
                                              {entry.who_am_i_text && entry.seeking_text ? " → " : ""}
                                              {entry.seeking_text || ""}
                                            </div>
                                          ) : null}

                                          {entry.dm_category ? (
                                            <div className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                              {entry.dm_category}
                                            </div>
                                          ) : null}
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => removeEntry(entry.id)}
                                          className="rounded-lg bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20"
                                        >
                                          Remove
                                        </button>
                                      </div>

                                      {mergedItems.length > 0 ? (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {mergedItems.map((item) => (
                                            <span key={item} className={`rounded-full border ${column.chipClass}`}>
                                              {item}
                                            </span>
                                          ))}
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          ));
                        })()}
                      </>
                    )}
                  </div>
                </div>
              ) : activeSetupTab === "Raffle" ? (
                <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr),420px]">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <h3 className="text-2xl font-semibold tracking-tight text-slate-100">
                      Raffle Ticket Display
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Pull the raffle ticket by hand, type the number here, and show it live on the display screen.
                    </p>

                    <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Display mode control
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <span className={
                          "rounded-full border px-4 py-2 text-sm font-bold uppercase tracking-[0.14em] " +
                          (isRaffleDisplayActive
                            ? "border-emerald-300/60 bg-emerald-300/20 text-emerald-100"
                            : "border-sky-300/50 bg-sky-300/15 text-sky-100")
                        }>
                          {isRaffleDisplayActive ? "Raffle Display Active" : "LiveBoard Active"}
                        </span>

                        <button
                          type="button"
                          onClick={() => updateBoardDisplayMode("liveboard")}
                          disabled={!isRaffleDisplayActive}
                          className="rounded-2xl border border-sky-400/40 bg-sky-400/10 px-4 py-3 text-sm font-semibold text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Show LiveBoard
                        </button>

                        <button
                          type="button"
                          onClick={() => updateBoardDisplayMode("raffle")}
                          disabled={isRaffleDisplayActive || !currentRaffleDraw}
                          className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Show Raffle Display
                        </button>
                      </div>

                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        Switching to LiveBoard hides the raffle screen without clearing the raffle numbers or history.
                      </p>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr),180px]">
                      <div>
                        <label className="mb-2 block text-sm font-semibold">Drawn ticket number</label>
                        <input
                          value={raffleTicketInput}
                          onChange={(e) => setRaffleTicketInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addRaffleDraw();
                            }
                          }}
                          placeholder="Example: 847"
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-2xl font-semibold outline-none placeholder:text-slate-600 focus:border-sky-400"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={addRaffleDraw}
                        disabled={raffleSaving}
                        className="self-end rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-4 text-sm font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {raffleSaving ? "Showing..." : "Show Number"}
                      </button>
                    </div>

                    <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300/80">
                        Current number on display
                      </div>

                      {currentRaffleDraw ? (
                        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                          <div className="text-7xl font-black tracking-tight text-white">
                            {currentRaffleDraw.ticket_number}
                          </div>
                          <span className={"rounded-full border px-4 py-2 text-sm font-bold uppercase tracking-[0.14em] " + getRaffleStatusClass(currentRaffleDraw.status)}>
                            {getRaffleStatusLabel(currentRaffleDraw.status)}
                          </span>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-400">
                          No raffle number is currently on display. Enter a number above to take over the display screen.
                        </p>
                      )}
                    </div>

                    <div className="mt-5 grid gap-2 sm:grid-cols-4">
                      <button
                        type="button"
                        onClick={() => updateCurrentRaffleStatus("winner")}
                        disabled={!currentRaffleDraw}
                        className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Winner
                      </button>

                      <button
                        type="button"
                        onClick={() => updateCurrentRaffleStatus("timed_out")}
                        disabled={!currentRaffleDraw}
                        className="rounded-2xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Timed Out
                      </button>

                      <button
                        type="button"
                        onClick={undoLastRaffleDraw}
                        disabled={!currentRaffleDraw}
                        className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Undo Last
                      </button>

                      <button
                        type="button"
                        onClick={clearRaffleDraws}
                        disabled={!raffleDraws.length}
                        className="rounded-2xl border border-slate-600 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Clear Raffle
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <h3 className="text-lg font-semibold text-white">Raffle History</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-400">
                      The newest number stays largest on the display. Older numbers move into the smaller history list.
                    </p>

                    <div className="mt-4 space-y-2">
                      {raffleDraws.length ? (
                        raffleDraws.slice().reverse().map((draw, index) => (
                          <div
                            key={draw.id}
                            className={
                              "rounded-2xl border px-4 py-3 " +
                              (draw.status === "winner"
                                ? "border-emerald-500/60 bg-emerald-500/10"
                                : draw.status === "timed_out"
                                  ? "border-rose-500/50 bg-rose-500/10"
                                  : "border-slate-800 bg-slate-950")
                            }
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-lg font-black text-white">
                                  {draw.ticket_number}
                                </div>
                                <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                                  {"Draw " + (index + 1)}
                                </div>
                              </div>

                              <span className={"rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] " + getRaffleStatusClass(draw.status)}>
                                {getRaffleStatusLabel(draw.status)}
                              </span>
                            </div>

                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                              <button
                                type="button"
                                onClick={() => updateRaffleDrawStatus(draw, "winner")}
                                disabled={draw.status === "winner"}
                                className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                Winner
                              </button>

                              <button
                                type="button"
                                onClick={() => updateRaffleDrawStatus(draw, "timed_out")}
                                disabled={draw.status === "timed_out"}
                                className="rounded-xl border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                Timed Out
                              </button>

                              <button
                                type="button"
                                onClick={() => updateRaffleDrawStatus(draw, "drawn")}
                                disabled={draw.status === "drawn"}
                                className="rounded-xl border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-sky-100 disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                Drawn
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950 p-4 text-sm text-slate-400">
                          No raffle numbers have been entered yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm leading-6 text-slate-400">
                This tabbed setup screen is still in testing. The original setup page remains available at ?mode=setup.
              </div>
            </div>
          </div>
        ) : isSetupMode ? (
          <div className="grid gap-5 xl:grid-cols-[430px,minmax(0,1fr)]">
            <div className="space-y-5">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-2xl">
                <h2 className="text-2xl font-semibold tracking-tight">Backend</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Choose or create the event display preset, then adjust display text size here.
                </p>

                <div className="mt-4 grid gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold">Event display preset</label>
                    <select
                      value={activeEventDisplayId}
                      onChange={(e) => updateActiveEventDisplayPreset(e.target.value)}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-sky-400"
                    >
                      {eventDisplayOptions.map((eventDisplay) => (
                        <option key={eventDisplay.id} value={eventDisplay.id}>
                          {eventDisplay.eventName}
                        </option>
                      ))}
                    </select>

                    {activeEventDisplay ? (
                      <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm leading-6 text-slate-300">
                        <div className="font-semibold text-slate-100">{activeEventDisplay.eventName}</div>
                        <div className="mt-1 text-slate-400">{activeEventDisplay.eventDescription}</div>
                        <div className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                          Active display preset · {activeEventDisplay.images?.length || 0} image(s) · liveboard {activeEventDisplay.liveboardDurationSeconds ?? ((activeEventDisplay.liveboardDurationMinutes || 1) * 60)} second(s) · fade {activeEventDisplay.transitionSeconds}s
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => window.open(`${window.location.pathname}?mode=display`, "_blank")}
                        className="rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100"
                      >
                        Open Display Preview
                      </button>

                      <button
                        type="button"
                        onClick={editActiveEventDisplayPreset}
                        className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100"
                      >
                        Edit selected custom preset
                      </button>

                      <button
                        type="button"
                        onClick={deleteActiveEventDisplayPreset}
                        className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100"
                      >
                        Delete / hide selected preset
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <h3 className="text-lg font-semibold text-white">{editingEventDisplayId ? "Edit Event Display" : "Create Event Display"}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    {editingEventDisplayId ? "Update this saved event display preset." : "Save an event with its own description, images, image timing, and liveboard timing."}
                  </p>

                  <div className="mt-4 grid gap-4">
                    <div>
                      <label className="mb-2 block text-sm font-semibold">Event display name</label>
                      <input
                        value={displayEventName}
                        onChange={(e) => setDisplayEventName(e.target.value)}
                        placeholder="Example: CORROSION NYC"
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold">Event description</label>
                      <textarea
                        value={displayEventDescription}
                        onChange={(e) => setDisplayEventDescription(e.target.value)}
                        placeholder="A short line that appears with the event slides."
                        rows={3}
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-semibold">Image duration, in seconds</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={displayImageDurationSeconds}
                          onChange={(e) => setDisplayImageDurationSeconds(e.target.value)}
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-sky-400"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold">Liveboard duration, in seconds</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={displayLiveboardDurationSeconds}
                          onChange={(e) => setDisplayLiveboardDurationSeconds(e.target.value)}
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-sky-400"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold">Add images</label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleDisplayImageUpload}
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-sky-400 file:px-4 file:py-2 file:font-semibold file:text-slate-950"
                      />
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        Transition is automatically set to a 0.5 second fade. Images are compressed before saving.
                      </p>
                    </div>

                    {displayImages.length > 0 ? (
                      <div className="grid gap-2">
                        <div className="text-xs leading-5 text-slate-500">
                          Images play in this order before the liveboard appears. Rearrange slides by dragging images into the order you want, then click Save Changes when finished.
                        </div>
                        {displayImages.map((image, index) => (
                          <div
                            key={image.id}
                            draggable
                            onDragStart={() => setDraggedDisplayImageId(image.id)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => {
                              reorderDisplayImage(draggedDisplayImageId, image.id);
                              setDraggedDisplayImageId("");
                            }}
                            onDragEnd={() => setDraggedDisplayImageId("")}
                            className={`flex items-center justify-between gap-3 rounded-2xl border p-3 transition ${
                              draggedDisplayImageId === image.id
                                ? "border-sky-400 bg-sky-400/10"
                                : "border-slate-800 bg-black"
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                                <img
                                  src={image.imageUrl}
                                  alt={image.name || `Image ${index + 1}`}
                                  className="h-full w-full object-cover"
                                />
                              </div>

                              <div className="min-w-0">
                                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                                  Slide {index + 1}
                                </div>

                                <div className="truncate text-sm font-semibold text-slate-100">
                                  {image.name}
                                </div>

                                <div className="text-xs text-slate-500">
                                  {displayImageDurationSeconds || 1} second(s)
                                </div>

                                <div className="mt-1 text-xs text-slate-600">
                                  Drag to rearrange slides, then click Save Changes when finished.
                                </div>
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => removeDisplayImage(image.id)}
                                className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={saveEventDisplayPreset}
                        className="rounded-2xl bg-sky-400 px-5 py-3 font-semibold text-slate-950"
                      >
                        {editingEventDisplayId ? "Save Changes" : "Save Event Display"}
                      </button>

                      {editingEventDisplayId ? (
                        <button
                          type="button"
                          onClick={cancelEventDisplayEdit}
                          className="rounded-2xl border border-slate-700 bg-slate-950 px-5 py-3 font-semibold text-slate-100"
                        >
                          Cancel Edit
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="mb-3">
                    <div className="text-sm font-semibold text-slate-100">Display Text Size</div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Adjust board readability from across the room without changing the layout.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-400">
                        Board Entry Text Size
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateBoardEntryTextSize(-1)}
                          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-semibold text-white"
                        >
                          −
                        </button>
                        <div className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-center font-semibold text-white">
                          {boardEntryTextSize > 0 ? `+${boardEntryTextSize}` : boardEntryTextSize}
                        </div>
                        <button
                          type="button"
                          onClick={() => updateBoardEntryTextSize(1)}
                          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-semibold text-white"
                        >
                          +
                        </button>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        Controls participant names, handles, intentions, and open-to text. Range: -10 to +10.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-400">
                        Host / DM Text Size
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateStaffTextSize(-1)}
                          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-semibold text-white"
                        >
                          −
                        </button>
                        <div className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-center font-semibold text-white">
                          {staffTextSize > 0 ? `+${staffTextSize}` : staffTextSize}
                        </div>
                        <button
                          type="button"
                          onClick={() => updateStaffTextSize(1)}
                          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-semibold text-white"
                        >
                          +
                        </button>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        Controls Host and DM names/functions in the top support row. Range: -10 to +10.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="mb-3">
                    <div className="text-sm font-semibold text-slate-100">Entry Form Preset</div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Choose how much the kiosk asks guests before adding them to the board.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => updateEntryFormPreset("standard")}
                      className={`rounded-2xl border px-4 py-3 text-left ${
                        entryFormPreset === "standard"
                          ? "border-sky-400 bg-sky-400/10 text-sky-100"
                          : "border-slate-700 bg-slate-950 text-slate-200"
                      }`}
                    >
                      <div className="font-semibold">Standard</div>
                      <div className="mt-1 text-xs leading-5 text-slate-400">
                        Shows identity, seeking, orientation, intention, and open-to fields.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => updateEntryFormPreset("men_only")}
                      className={`rounded-2xl border px-4 py-3 text-left ${
                        entryFormPreset === "men_only"
                          ? "border-amber-400 bg-amber-400/10 text-amber-100"
                          : "border-slate-700 bg-slate-950 text-slate-200"
                      }`}
                    >
                      <div className="font-semibold">Men Only</div>
                      <div className="mt-1 text-xs leading-5 text-slate-400">
                        Hides identity, seeking, and orientation for faster men-only party entry.
                      </div>
                    </button>



                    <button
                      type="button"
                      onClick={() => updateEntryFormPreset("mens_spanking")}
                      className={`rounded-2xl border px-4 py-3 text-left ${
                        entryFormPreset === "mens_spanking"
                          ? "border-amber-400 bg-amber-400/10 text-amber-100"
                          : "border-slate-700 bg-slate-950 text-slate-200"
                      }`}
                    >
                      <div className="font-semibold">Men’s Spanking</div>
                      <div className="mt-1 text-xs leading-5 text-slate-400">
                        Hides identity, seeking, and orientation for faster men-only party entry.
                      </div>
                    </button>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="mb-4">
                    <div className="text-sm font-semibold text-slate-100">Entry Button Options</div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Choose which Sexual Preference and Interest buttons appear on the kiosk entry form.
                    </p>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-2xl border border-red-900/40 bg-red-950/10 p-4">
                      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-red-100/70">
                        Sexual Preference Buttons
                      </div>
                      <div className="grid gap-2">
                        {allSexualPreferenceOptions.map((option) => (
                          <label key={option} className="flex items-center gap-3 text-sm text-slate-100">
                            <input
                              type="checkbox"
                              checked={visibleSexualPreferenceOptions.includes(option)}
                              onChange={() => toggleVisibleSexualPreferenceOption(option)}
                              className="h-4 w-4"
                            />
                            {option}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-amber-800/40 bg-amber-950/10 p-4">
                      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-amber-100/70">
                        Interest Buttons
                      </div>
                      <div className="grid gap-2">
                        {allInterestOptions.map((option) => {
                          const isCustom = customInterestOptions.includes(option);

                          return (
                            <div key={option} className="flex items-center justify-between gap-3">
                              <label className="flex min-w-0 items-center gap-3 text-sm text-slate-100">
                                <input
                                  type="checkbox"
                                  checked={visibleInterestOptions.includes(option)}
                                  onChange={() => toggleVisibleInterestOption(option)}
                                  className="h-4 w-4"
                                />
                                <span className="truncate">{option}</span>
                              </label>

                              {isCustom ? (
                                <button
                                  type="button"
                                  onClick={() => removeCustomInterestOption(option)}
                                  className="shrink-0 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-100"
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-4 rounded-2xl border border-amber-800/40 bg-slate-950/70 p-3">
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-amber-100/70">
                          Add Custom Interest Option
                        </label>
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                          <input
                            value={customInterestOptionInput}
                            onChange={(event) => setCustomInterestOptionInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addCustomInterestOption();
                              }
                            }}
                            placeholder="Example: Paddles, Canes, Straps, No Marks"
                            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-amber-300"
                          />
                          <button
                            type="button"
                            onClick={addCustomInterestOption}
                            className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950"
                          >
                            Add
                          </button>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          Custom options are added to this browser and can be checked on/off like the built-in options.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                  <label className="flex items-center gap-3 text-sm font-semibold text-slate-100">
                    <input
                      type="checkbox"
                      checked={showSocialHandleField}
                      onChange={(e) => setShowSocialHandleField(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Show social handle field
                  </label>

                  {showSocialHandleField ? (
                    <div className="grid gap-2">
                      <label className="flex items-center gap-3 text-sm text-slate-100">
                        <input type="checkbox" checked={allowFetLife} onChange={(e) => setAllowFetLife(e.target.checked)} className="h-4 w-4" />
                        FetLife
                      </label>
                      <label className="flex items-center gap-3 text-sm text-slate-100">
                        <input type="checkbox" checked={allowWhappz} onChange={(e) => setAllowWhappz(e.target.checked)} className="h-4 w-4" />
                        Whappz
                      </label>
                      <label className="flex items-center gap-3 text-sm text-slate-100">
                        <input type="checkbox" checked={allowTwitter} onChange={(e) => setAllowTwitter(e.target.checked)} className="h-4 w-4" />
                        Twitter
                      </label>
                      <label className="flex items-center gap-3 text-sm text-slate-100">
                        <input type="checkbox" checked={allowBluesky} onChange={(e) => setAllowBluesky(e.target.checked)} className="h-4 w-4" />
                        Bluesky
                      </label>
                      <label className="flex items-center gap-3 text-sm text-slate-100">
                        <input type="checkbox" checked={allowTelegram} onChange={(e) => setAllowTelegram(e.target.checked)} className="h-4 w-4" />
                        <SocialPlatformLabel platform="Telegram" />
                      </label>
                      <label className="flex items-center gap-3 text-sm text-slate-100">
                        <input type="checkbox" checked={allowOtherPlatform} onChange={(e) => setAllowOtherPlatform(e.target.checked)} className="h-4 w-4" />
                        <SocialPlatformLabel platform="Instagram / IG" />
                      </label>
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    onClick={saveSettings}
                    disabled={settingsSaving}
                    className="rounded-2xl bg-sky-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60"
                  >
                    {settingsSaving ? "Saving..." : "Save settings"}
                  </button>
                </div>
              </div>

              <div className="supportTeamSetupGrid grid gap-4 xl:grid-cols-1">
                <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-2xl">
                  <h2 className="text-2xl font-semibold tracking-tight">Support Team</h2>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                    One form for Host, Co-Host, and DM.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Add Host, Co-Host, or DM support team entries from one form. Display order is Host, Co-Host, then DMs.
                  </p>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-semibold">Name</label>
                    <input
                      value={hostName}
                      onChange={(e) => setHostName(e.target.value)}
                      placeholder="Example: Cat, Joshua"
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                    />
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-semibold">Role</label>
                    <div className="flex gap-2">
                      {["Host", "Co-Host", "DM"].map((role) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => {
                          setHostRole(role);
                          setHostCustomRole("");
                        }}
                          className={`rounded-full px-4 py-2 text-sm font-semibold border ${
                            hostRole === role
                              ? "bg-sky-400 text-slate-950 border-sky-400"
                              : "bg-slate-950 text-slate-100 border-slate-700"
                          }`}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-semibold">Custom Role</label>
                    <input
                      value={hostCustomRole}
                      onChange={(e) => {
                        setHostCustomRole(e.target.value);
                        if (e.target.value.trim()) setHostRole("");
                      }}
                      placeholder="Type custom role"
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                    />


                  </div>


                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-semibold">Function</label>
                    <div className="flex flex-wrap gap-2">
                      {["Monitor", "Safety", "Tastings", "Q/A"].map((role) => {
                        const active = hostFunctions.includes(role);
                        return (
                          <button
                            key={role}
                            type="button"
                            onClick={() =>
                              setHostFunctions((prev) =>
                                prev.includes(role)
                                  ? prev.filter((r) => r !== role)
                                  : [...prev, role]
                              )
                            }
                            className={`rounded-full px-4 py-2 text-sm font-semibold border ${
                              active
                                ? "bg-sky-400 text-slate-950 border-sky-400"
                                : "bg-slate-950 text-slate-100 border-slate-700"
                            }`}
                          >
                            {role}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-semibold">Custom Function</label>
                    <input
                      value={hostCustomFunction}
                      onChange={(e) => setHostCustomFunction(e.target.value)}
                      placeholder="Type custom function"
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                    />
                    <p className="mt-1 text-xs text-slate-500">Use commas for more than one custom function.</p>


                  </div>


                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-semibold">Kinks and Fetishes</label>
                    <p className="mb-2 text-sm leading-5 text-slate-400">
                      Start typing, then press Enter or tap a match.
                    </p>
                    <input
                      value={hostItemInput}
                      onChange={(e) => setHostItemInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addHostItemValue(hostItemInput);
                        }
                      }}
                      placeholder="Type what they are providing / responsible for"
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                    />
                  </div>

                  {hostItemInput.trim() && hostItemSuggestions.length > 0 && (
                    <div className="mt-3 max-h-[220px] overflow-auto rounded-2xl border border-slate-800 bg-slate-950/70 pr-1">
                      <div className="divide-y divide-slate-800">
                        {hostItemSuggestions.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => addHostItemValue(item)}
                            className="block w-full px-4 py-3 text-left transition hover:bg-slate-900"
                          >
                            <div className="font-medium text-slate-100">{item}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                              {Object.entries(kinkCatalog).find(([, values]) =>
                                values.includes(item)
                              )?.[0] || "Custom"}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {hostSelectedItems
                      .slice()
                      .sort((a, b) => a.localeCompare(b))
                      .map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => removeHostSelectedItem(item)}
                          className="rounded-full border border-sky-400/40 bg-sky-400/10 px-3 py-1.5 text-sm text-sky-100"
                        >
                          {item} ×
                        </button>
                      ))}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      onClick={createSupportTeamEntry}
                      disabled={hostSaving}
                      className="rounded-2xl bg-sky-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60"
                    >
                      {hostSaving ? "Saving..." : "Add Support Team Entry"}
                    </button>

                    <button
                      onClick={resetHostForm}
                      className="rounded-2xl border border-slate-700 bg-slate-950 px-5 py-3 font-semibold"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-2xl">
                  <h2 className="text-2xl font-semibold tracking-tight">DM / Facilitator</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Add Dungeon Monitor(s) or Facilitator(s), assign their function, then list what they are providing / responsible for.
                  </p>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-semibold">Name</label>
                    <input
                      value={dmName}
                      onChange={(e) => setDmName(e.target.value)}
                      placeholder="Example: Natalie, Cat, Dan"
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                    />
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-semibold">Custom Role</label>
                    <input
                      value={hostCustomRole}
                      onChange={(e) => {
                        setHostCustomRole(e.target.value);
                        if (e.target.value.trim()) setHostRole("");
                      }}
                      placeholder="Type custom role"
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                    />


                  </div>


                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-semibold">Function</label>
                    <div className="flex flex-wrap gap-2">
                      {["Monitor", "Safety", "Tastings", "Q/A"].map((role) => {
                        const active = dmRoles.includes(role);
                        return (
                          <button
                            key={role}
                            type="button"
                            onClick={() =>
                              setDmRoles((prev) =>
                                prev.includes(role)
                                  ? prev.filter((r) => r !== role)
                                  : [...prev, role]
                              )
                            }
                            className={`rounded-full px-4 py-2 text-sm font-semibold border ${
                              active
                                ? "bg-sky-400 text-slate-950 border-sky-400"
                                : "bg-slate-950 text-slate-100 border-slate-700"
                            }`}
                          >
                            {role}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-semibold">Custom Function</label>
                    <input
                      value={hostCustomFunction}
                      onChange={(e) => setHostCustomFunction(e.target.value)}
                      placeholder="Type custom function"
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                    />
                    <p className="mt-1 text-xs text-slate-500">Use commas for more than one custom function.</p>


                  </div>


                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-semibold">Kinks and Fetishes</label>
                    <p className="mb-2 text-sm leading-5 text-slate-400">
                      Start typing, then press Enter or tap a match.
                    </p>
                    <input
                      value={dmItemInput}
                      onChange={(e) => setDmItemInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addDmItemValue(dmItemInput);
                        }
                      }}
                      placeholder="Type what they are providing / responsible for"
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                    />
                  </div>

                  {dmItemInput.trim() && dmItemSuggestions.length > 0 && (
                    <div className="mt-3 max-h-[220px] overflow-auto rounded-2xl border border-slate-800 bg-slate-950/70 pr-1">
                      <div className="divide-y divide-slate-800">
                        {dmItemSuggestions.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => addDmItemValue(item)}
                            className="block w-full px-4 py-3 text-left transition hover:bg-slate-900"
                          >
                            <div className="font-medium text-slate-100">{item}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                              {Object.entries(kinkCatalog).find(([, values]) =>
                                values.includes(item)
                              )?.[0] || "Custom"}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {dmSelectedItems
                      .slice()
                      .sort((a, b) => a.localeCompare(b))
                      .map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => removeDmSelectedItem(item)}
                          className="rounded-full border border-sky-400/40 bg-sky-400/10 px-3 py-1.5 text-sm text-sky-100"
                        >
                          {item} ×
                        </button>
                      ))}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      onClick={createDmEntry}
                      disabled={dmSaving}
                      className="rounded-2xl bg-sky-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60"
                    >
                      {dmSaving ? "Saving..." : "Add DM / Facilitator"}
                    </button>

                    <button
                      onClick={resetDmForm}
                      className="rounded-2xl border border-slate-700 bg-slate-950 px-5 py-3 font-semibold"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>

              {message && (
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                  {message}
                </div>
              )}
            </div>

            <div className="space-y-5">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-2xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">Entries</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Remove entries as needed or clear the board at the end of the night.
                    </p>

                    {lastRemovedEntry ? (
                      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                        <span>
                          Removed {lastRemovedEntry.name || "entry"}.
                        </span>
                        <button
                          type="button"
                          onClick={undoRemoveEntry}
                          className="rounded-full border border-amber-300/50 bg-amber-300/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-50"
                        >
                          Undo
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <button
                    onClick={clearBoard}
                    className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 font-semibold text-rose-100"
                  >
                    Clear board
                  </button>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 flex flex-col justify-between h-full">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Total</div>
                    <div className="mt-2 text-3xl font-bold">{participantEntries.length}</div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 flex flex-col justify-between h-full">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Top</div>
                    <div className="mt-2 text-3xl font-bold text-rose-300">{topEntries.length}</div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 flex flex-col justify-between h-full">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Bottom</div>
                    <div className="mt-2 text-3xl font-bold text-emerald-300">
                      {bottomEntries.length}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 flex flex-col justify-between h-full">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Switch</div>
                    <div className="mt-2 text-3xl font-bold text-sky-300">
                      {switchEntries.length}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <input
                    value={setupSearch}
                    onChange={(e) => setSetupSearch(e.target.value)}
                    placeholder="Search by name, identity, seeking, kink, or position"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-sky-400"
                  />
                </div>

                <div className="mt-4 max-h-[720px] overflow-auto pr-1 grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {loading ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-slate-400">
                      Loading entries...
                    </div>
                  ) : filteredSetupEntries.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-700 p-5 text-slate-400">
                      No entries match that search.
                    </div>
                  ) : (
                    <>
                      {(() => {
                        const query = setupSearch.trim().toLowerCase();
                        const matchesSearch = (entry) => {
                          if (!query) return true;
                          const mergedItems = [...(entry.items || []), ...(entry.custom_items || [])];
                          const haystack = [
                            entry.name,
                            entry.position,
                            entry.social_handle,
                            entry.social_platform,
                            entry.who_am_i_text,
                            entry.seeking_text,
                            entry.dm_category,
                            ...mergedItems,
                          ]
                            .filter(Boolean)
                            .join(" ")
                            .toLowerCase();
                          return haystack.includes(query);
                        };

                        const groupedColumns = [
                          {
                            key: "hostdm",
                            title: "Host / DM",
                            entries: [...hostEntries, ...dmEntries].filter(matchesSearch),
                            cardClass: "border-slate-700 bg-black/40",
                            pillClass: "border-slate-600 text-slate-200",
                            chipClass: "border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300",
                            labelFor: (entry) => (entry.entry_kind === "host" ? "HOST" : "DM"),
                          },
                          {
                            key: "top",
                            title: "Top",
                            entries: filteredSetupEntries.filter(
                              (entry) => (entry.position || "").toLowerCase() === "top"
                            ),
                            cardClass: "border-rose-500/35 bg-rose-950/20",
                            pillClass: "border-rose-400/40 text-rose-200",
                            chipClass: "border-rose-500/25 bg-rose-500/10 px-2 py-1 text-xs text-rose-100",
                            labelFor: () => "TOP",
                          },
                          {
                            key: "bottom",
                            title: "Bottom",
                            entries: filteredSetupEntries.filter(
                              (entry) => (entry.position || "").toLowerCase() === "bottom"
                            ),
                            cardClass: "border-emerald-500/35 bg-emerald-950/20",
                            pillClass: "border-emerald-400/40 text-emerald-200",
                            chipClass: "border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100",
                            labelFor: () => "BOTTOM",
                          },
                          {
                            key: "switch",
                            title: "Switch",
                            entries: filteredSetupEntries.filter(
                              (entry) => (entry.position || "").toLowerCase() === "switch"
                            ),
                            cardClass: "border-sky-500/35 bg-sky-950/20",
                            pillClass: "border-sky-400/40 text-sky-200",
                            chipClass: "border-sky-500/25 bg-sky-500/10 px-2 py-1 text-xs text-sky-100",
                            labelFor: () => "SWITCH",
                          },
                        ];

                        return groupedColumns.map((column) => (
                          <div key={column.key} className="space-y-3">
                            {column.entries.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">
                                No {column.title.toLowerCase()} entries.
                              </div>
                            ) : (
                              column.entries.map((entry) => {
                                const mergedItems = [...(entry.items || []), ...(entry.custom_items || [])];
                                return (
                                  <div
                                    key={`${column.key}-${entry.id}`}
                                    className={`rounded-xl border p-3 ${column.cardClass}`}
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <div className="text-base font-semibold">
                                          {column.key === "hostdm"
                                            ? entry.entry_kind === "dm"
                                              ? entry.name
                                              : `${entry.name} | ${entry.position || "Host"}`
                                            : entry.name}
                                        </div>
                                        {entry.social_handle ? (
                                          <div className="mt-1 text-sm text-slate-400">
                                            {entry.social_platform
                                              ? `${entry.social_platform}: ${entry.social_handle}`
                                              : entry.social_handle}
                                          </div>
                                        ) : null}
                                        {(entry.who_am_i_text || entry.seeking_text) && (
                                          <div className="mt-2 text-sm text-slate-300">
                                            {entry.who_am_i_text || ""}
                                            {entry.who_am_i_text && entry.seeking_text ? " → " : ""}
                                            {entry.seeking_text || ""}
                                          </div>
                                        )}
                                        {entry.dm_category ? (
                                          <div className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                            {entry.dm_category}
                                          </div>
                                        ) : null}
                                      </div>

                                      <button
                                        onClick={() => removeEntry(entry.id)}
                                        className="rounded-lg bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20"
                                      >
                                        Remove
                                      </button>
                                    </div>

                                    {mergedItems.length > 0 ? (
                                      <div className="mt-2 flex flex-wrap gap-1.5">
                                        {mergedItems.map((item) => (
                                          <span key={item} className={`rounded-full border ${column.chipClass}`}>
                                            {item}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        ));
                      })()}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : isEntryMode ? (
          entrySuccess ? (
            <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center">
              <div className="w-full rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center shadow-2xl md:p-10">
                <img
                  src={DISPLAY_LOGO_SRC}
                  alt="Sanctuary Sessions logo"
                  className="mx-auto h-[260px] w-auto object-contain md:h-[360px]"
                />
                <h2 className="mt-6 text-3xl font-semibold tracking-tight text-slate-100">
                  Success
                </h2>
                <p className="mt-3 text-base leading-7 text-slate-300">
                  You've been added to the board.
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {isKioskEntryMode ? "This kiosk will reset in 10 seconds." : "You can close this page now, or view more events below."}
                </p>

                {!isKioskEntryMode ? (
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <a
                      href="https://kinkcollective.net/Calendar"
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-2xl bg-[#fff4c2] px-5 py-3 text-center text-sm font-bold text-slate-950 shadow-lg shadow-black/30"
                    >
                      View More Events
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        window.close();
                        setMessage("You can close this tab now.");
                      }}
                      className="rounded-2xl border border-slate-500/60 bg-slate-950 px-5 py-3 text-sm font-bold text-slate-100"
                    >
                      Close Page
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className={`mx-auto max-w-[1500px] ${isDiaperDebaucheryEntryForm ? "diaperGlowKiosk" : ""}`}>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-2xl md:p-6">
                <h2 className="text-2xl font-semibold tracking-tight">
                  {isDiaperDebaucheryEntryForm ? "KrINKles Connection Board" : isMenOnlyEntryForm ? appConfig.eventName : "Add Entry"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  {isDiaperDebaucheryEntryForm
                    ? "Add yourself to the glow board so people know how to connect with you tonight."
                    : "Add your name, choose the buttons that fit, and share what you are open to tonight."}
                </p>

                <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
                  <div>
                    <label className="mb-2 block text-sm font-semibold">{isDiaperDebaucheryEntryForm ? "Name / Scene Name" : "Display name"}</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder='Example: "Real Name or Scene Name"'
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-amber-400"
                    />
                  </div>

                  {allowParticipantPhotos ? (
                    <div className="xl:col-span-2">
                      <label className="mb-2 block text-sm font-semibold">
                        Profile photo <span className="font-normal text-slate-400">(optional)</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-700 bg-slate-950 p-4">
                        {participantPhotoPreview ? (
                          <img
                            src={participantPhotoPreview}
                            alt="Your square profile preview"
                            className="h-24 w-24 rounded-2xl border border-sky-400/40 object-cover"
                          />
                        ) : (
                          <div className="grid h-24 w-24 place-items-center rounded-2xl border border-dashed border-slate-600 text-center text-xs text-slate-500">
                            No photo
                          </div>
                        )}

                        <div className="min-w-[220px] flex-1">
                          {isKioskEntryMode ? (
                            <button
                              type="button"
                              onClick={startParticipantCamera}
                              className="rounded-xl bg-sky-400 px-4 py-3 text-sm font-bold text-slate-950"
                            >
                              {participantPhotoPreview ? "Retake photo" : "Take photo"}
                            </button>
                          ) : (
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleParticipantPhotoChange}
                              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-400 file:px-3 file:py-2 file:font-semibold file:text-slate-950"
                            />
                          )}
                          <p className="mt-2 text-xs leading-5 text-slate-500">
                            {isKioskEntryMode
                              ? "Camera only. The kiosk cannot browse its files or photo library, and the picture is never saved to its internal drive."
                              : "Take a photo or choose one from this phone. It is cropped to a small square for the board."}
                          </p>
                          {participantPhotoPreview ? (
                            <button
                              type="button"
                              onClick={removeParticipantPhoto}
                              className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100"
                            >
                              Remove photo
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {isKioskEntryMode && participantCameraOpen ? (
                        <div className="mt-4 rounded-2xl border border-sky-500/30 bg-black p-4">
                          <video
                            ref={participantCameraVideoRef}
                            autoPlay
                            muted
                            playsInline
                            className="mx-auto aspect-square w-full max-w-md rounded-2xl object-cover"
                          />
                          <div className="mt-4 flex flex-wrap justify-center gap-3">
                            <button
                              type="button"
                              onClick={captureParticipantPhoto}
                              className="rounded-xl bg-sky-400 px-5 py-3 font-bold text-slate-950"
                            >
                              Use this photo
                            </button>
                            <button
                              type="button"
                              onClick={stopParticipantCamera}
                              className="rounded-xl border border-slate-600 bg-slate-900 px-5 py-3 font-semibold text-slate-100"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {participantCropSource ? (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
                      <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="participant-crop-title"
                        className="w-full max-w-xl rounded-3xl border border-sky-500/30 bg-slate-950 p-5 shadow-2xl"
                      >
                        <h3 id="participant-crop-title" className="text-2xl font-bold text-white">
                          Frame your profile photo
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-slate-400">
                          Drag the picture under the square and zoom until the frame shows exactly what you want on the board.
                        </p>

                        <div
                          className="relative mx-auto mt-5 aspect-square w-full max-w-sm touch-none overflow-hidden rounded-3xl border-2 border-sky-400 bg-black cursor-grab active:cursor-grabbing"
                          onPointerDown={startParticipantCropDrag}
                          onPointerMove={moveParticipantCrop}
                          onPointerUp={stopParticipantCropDrag}
                          onPointerCancel={stopParticipantCropDrag}
                        >
                          <img
                            src={participantCropSource.url}
                            alt="Adjustable square crop preview"
                            draggable="false"
                            onLoad={(event) => setParticipantCropDimensions({
                              width: event.currentTarget.naturalWidth,
                              height: event.currentTarget.naturalHeight,
                            })}
                            className="pointer-events-none absolute max-w-none select-none"
                            style={participantCropPreviewStyle}
                          />
                        </div>

                        <div className="mt-5 grid gap-4">
                          <label className="text-sm font-semibold text-slate-200">
                            Zoom: {Number(participantCropZoom).toFixed(1)}×
                            <input
                              type="range"
                              min="1"
                              max="3"
                              step="0.1"
                              value={participantCropZoom}
                              onChange={(event) => setParticipantCropZoom(Number(event.target.value))}
                              className="mt-2 w-full accent-sky-400"
                            />
                          </label>
                          <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-sky-200/70">
                            Drag the photo to reposition it inside the square
                          </p>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={applyParticipantCrop}
                            className="rounded-2xl bg-sky-400 px-5 py-3 font-bold text-slate-950"
                          >
                            Use this framing
                          </button>
                          <button
                            type="button"
                            onClick={cancelParticipantCrop}
                            className="rounded-2xl border border-slate-600 bg-slate-900 px-5 py-3 font-semibold text-slate-100"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {showSocialHandleField ? (
                    <div>
                      <label className="mb-2 block text-sm font-semibold">
                        {usesMultipleSocialHandles ? "Social Handles (optional)" : "Social handle (optional)"}
                      </label>

                      {usesMultipleSocialHandles ? (
                        <div className="krinklesSocialSection rounded-2xl border border-fuchsia-500/30 bg-fuchsia-950/10 p-3">
                          <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
                            <div>
                              <div className="krinklesSocialLabel mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-fuchsia-100/70">
                                Platform
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {availableHandlePlatforms.map((platform) => (
                                  <button
                                    key={platform}
                                    type="button"
                                    onClick={() => setSocialHandleDraftPlatform(platform)}
                                    className={`rounded-2xl border px-3 py-1.5 text-xs font-semibold ${
                                      socialHandleDraftPlatform === platform
                                        ? "krinklesOptionActive border-fuchsia-300 bg-fuchsia-400/20 text-fuchsia-50"
                                        : "krinklesOptionIdle border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-100"
                                    }`}
                                  >
                                    <SocialPlatformLabel platform={platform} />
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <div className="krinklesSocialLabel mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-fuchsia-100/70">
                                Handle
                              </div>
                              <input
                                value={socialHandleDraftValue}
                                onChange={(e) => setSocialHandleDraftValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addSocialHandleItem();
                                  }
                                }}
                                placeholder={
                                  socialHandleDraftPlatform === "Bluesky"
                                    ? "@name.bsky.social"
                                    : socialHandleDraftPlatform === "Instagram / IG"
                                      ? "@name"
                                      : "@name"
                                }
                                className="w-full rounded-2xl border border-fuchsia-500/40 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-fuchsia-300"
                              />
                            </div>

                            <div className="flex items-end">
                              <button
                                type="button"
                                onClick={addSocialHandleItem}
                                className="w-full rounded-2xl border border-fuchsia-300 bg-fuchsia-400/20 px-4 py-3 text-sm font-bold text-fuchsia-50"
                              >
                                Add handle
                              </button>
                            </div>
                          </div>

                          {socialHandleItems.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {socialHandleItems.map((line) => (
                                <button
                                  key={line}
                                  type="button"
                                  onClick={() => removeSocialHandleItem(line)}
                                  className="rounded-full border border-fuchsia-400/40 bg-fuchsia-400/10 px-3 py-1.5 text-xs font-semibold text-fuchsia-100"
                                >
                                  {line} ×
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-xs leading-5 text-fuchsia-100/60">
                              Press Enter to add another handle.
                            </p>
                          )}
                        </div>
                      ) : (
                        <>
                          <input
                            value={socialHandle}
                            onChange={(e) => setSocialHandle(e.target.value)}
                            placeholder='Example: "Your handle name on Fetlife"'
                            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-amber-400"
                          />

                          {availableHandlePlatforms.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {availableHandlePlatforms.map((platform) => (
                                <button
                                  key={platform}
                                  type="button"
                                  onClick={() => setSocialPlatform(platform)}
                                  className={`rounded-2xl border px-3 py-1.5 text-xs font-semibold ${
                                    socialPlatform === platform
                                      ? "border-sky-400 bg-sky-400/10 text-sky-100"
                                      : "border-slate-700 bg-slate-950 text-slate-200"
                                  }`}
                                >
                                  <SocialPlatformLabel platform={platform} />
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </div>

                {!isDiaperDebaucheryEntryForm ? (
                <div className={`mt-5 grid gap-4 ${isMenOnlyEntryForm ? "xl:grid-cols-1" : "xl:grid-cols-3"}`}>
                  <div className={`rounded-2xl border p-4 ${
                    isMenOnlyEntryForm
                      ? "border-zinc-500/60 bg-zinc-950/70 shadow-[0_0_24px_rgba(113,113,122,0.14)]"
                      : "border-slate-700/70 bg-slate-950/60"
                  }`}>
                    <div className={`mb-3 border-b pb-2 ${
                      isMenOnlyEntryForm ? "border-zinc-700/70" : "border-slate-800"
                    }`}>
                      <label className={`block text-sm font-semibold ${
                        isMenOnlyEntryForm ? "text-zinc-100" : "text-slate-100"
                      }`}>Position</label>
                      <p className={`mt-1 text-xs leading-5 ${
                        isMenOnlyEntryForm ? "text-zinc-400" : "text-slate-500"
                      }`}>Choose how you want to be listed.</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {positionOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setPosition(option)}
                          className={`rounded-2xl border px-3 py-3 text-center text-sm font-semibold ${
                            position === option
                              ? isMenOnlyEntryForm
                                ? "border-zinc-200 bg-zinc-300/20 text-zinc-50 shadow-[0_0_18px_rgba(212,212,216,0.18)]"
                                : "border-sky-400 bg-sky-400/10 text-sky-100"
                              : isMenOnlyEntryForm
                                ? "border-zinc-700 bg-black/60 text-zinc-200"
                                : "border-slate-700 bg-slate-950 text-slate-200"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>

                  {isMensSpankingEntryForm && position ? (
                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      {(position === "Top" || position === "Switch") ? (
                        <div className="rounded-2xl border border-rose-900/60 bg-rose-950/20 p-4 shadow-[0_0_24px_rgba(225,29,72,0.12)]">
                          <div className="mb-3 border-b border-rose-900/40 pb-2">
                            <label className="block text-sm font-semibold text-rose-100">
                              As a top I like to use
                            </label>
                            <p className="mt-1 text-xs leading-5 text-rose-100/60">
                              Choose all that apply. These are conversation starters, not consent.
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                            {spankingImplementOptions.map((item) => {
                              const active = spankingTopImplements.includes(item);

                              return (
                                <button
                                  key={item}
                                  type="button"
                                  onClick={() => toggleSpankingTopImplement(item)}
                                  className={`rounded-2xl border px-3 py-3 text-center text-sm font-semibold ${
                                    active
                                      ? "border-rose-300 bg-rose-500/25 text-rose-50"
                                      : "border-rose-500/45 bg-rose-500/10 text-rose-100"
                                  }`}
                                >
                                  {item}
                                </button>
                              );
                            })}
                          </div>

                          <label className="mt-4 block text-sm font-bold text-rose-50">
                            Other / type your own
                          </label>
                          <textarea
                            value={spankingTopOther}
                            onChange={(e) => setSpankingTopOther(e.target.value)}
                            placeholder="Type any other implements you like to use"
                            rows={2}
                            className="mt-2 w-full rounded-2xl border border-rose-500/40 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-rose-300"
                          />
                        </div>
                      ) : null}

                      {(position === "Bottom" || position === "Switch") ? (
                        <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/20 p-4 shadow-[0_0_24px_rgba(16,185,129,0.12)]">
                          <div className="mb-3 border-b border-emerald-900/40 pb-2">
                            <label className="block text-sm font-semibold text-emerald-100">
                              As a bottom I like to receive
                            </label>
                            <p className="mt-1 text-xs leading-5 text-emerald-100/60">
                              Choose all that apply. These are conversation starters, not consent.
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                            {spankingImplementOptions.map((item) => {
                              const active = spankingBottomImplements.includes(item);

                              return (
                                <button
                                  key={item}
                                  type="button"
                                  onClick={() => toggleSpankingBottomImplement(item)}
                                  className={`rounded-2xl border px-3 py-3 text-center text-sm font-semibold ${
                                    active
                                      ? "border-emerald-300 bg-emerald-500/25 text-emerald-50"
                                      : "border-emerald-500/45 bg-emerald-500/10 text-emerald-100"
                                  }`}
                                >
                                  {item}
                                </button>
                              );
                            })}
                          </div>

                          <label className="mt-4 block text-sm font-bold text-emerald-50">
                            Other / type your own
                          </label>
                          <textarea
                            value={spankingBottomOther}
                            onChange={(e) => setSpankingBottomOther(e.target.value)}
                            placeholder="Type any other implements you like to receive"
                            rows={2}
                            className="mt-2 w-full rounded-2xl border border-emerald-500/40 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-emerald-300"
                          />
                        </div>
                      ) : null}

                      <div className="rounded-2xl border border-amber-700/50 bg-amber-950/10 p-4 xl:col-span-2">
                        <div className="mb-3 border-b border-amber-800/30 pb-2">
                          <label className="block text-sm font-semibold text-amber-100">
                            My limits
                          </label>
                          <p className="mt-1 text-xs leading-5 text-amber-100/60">
                            Choose any limits you want visible and add anything else people should know.
                          </p>
                        </div>

                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          {spankingLimitOptions.map((item) => {
                            const active = spankingLimitItems.includes(item);

                            return (
                              <button
                                key={item}
                                type="button"
                                onClick={() => toggleSpankingLimitItem(item)}
                                className={`rounded-2xl border px-3 py-3 text-center text-sm font-semibold ${
                                  active
                                    ? "border-amber-300 bg-amber-400/20 text-amber-50"
                                    : "border-amber-500/45 bg-amber-500/10 text-amber-100"
                                }`}
                              >
                                {item}
                              </button>
                            );
                          })}
                        </div>

                        <label className="mt-4 block text-sm font-bold text-amber-50">
                          Other / type your own
                        </label>
                        <textarea
                          value={spankingLimitsOther}
                          onChange={(e) => setSpankingLimitsOther(e.target.value)}
                          placeholder="Example: no wood, no leather, light warm-up first, avoid thighs, ask before canes"
                          rows={2}
                          className="mt-2 w-full rounded-2xl border border-amber-500/40 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-amber-300"
                        />
                      </div>

                      <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/70 p-4 xl:col-span-2">
                        <div className="mb-3 border-b border-zinc-700/70 pb-2">
                          <label className="block text-sm font-semibold text-zinc-100">
                            Experience Level
                          </label>
                          <p className="mt-1 text-xs leading-5 text-zinc-400">
                            Choose the level that feels most accurate tonight.
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                          {spankingExperienceOptions.map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => setSpankingExperienceLevel(item)}
                              className={`rounded-2xl border px-3 py-3 text-center text-sm font-semibold ${
                                spankingExperienceLevel === item
                                  ? "border-zinc-200 bg-zinc-300/20 text-zinc-50"
                                  : "border-zinc-700 bg-black/60 text-zinc-200"
                              }`}
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {!isMenOnlyEntryForm ? (
                    <>
                  <div className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-4">
                    <div className="mb-3 border-b border-slate-800 pb-2">
                      <label className="block text-sm font-semibold text-slate-100">I identify as</label>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Choose one, or use Other.</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {identityOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setIdentityChoice(option)}
                          className={`rounded-2xl border px-3 py-3 text-center text-sm font-semibold ${
                            identityChoice === option
                              ? "border-sky-400 bg-sky-400/10 text-sky-100"
                              : "border-slate-700 bg-slate-950 text-slate-200"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>

                    {identityChoice === "Other" ? (
                      <input
                        value={identityOther}
                        onChange={(e) => setIdentityOther(e.target.value)}
                        placeholder="Type identity"
                        className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-amber-400"
                      />
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-4">
                    <div className="mb-3 border-b border-slate-800 pb-2">
                      <label className="block text-sm font-semibold text-slate-100">Seeking</label>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Choose who you are seeking tonight.</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {seekingOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setSeekingChoice(option)}
                          className={`rounded-2xl border px-3 py-3 text-center text-sm font-semibold ${
                            seekingChoice === option
                              ? "border-sky-400 bg-sky-400/10 text-sky-100"
                              : "border-slate-700 bg-slate-950 text-slate-200"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>

                    {seekingChoice === "Other" ? (
                      <input
                        value={seekingOther}
                        onChange={(e) => setSeekingOther(e.target.value)}
                        placeholder="Type who you are seeking"
                        className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-amber-400"
                      />
                    ) : null}
                  </div>
                    </>
                  ) : null}
                </div>
                ) : null}

                <div className={`mt-4 grid gap-4 ${isMenOnlyEntryForm || isDiaperDebaucheryEntryForm ? "xl:grid-cols-1" : "xl:grid-cols-[1fr_0.85fr]"}`}>
                  {!isMenOnlyEntryForm && !isDiaperDebaucheryEntryForm ? (
                  <div className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-4">
                    <div className="mb-3 border-b border-slate-800 pb-2">
                      <label className="block text-sm font-semibold">
  <span className="text-slate-100">Orientation</span>
  <span className="mx-1 text-slate-500">|</span>
  <span className="font-normal text-slate-500">Optional</span>
</label>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Choose one, or use Other.</p>
                    </div>

                    <div className="grid grid-cols-5 gap-2">
                      {orientationOptions
                        .filter((option) => option !== "Other")
                        .map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setOrientationChoice(option)}
                            className={`rounded-2xl border px-3 py-3 text-center text-sm font-semibold ${
                              orientationChoice === option
                                ? "border-amber-400 bg-amber-400/10 text-amber-100"
                                : "border-slate-700 bg-slate-950 text-slate-200"
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                    </div>

                    <div className="mt-2 grid gap-2 md:grid-cols-[140px_1fr]">
                      <button
                        type="button"
                        onClick={() => setOrientationChoice("Other")}
                        className={`rounded-2xl border px-3 py-3 text-center text-sm font-semibold ${
                          orientationChoice === "Other"
                            ? "border-amber-400 bg-amber-400/10 text-amber-100"
                            : "border-slate-700 bg-slate-950 text-slate-200"
                        }`}
                      >
                        Other
                      </button>

                      {orientationChoice === "Other" ? (
                        <input
                          value={orientationOther}
                          onChange={(e) => setOrientationOther(e.target.value)}
                          placeholder="Type orientation / connection style"
                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-amber-400"
                        />
                      ) : (
                        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 px-4 py-3 text-sm text-slate-500">
                          Use Other if you want to type your own.
                        </div>
                      )}
                    </div>
                  </div>
                  ) : null}

                  <div className={`rounded-2xl border p-4 ${
                    isMenOnlyEntryForm
                      ? "border-red-900/60 bg-red-950/20 shadow-[0_0_28px_rgba(220,38,38,0.14)]"
                      : "border-slate-700/70 bg-slate-950/60"
                  }`}>
                    <div className={`mb-3 border-b pb-2 ${
                      isMenOnlyEntryForm ? "border-red-900/40" : "border-slate-800"
                    }`}>
                      <label className="block text-sm font-semibold">
  <span className={isMenOnlyEntryForm ? "text-red-100" : "text-slate-100"}>{isDiaperDebaucheryEntryForm ? "Vibe Tonight" : "Intention"}</span>
  <span className="mx-1 text-slate-500">|</span>
  <span className="font-normal text-slate-500">Optional</span>
</label>
                      <p className={`mt-1 text-xs leading-5 ${
                        isMenOnlyEntryForm ? "text-red-100/60" : "text-slate-500"
                      }`}>
                        {isDiaperDebaucheryEntryForm ? "Choose the vibe you want people to see on the board." : "Choose all that apply."}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                      {(isDiaperDebaucheryEntryForm
                        ? diaperDebaucheryVibeOptions
                        : isMensSpankingEntryForm
                          ? spankingIntentionOptions
                          : quickTagOptions
                      ).map((tag) => {
                        const active = quickTags.includes(tag);

                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleQuickTag(tag)}
                            className={`rounded-2xl border px-3 py-3 text-sm font-semibold ${
                              active
                                ? isMenOnlyEntryForm
                                  ? "border-red-300 bg-red-600/30 text-red-50 shadow-[0_0_18px_rgba(239,68,68,0.22)]"
                                  : "border-amber-400 bg-amber-400/10 text-amber-100"
                                : isMenOnlyEntryForm
                                  ? "border-red-950/80 bg-black/60 text-red-100"
                                  : "border-slate-700 bg-slate-950 text-slate-200"
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>


                {isDiaperDebaucheryEntryForm ? (
                  <div className="krinklesLookingForSection mt-4 rounded-2xl border border-fuchsia-500/40 bg-fuchsia-950/20 p-4">
                    <div className="krinklesLookingForHeader mb-3 border-b border-fuchsia-500/30 pb-2">
                      <label className="block text-sm font-semibold text-fuchsia-100">Looking For</label>
                      <p className="mt-1 text-xs leading-5 text-fuchsia-100/60">
                        Choose what kind of connection you are open to tonight. This is not consent.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                      {diaperDebaucheryLookingForOptions.map((item) => {
                        const active = lookingForItems.includes(item);

                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => toggleLookingForItem(item)}
                            className={`rounded-2xl border px-3 py-3 text-center text-sm font-semibold ${
                              active
                                ? "krinklesOptionActive border-fuchsia-300 bg-fuchsia-400/20 text-fuchsia-50"
                                : "krinklesOptionIdle border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-100"
                            }`}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>

                    {lookingForItems.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {lookingForItems.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => toggleLookingForItem(item)}
                            className="rounded-full border border-fuchsia-400/40 bg-fuchsia-400/10 px-3 py-1.5 text-xs font-semibold text-fuchsia-100"
                          >
                            {item} ×
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div className={`${showSexualPreferenceSection ? "" : "hidden"} rounded-2xl border border-red-900/50 bg-red-950/20 p-4`}>
                    <div className="mb-3 border-b border-red-900/30 pb-2">
                      <label className="block text-sm font-semibold text-red-100">Sexual Preferences</label>
                      <p className="mt-1 text-xs leading-5 text-red-100/60">
                        Choose any that apply. Selections are conversation starters, not consent.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                      {allSexualPreferenceOptions
                    .filter((option) => visibleSexualPreferenceOptions.includes(option))
                    .map((option) => {
                          const active = sexualPreferenceItems.includes(option);
                          const isOther = option === "Other";

                          return (
                            <button
                              key={option}
                              type="button"
                              onPointerDown={(e) => {
                                e.preventDefault();

                                if (isOther) {
                                  document.getElementById("sexual-preference-input")?.focus();
                                  toggleSexualPreferenceItem(option);
                                  return;
                                }

                                toggleSexualPreferenceItem(option);
                              }}
                              className={`relative z-10 touch-manipulation rounded-2xl border px-3 py-3 text-center text-sm font-semibold ${
                                active
                                  ? "border-red-300 bg-red-500/25 text-red-50"
                                  : isOther
                                    ? "border-red-400/40 bg-red-500/5 text-red-100/80"
                                    : "border-red-500/45 bg-red-500/10 text-red-100"
                              }`}
                            >
                              {option}
                            </button>
                          );
                        })}
                    </div>

                    {sexualPreferenceItems.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {sexualPreferenceItems.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => toggleSexualPreferenceItem(item)}
                            className="rounded-full border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-100"
                          >
                            {item} ×
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <label className="mt-4 block text-sm font-bold text-red-50">
                      Type anything else about sexual preferences or safer sex.
                    </label>
                    <textarea
                      id="sexual-preference-input"
                      value={sexualPreferenceInput}
                      onChange={(e) => setSexualPreferenceInput(e.target.value)}
                      placeholder="Examples: ask me first, condoms only, oral only, safer sex notes, specific limits"
                      rows={2}
                      className="mt-2 w-full rounded-2xl border border-red-500/40 bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 focus:border-red-300"
                    />
                  </div>

                  <div className={`${showInterestSection ? "" : "hidden"} rounded-2xl border p-4 ${
                    isMenOnlyEntryForm
                      ? "border-violet-800/60 bg-violet-950/20 shadow-[0_0_28px_rgba(124,58,237,0.14)]"
                      : "border-amber-700/50 bg-amber-950/10"
                  }`}>
                    <div className={`mb-3 border-b pb-2 ${
                      isMenOnlyEntryForm ? "border-violet-800/40" : "border-amber-800/30"
                    }`}>
                      <label className={`block text-sm font-semibold ${
                        isMenOnlyEntryForm ? "text-violet-100" : "text-amber-100"
                      }`}>{isDiaperDebaucheryEntryForm ? "Kinks | Fetishes | Responsibilities" : "Interests"}</label>
                      <p className={`mt-1 text-xs leading-5 ${
                        isMenOnlyEntryForm ? "text-violet-100/60" : "text-amber-100/60"
                      }`}>
                        {isDiaperDebaucheryEntryForm
                          ? "Choose any that apply, then type anything else you want people to know."
                          : "Choose any that apply. These are conversation starters, not consent."}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                        {allInterestOptions
                          .filter((option) => visibleInterestOptions.includes(option))
                          .map((option) => {
                            const active = interestItems.includes(option);
                            const isOther = option === "Other";

                            return (
                              <button
                                key={option}
                                type="button"
                                onPointerDown={(e) => {
                                  e.preventDefault();

                                  if (isOther) {
                                    document.getElementById("interest-input")?.focus();
                                    toggleInterestItem(option);
                                    return;
                                  }

                                  toggleInterestItem(option);
                                }}
                                className={`relative z-10 touch-manipulation rounded-2xl border px-3 py-3 text-center text-sm font-semibold ${
                                  active
                                    ? isMenOnlyEntryForm
                                      ? "border-violet-300 bg-violet-500/25 text-violet-50 shadow-[0_0_18px_rgba(139,92,246,0.22)]"
                                      : "border-amber-300 bg-amber-400/20 text-amber-50"
                                    : isOther
                                      ? isMenOnlyEntryForm
                                        ? "border-violet-400/40 bg-violet-500/5 text-violet-100/80"
                                        : "border-amber-400/40 bg-amber-400/5 text-amber-100/80"
                                      : isMenOnlyEntryForm
                                        ? "border-violet-950/80 bg-black/60 text-violet-100"
                                        : "border-slate-700 bg-slate-950 text-slate-200"
                                }`}
                              >
                                {option}
                              </button>
                            );
                          })}
                    </div>

                    {interestItems.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {interestItems.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => toggleInterestItem(item)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                              isMenOnlyEntryForm
                                ? "border-violet-400/40 bg-violet-500/10 text-violet-100"
                                : "border-amber-400/40 bg-amber-400/10 text-amber-100"
                            }`}
                          >
                            {item} ×
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <label className={`mt-4 block text-sm font-bold ${
                      isMenOnlyEntryForm ? "text-violet-50" : "text-amber-50"
                    }`}>
                      {isDiaperDebaucheryEntryForm ? "Type kinks, fetishes, responsibilities, or scene interests." : "Type anything else about your interests, kinks, or scene preferences."}
                    </label>
                    <textarea
                      id="interest-input"
                      value={interestInput}
                      onChange={(e) => setInterestInput(e.target.value)}
                      placeholder={isDiaperDebaucheryEntryForm ? "Examples: diaper play, impact, service, rope, roleplay, caregiver energy" : "Examples: rope, impact, watching, service, limits, specific interests"}
                      rows={2}
                      className={`mt-2 w-full rounded-2xl border bg-slate-950 px-4 py-3 outline-none placeholder:text-slate-500 ${
                        isMenOnlyEntryForm
                          ? "border-violet-500/40 focus:border-violet-300"
                          : "border-amber-500/40 focus:border-amber-300"
                      }`}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={createEntry}
                    disabled={saving}
                    className="rounded-2xl bg-amber-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60"
                  >
                    {saving ? "Saving..." : "Add to board"}
                  </button>

                  <button
                    onClick={resetEntryForm}
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-5 py-3 font-semibold"
                  >
                    Reset form
                  </button>
                </div>

                {message && (
                  <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                    {message}
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          <div
            className={`displayBoardSurface ${usesSingleConnectionBoard ? "diaperGlowDisplayBoard" : ""}`}
            style={{
              "--board-entry-detail-size": `${1.535 + clampTextSizeStep(boardEntryTextSize) * 0.045}rem`,
              "--board-entry-name-size": `${2.23 + clampTextSizeStep(boardEntryTextSize) * 0.07}rem`,
              "--participant-list-detail-size": `${1 + clampTextSizeStep(boardEntryTextSize) * 0.03}rem`,
              "--participant-list-name-size": `${1.95 + clampTextSizeStep(boardEntryTextSize) * 0.06}rem`,
              "--staff-detail-size": `${1.36 + clampTextSizeStep(staffTextSize) * 0.04}rem`,
              "--staff-name-size": `${1.88 + clampTextSizeStep(staffTextSize) * 0.06}rem`,
            }}
          >
            <DisplayRotationOverlay eventDisplay={activeEventDisplay} />

            {isRaffleDisplayActive && currentRaffleDraw ? (
          <div className={
            currentRaffleDraw.status === "winner"
              ? "fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-emerald-950 px-10 py-8 text-center text-white shadow-[inset_0_0_180px_rgba(16,185,129,0.5)]"
              : currentRaffleDraw.status === "timed_out"
                ? "fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-rose-950 px-10 py-8 text-center text-white shadow-[inset_0_0_180px_rgba(244,63,94,0.38)]"
                : "fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-950 px-10 py-8 text-center text-white"
          }>
            <div className={
              currentRaffleDraw.status === "winner"
                ? "text-5xl font-black uppercase tracking-[0.25em] text-emerald-200 drop-shadow-2xl"
                : currentRaffleDraw.status === "timed_out"
                  ? "text-4xl font-black uppercase tracking-[0.25em] text-rose-200 drop-shadow-2xl"
                  : "text-2xl font-bold uppercase tracking-[0.35em] text-amber-300"
            }>
              {currentRaffleDraw.status === "winner" ? "★ Winner ★" : currentRaffleDraw.status === "timed_out" ? "Timed Out" : "Raffle Draw"}
            </div>

            <div className={"mt-8 rounded-full border px-6 py-3 text-xl font-black uppercase tracking-[0.18em] " + getRaffleStatusClass(currentRaffleDraw.status)}>
              {getRaffleStatusLabel(currentRaffleDraw.status)}
            </div>

            {currentRaffleDraw.status === "winner" ? (
              <div className="mt-8 flex items-center justify-center gap-8 text-7xl font-black text-emerald-200 drop-shadow-2xl">
                <span>★</span>
                <span className="rounded-[4rem] border-8 border-emerald-300 bg-emerald-400/20 px-14 py-8 text-[16vw] leading-none tracking-tight text-white shadow-[0_0_90px_rgba(16,185,129,0.8)]">
                  {currentRaffleDraw.ticket_number}
                </span>
                <span>★</span>
              </div>
            ) : (
              <div className="mt-6 text-[20vw] font-black leading-none tracking-tight text-white drop-shadow-2xl">
                {currentRaffleDraw.ticket_number}
              </div>
            )}


                {previousRaffleDraws.length ? (
                  <div className="mt-10 w-full max-w-6xl">
                    <div className="mb-4 text-lg font-bold uppercase tracking-[0.25em] text-slate-400">
                      Previous Numbers
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {previousRaffleDraws.map((draw) => (
                        <div
                          key={draw.id}
                          className="rounded-3xl border border-slate-700 bg-slate-900/90 px-6 py-5"
                        >
                          <div className="text-5xl font-black text-white">
                            {draw.ticket_number}
                          </div>
                          <div className={"mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] " + getRaffleStatusClass(draw.status)}>
                            {getRaffleStatusLabel(draw.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="displayBoardHeader displayBoardHeaderWithLegend">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="displayBoardTitleBlock">
                  <h1 className="displayBoardInlineTitle">
                    <span className="displayBoardEventName">{appConfig.eventName}</span>
                    <span className="displayBoardTitleDivider">|</span>
                    <span className="displayBoardEventDescription">
                      <span className="displayBoardEventDescriptionText">{appConfig.venueName}</span>
                    </span>
                  </h1>
                </div>

                <div className="displayStaffRow displayStaffRowCombined">
                  <DisplaySection
                    title=""
                    entries={[...hostEntries, ...dmEntries].sort((a, b) => {
                      const getStaffRank = (entry) => {
                        const kind = entry.entry_kind || "";
                        const role = entry.position || entry.dm_category || "";

                        if (kind === "host" && role === "Host") return 0;
                        if (kind === "host" && role === "Co-Host") return 1;
                        if (kind === "host") return 2;
                        return 3;
                      };

                      return getStaffRank(a) - getStaffRank(b);
                    })}
                    theme={sectionThemes.Host || sectionThemes.DM || sectionThemes.Top}
                    maxRows={1}
                    maxCols={Math.max([...hostEntries, ...dmEntries].length, 1)}
                    isDM
                  />
                </div>
              </div>

              <aside
                className="displayIconLegend flex h-full w-[30rem] shrink-0 self-stretch flex-col justify-center px-2 py-4 text-white"
                aria-label="Board icon guide"
              >
                <div className="grid grid-cols-2 gap-x-4 gap-y-6 text-2xl font-bold leading-tight">
                  <div className="flex items-center gap-4"><span className="text-3xl">🔵</span><span>Likes to give</span></div>
                  <div className="flex items-center gap-4"><span className="text-3xl">🟢</span><span>Likes to receive</span></div>
                  <div className="flex items-center gap-4"><span className="text-3xl">⛔</span><span>Limits</span></div>
                  <div className="flex items-center gap-4"><span className="text-3xl">🟠</span><span>Experience</span></div>
                  <div className="flex items-center gap-4"><span className="text-3xl">👀</span><span>Interests</span></div>
                  <div className="flex items-center gap-4"><span className="whitespace-nowrap text-3xl">🍑🍆</span><span>Sexual preferences</span></div>
                </div>
              </aside>

              <div className="flex h-full w-[14rem] shrink-0 self-stretch flex-col items-stretch gap-2">
                  <div
                    className="flex min-h-0 flex-1 flex-col justify-center rounded-2xl border border-white/20 bg-black/30 px-4 py-3 text-center text-white shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-md"
                    aria-label={"Current Eastern time: " + displayEasternTime}
                  >
                    <div className="text-6xl font-black leading-none tracking-[0.04em]">
                      {displayEasternTime}
                    </div>
                  </div>

                  {eventCountdown ? (
                    <div className="flex min-h-0 flex-1 flex-col justify-center rounded-2xl border border-white/20 bg-black/30 px-4 py-3 text-center text-white shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-md">
                      <div className="text-sm font-bold uppercase tracking-[0.16em] text-slate-300">
                        Ends in
                      </div>
                      <div className="mt-2 text-4xl font-black leading-none tracking-[0.04em]">
                        {eventCountdown}
                      </div>
                    </div>
                  ) : null}
              </div>

              <div className="flex h-full w-[30rem] shrink-0 self-stretch items-center gap-5 rounded-2xl border border-white/20 bg-black/30 px-6 py-5 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-md">
                <p className="m-0 flex-1 text-right text-2xl font-bold leading-tight text-white">
                  Scan with your phone to add yourself to the Board
                </p>
                <img
                  src="/liveboard-entry-qr.png"
                  alt="QR code to join the LiveBoard"
                  className="h-44 w-44 shrink-0 rounded-2xl bg-white p-2"
                />
              </div>
            </div>

            {usesSingleConnectionBoard ? (
              <div className="displayRoleRow displayConnectionRow">
                <DisplaySection
                  title="Connection Board"
                  entries={[...topEntries, ...bottomEntries, ...switchEntries]}
                  theme={sectionThemes.Switch}
                  maxRows={8}
                  maxCols={participantDisplayColumns}
                  connectionBoard
                />
              </div>
            ) : participantDisplayLayout === "list" ? (
              <div className="displayConnectionRow relative z-[8] min-h-0 flex-1">
                <ParticipantListDisplay
                  entries={[...topEntries, ...bottomEntries, ...switchEntries]}
                  columns={participantDisplayColumns}
                />
              </div>
            ) : (
              <div className="displayRoleRow">
                <DisplaySection
                  title="Top"
                  entries={topEntries}
                  theme={sectionThemes.Top}
                  maxRows={displayLayout.top_max_rows}
                  maxCols={participantDisplayColumns}
                />

                <DisplaySection
                  title="Bottom"
                  entries={bottomEntries}
                  theme={sectionThemes.Bottom}
                  maxRows={displayLayout.bottom_max_rows}
                  maxCols={participantDisplayColumns}
                />

                <DisplaySection
                  title="Switch"
                  entries={switchEntries}
                  theme={sectionThemes.Switch}
                  maxRows={displayLayout.switch_max_rows}
                  maxCols={participantDisplayColumns}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
