import React from "react";

const FIELD_COLORS = {
  blue: "#0066ff", red: "#ff1f1f", yellow: "#ffd400", green: "#00b83f",
  orange: "#ff7300", purple: "#7b2cff", pink: "#ff2d8d", teal: "#00b8a9",
  black: "#050505", grey: "#808080",
};

const ROW_COLUMNS = {
  "100": "minmax(0, 1fr)",
  "50-50": "repeat(2, minmax(0, 1fr))",
  "60-40": "minmax(0, 3fr) minmax(0, 2fr)",
  "40-60": "minmax(0, 2fr) minmax(0, 3fr)",
  thirds: "repeat(3, minmax(0, 1fr))",
};

const fieldKey = (field) => field.legacyKey || field.type || field.id;
const selectionValues = (preview, field) => preview?.selections?.[fieldKey(field)] || [];
const customValues = (preview, field) => preview?.customEntries?.[fieldKey(field)] || [];

function PreviewField({ field, preview }) {
  const key = fieldKey(field);
  const selected = selectionValues(preview, field);
  const custom = customValues(preview, field);
  const isPosition = key === "position";
  const accent = FIELD_COLORS[field.color] || FIELD_COLORS.blue;

  return <div className="eventKioskMockField" style={{ "--mock-field-accent": accent }}>
    <div className="eventKioskMockFieldLabel">{field.label || "Entry field"}</div>
    {key === "name" ? <div className="eventKioskMockInput">{preview?.name || "Alex"}</div> : null}
    {key === "social" ? <div className="eventKioskMockInput">{preview?.socialHandle || "@alex"}</div> : null}
    {key === "photo" ? <div className="eventKioskMockPhoto"><span aria-hidden="true">●</span><span>Optional profile photo</span></div> : null}
    {isPosition ? <div className="eventKioskMockChoices eventKioskMockPositionChoices">{(field.options || ["Top", "Bottom", "Switch"]).map((option) => <span key={option} className={selected.includes(option) ? "isSelected" : ""}>{option}</span>)}</div> : null}
    {!isPosition && ["select", "multi-select", "checkbox"].includes(field.type) ? <div className="eventKioskMockChoices">{[...selected, ...custom].length ? [...selected, ...custom].map((value, index) => <span key={`${value}-${index}`} className="isSelected">{value}</span>) : <span className="eventKioskMockEmpty">Choose a mock selection</span>}</div> : null}
    {["text", "textarea"].includes(field.type) ? <div className="eventKioskMockInput">{custom[0] || "Example response"}</div> : null}
  </div>;
}

export default function EventKioskPreview({ eventConfig, compact = false }) {
  const preview = eventConfig?.kioskPreview || {};
  const rows = (eventConfig?.entryForm?.rows || []).map((row) => ({
    ...row,
    fields: (row.fields || []).filter((field) => field.visible !== false),
  })).filter((row) => row.fields.length);

  return <div className={`eventKioskMockup ${compact ? "isCompact" : ""}`}>
    <div className="eventKioskMockupHeader">
      <div>
        <div className="eventKioskMockupEvent">{eventConfig?.name || "Event name"}</div>
        <div className="eventKioskMockupTitle">Connection Board Entry</div>
        {eventConfig?.shortLabel ? <div className="eventKioskMockupSubtitle">{eventConfig.shortLabel}</div> : null}
      </div>
      <div className="eventKioskMockupBadge">MOCK ENTRY</div>
    </div>
    <div className="eventKioskMockRows">
      {rows.map((row) => <div key={row.id} className="eventKioskMockRow" style={{ gridTemplateColumns: ROW_COLUMNS[row.layout] || ROW_COLUMNS["100"] }}>
        {row.fields.map((field) => <PreviewField key={field.id} field={field} preview={preview} />)}
      </div>)}
    </div>
  </div>;
}
