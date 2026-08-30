import React from "react";

const FIELD_COLORS = {
  blue: "#0066ff",
  red: "#ff1f1f",
  yellow: "#ffd400",
  green: "#00b83f",
  orange: "#ff7300",
  purple: "#7b2cff",
  pink: "#ff2d8d",
  teal: "#00b8a9",
  black: "#050505",
  grey: "#808080",
};

const ROW_COLUMNS = {
  100: "minmax(0, 1fr)",
  "50-50": "repeat(2, minmax(0, 1fr))",
  "60-40": "minmax(0, 3fr) minmax(0, 2fr)",
  "40-60": "minmax(0, 2fr) minmax(0, 3fr)",
  thirds: "repeat(3, minmax(0, 1fr))",
};

const fieldKey = (field) => field.legacyKey || field.type || field.id;

const SOCIAL_PLATFORM_ICONS = {
  FetLife: "♥",
  Whappz: "W",
  Twitter: "𝕏",
  "X / Twitter": "𝕏",
  Bluesky: "🦋",
  "Instagram / IG": "▣",
  Instagram: "▣",
  Telegram: "➤",
};

function readMockPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not read that image."));
      image.onload = () => {
        const size = Math.min(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 320;
        canvas
          .getContext("2d")
          .drawImage(
            image,
            (image.naturalWidth - size) / 2,
            (image.naturalHeight - size) / 2,
            size,
            size,
            0,
            0,
            320,
            320,
          );
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function PreviewField({ field, preview, onChange }) {
  const key = fieldKey(field);
  const selected = preview?.selections?.[key] || [];
  const custom = preview?.customEntries?.[key] || [];
  const isPosition = key === "position";
  const isEditable = typeof onChange === "function";
  const single = isPosition || field.type === "select";
  const accent = FIELD_COLORS[field.color] || FIELD_COLORS.blue;
  const options =
    field.options || (isPosition ? ["Top", "Bottom", "Switch"] : []);
  const socialHandles = preview?.socialHandles || {};
  const activeSocialPlatform = options.includes(preview?.socialPlatform)
    ? preview.socialPlatform
    : options.find((platform) => socialHandles[platform]) || options[0] || "";
  const patchSelections = (next) =>
    onChange?.({ selections: { ...(preview.selections || {}), [key]: next } });
  const patchCustom = (value) =>
    onChange?.({
      customEntries: {
        ...(preview.customEntries || {}),
        [key]: value ? [value] : [],
      },
    });

  return (
    <div
      className="eventKioskMockField"
      style={{ "--mock-field-accent": accent }}
    >
      <div className="eventKioskMockFieldLabel">
        {key === "name"
          ? "Display name"
          : key === "photo"
            ? "Profile photo (optional)"
            : key === "social"
              ? "Social Handles (optional)"
              : field.label || "Entry field"}
        {field.required && key !== "name" ? " *" : ""}
      </div>
      {field.helperText && !["name", "photo", "social"].includes(key) ? (
        <div className="eventKioskMockHelper">{field.helperText}</div>
      ) : null}
      {key === "name" ? (
        isEditable ? (
          <input
            className="eventKioskMockInput"
            value={preview?.name || ""}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="Name / scene name"
          />
        ) : (
          <div className="eventKioskMockInput">{preview?.name || "Alex"}</div>
        )
      ) : null}
      {key === "social" ? (
        <div className="eventKioskMockSocialBuilder">
          <div className="eventKioskMockSocialPlatformColumn">
            <span className="eventKioskMockControlLabel">Platform</span>
            <div className="eventKioskMockSocialPlatforms">
              {options.map((platform) => {
                const Tag = isEditable ? "button" : "span";
                return (
                  <Tag
                    key={platform}
                    type={isEditable ? "button" : undefined}
                    className={
                      platform === activeSocialPlatform ? "isSelected" : ""
                    }
                    onClick={
                      isEditable
                        ? () => onChange({ socialPlatform: platform })
                        : undefined
                    }
                  >
                    <span aria-hidden="true">
                      {SOCIAL_PLATFORM_ICONS[platform] || "@"}
                    </span>{" "}
                    {platform}
                  </Tag>
                );
              })}
            </div>
          </div>
          <label className="eventKioskMockSocialHandleColumn">
            <span className="eventKioskMockControlLabel">Handle</span>
            {isEditable ? (
              <input
                value={
                  socialHandles[activeSocialPlatform] ||
                  preview?.socialHandle ||
                  ""
                }
                onChange={(event) =>
                  onChange({
                    socialHandles: {
                      ...socialHandles,
                      [activeSocialPlatform]: event.target.value,
                    },
                    socialHandle: event.target.value,
                  })
                }
                placeholder="@name"
              />
            ) : (
              <strong>
                {socialHandles[activeSocialPlatform] ||
                  preview?.socialHandle ||
                  "@name"}
              </strong>
            )}
          </label>
          <button
            type="button"
            className="eventKioskMockAddHandle"
            disabled={!isEditable}
          >
            Add handle
          </button>
          <div className="eventKioskMockSocialHint">
            Press Enter to add another handle.
          </div>
        </div>
      ) : null}
      {key === "photo" ? (
        <div className="eventKioskMockPhoto">
          {preview?.photoDataUrl ? (
            <img src={preview.photoDataUrl} alt="Example attendee" />
          ) : (
            <span aria-hidden="true">●</span>
          )}
          <span>{preview?.photoDataUrl ? "Photo selected" : "No photo"}</span>
          {isEditable ? (
            <>
              <label className="eventKioskMockPhotoButton">
                {preview?.photoDataUrl
                  ? "Replace photo/file"
                  : "Upload photo/file"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    onChange({ photoDataUrl: await readMockPhoto(file) });
                    event.target.value = "";
                  }}
                />
              </label>
              {preview?.photoDataUrl ? (
                <button
                  type="button"
                  onClick={() => onChange({ photoDataUrl: "" })}
                >
                  Remove
                </button>
              ) : null}
              <label className="eventKioskMockPhotoButton">
                Take photo
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    onChange({ photoDataUrl: await readMockPhoto(file) });
                    event.target.value = "";
                  }}
                />
              </label>
              <span className="eventKioskMockPhotoHelp">
                Add an optional profile photo.
              </span>
            </>
          ) : null}
        </div>
      ) : null}
      {["select", "multi-select", "checkbox"].includes(field.type) ? (
        <div
          className={`eventKioskMockChoices eventKioskMockAllChoices ${isPosition ? "eventKioskMockPositionChoices" : ""}`}
        >
          {options.map((option) => {
            const active = selected.includes(option);
            const Tag = isEditable ? "button" : "span";
            return (
              <Tag
                key={option}
                type={isEditable ? "button" : undefined}
                onClick={
                  isEditable
                    ? () =>
                        patchSelections(
                          single
                            ? active
                              ? []
                              : [option]
                            : active
                              ? selected.filter((item) => item !== option)
                              : [...selected, option],
                        )
                    : undefined
                }
                className={active ? "isSelected" : ""}
              >
                {isPosition && option === "Top"
                  ? "Top | Give"
                  : isPosition && option === "Bottom"
                    ? "Bottom | Receive"
                    : isPosition && option === "Switch"
                      ? "Switch | Both"
                      : option}
              </Tag>
            );
          })}
        </div>
      ) : null}
      {field.customEntry?.enabled ? (
        <label
          className={`eventKioskMockCustomInput ${custom.length ? "isFilled" : ""}`}
        >
          <span>{field.customEntry.label || "Other"}</span>
          {isEditable ? (
            field.customEntry.multiline ? (
              <textarea
                value={custom.join(", ")}
                onChange={(event) => patchCustom(event.target.value)}
                placeholder={
                  field.customEntry.placeholder || "Optional custom answer"
                }
              />
            ) : (
              <input
                value={custom.join(", ")}
                onChange={(event) => patchCustom(event.target.value)}
                placeholder={
                  field.customEntry.placeholder || "Optional custom answer"
                }
              />
            )
          ) : (
            <strong>
              {custom.length
                ? custom.join(", ")
                : field.customEntry.placeholder || "Optional custom answer"}
            </strong>
          )}
        </label>
      ) : null}
      {["text", "textarea"].includes(field.type) &&
      !field.customEntry?.enabled ? (
        isEditable ? (
          <input
            className="eventKioskMockInput"
            value={custom[0] || ""}
            onChange={(event) => patchCustom(event.target.value)}
            placeholder={field.helperText || "Example response"}
          />
        ) : (
          <div className="eventKioskMockInput">
            {custom[0] || "Example response"}
          </div>
        )
      ) : null}
    </div>
  );
}

export default function EventKioskPreview({
  eventConfig,
  compact = false,
  onPreviewChange,
}) {
  const preview = eventConfig?.kioskPreview || {};
  const rows = (eventConfig?.entryForm?.rows || [])
    .map((row) => ({
      ...row,
      fields: (row.fields || []).filter((field) => field.visible !== false),
    }))
    .filter((row) => row.fields.length);

  return (
    <div
      className={`eventKioskMockup ${compact ? "isCompact" : ""} ${onPreviewChange ? "isEditable" : ""}`}
    >
      <div className="eventKioskExampleWatermark" aria-hidden="true">
        EXAMPLE
      </div>
      <div className="eventKioskMockupHeader">
        <div>
          <div className="eventKioskMockupEvent">
            {eventConfig?.name || "Event name"}
          </div>
          <div className="eventKioskMockupTitle">
            {onPreviewChange
              ? "Connection Board Entry Kiosk View"
              : "Connection Board Entry Kiosk"}
          </div>
          {eventConfig?.shortLabel ? (
            <div className="eventKioskMockupSubtitle">
              {eventConfig.shortLabel}
            </div>
          ) : null}
        </div>
        <div className="eventKioskMockupBadge">EXAMPLE ENTRY</div>
      </div>
      <div className="eventKioskMockRows">
        {rows.map((row) => (
          <div
            key={row.id}
            className="eventKioskMockRow"
            style={{
              gridTemplateColumns:
                ROW_COLUMNS[row.layout] || ROW_COLUMNS["100"],
            }}
          >
            {row.fields.map((field) => (
              <PreviewField
                key={field.id}
                field={field}
                preview={preview}
                onChange={onPreviewChange}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="eventKioskMockSubmit">
        <button type="button" disabled>
          Example only — not submitted
        </button>
      </div>
    </div>
  );
}
