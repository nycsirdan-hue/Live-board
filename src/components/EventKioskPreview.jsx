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
        {field.label || "Entry field"}
        {field.required ? " *" : ""}
      </div>
      {field.helperText ? (
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
        <div className="eventKioskMockSocialOptions">
          {options.map((platform) => {
            const handle =
              socialHandles[platform] ||
              (platform === options[0] ? preview?.socialHandle : "");
            return (
              <label
                key={platform}
                className={`eventKioskMockSocialOption ${handle ? "isSelected" : ""}`}
              >
                <span>{platform}</span>
                {isEditable ? (
                  <input
                    value={handle || ""}
                    onChange={(event) =>
                      onChange({
                        socialHandles: {
                          ...socialHandles,
                          [platform]: event.target.value,
                        },
                        ...(platform === options[0]
                          ? { socialHandle: event.target.value }
                          : {}),
                      })
                    }
                    placeholder="Optional handle"
                  />
                ) : (
                  <strong>{handle || "Optional"}</strong>
                )}
              </label>
            );
          })}
        </div>
      ) : null}
      {key === "photo" ? (
        <div className="eventKioskMockPhoto">
          {preview?.photoDataUrl ? (
            <img src={preview.photoDataUrl} alt="Example attendee" />
          ) : (
            <span aria-hidden="true">●</span>
          )}
          <span>
            {preview?.photoDataUrl
              ? "Photo selected"
              : "Optional profile photo"}
          </span>
          {isEditable ? (
            <>
              <label className="eventKioskMockPhotoButton">
                {preview?.photoDataUrl ? "Replace" : "Add photo"}
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
                {option}
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
          <div className="eventKioskMockupTitle">Connection Board Entry</div>
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
