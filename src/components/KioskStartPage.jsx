import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";
import { parseEventV2 } from "../eventSystemV2";
import "./KioskStartPage.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

function getPresetFromStorage() {
  try {
    return window.localStorage.getItem("entryFormPreset") || "standard";
  } catch {
    return "standard";
  }
}

function getEventNameFromStorage() {
  try {
    return window.localStorage.getItem("kioskEventName") || "";
  } catch {
    return "";
  }
}

function getEventSubtitleFromStorage() {
  try {
    return window.localStorage.getItem("kioskEventSubtitle") || "";
  } catch {
    return "";
  }
}

const kioskPresetConfigs = {
  mens_spanking: {
    theme: "sting",
    fallbackName: "STING",
    subtitle:
      "Add the details you want displayed on tonight’s Connection Board.",
    sections: [
      {
        label: "Position",
        tone: "position",
        items: ["TOP", "BOTTOM", "SWITCH"],
      },
      {
        label: "As a top I like to use",
        tone: "rose",
        items: ["Paddles", "Straps", "Belt", "Hands"],
      },
      {
        label: "As a bottom I like to receive",
        tone: "green",
        items: ["Paddles", "Straps", "Brushes", "Hands"],
      },
      {
        label: "Intention",
        tone: "blue",
        items: [
          "Open to Play",
          "Discuss Limits",
          "Open to Try",
          "Watching",
        ],
      },
    ],
    more: ["LIMITS", "EXPERIENCE", "INTERESTS", "SOCIAL"],
    profile: {
      eyebrow: "COME HERE OFTEN?",
      text:
        "Create a STING profile so you can save your Connection Card and use it again at future parties.",
      action: "SELECT CREATE NEW PROFILE",
      hint: "instead of Create New Entry",
    },
  },

  krinkles_social_play: {
    theme: "krinkles-soft",
    fallbackName: "KrINKles",
    subtitle:
      "Add your vibe, what you’re looking for, and how you would like to connect or play tonight.",
    sections: [
      {
        label: "Vibe Tonight",
        tone: "fuchsia",
        items: [
          "Little",
          "Middle",
          "Big",
          "Caregiver",
          "Shy",
          "Social",
          "Playful",
        ],
      },
      {
        label: "Looking For",
        tone: "cyan",
        items: [
          "Friends",
          "Chat",
          "Cuddles",
          "Movie Buddy",
          "Playtime",
          "Caregiver Connection",
        ],
      },
      {
        label: "Play & Activities",
        tone: "violet",
        items: [
          "Coloring",
          "Games",
          "Movies",
          "Story Time",
          "Stuffies",
          "Cuddling",
          "Diaper Play",
        ],
      },
    ],
    more: [
      "PROFILE PHOTO",
      "SOCIAL HANDLES",
      "ANYTHING ELSE",
    ],
  },

  diaper_debauchery_glow: {
    theme: "krinkles",
    fallbackName: "KrINKles",
    subtitle:
      "Add your vibe, what you’re looking for, and the details you want people to see tonight.",
    sections: [
      {
        label: "Vibe Tonight",
        tone: "fuchsia",
        items: [
          "Little",
          "Middle",
          "Big",
          "Caregiver",
          "Kinky",
          "Switchy",
        ],
      },
      {
        label: "Looking For",
        tone: "cyan",
        items: [
          "Friends",
          "Chat",
          "Cuddles",
          "Playtime",
          "Scene Partner",
          "Diaper Change",
        ],
      },
      {
        label: "Sexual Preferences",
        tone: "violet",
        items: [
          "No Sex",
          "Discuss Sex First",
          "Safe Only",
          "Buzzy Time",
          "Diaper Sexual",
        ],
      },
      {
        label: "Kinks | Fetishes | Responsibilities",
        tone: "gold",
        items: [
          "Diaper Play",
          "Caregiver / Little",
          "Impact",
          "Roleplay",
          "Service",
        ],
      },
    ],
    more: ["PROFILE PHOTO", "SOCIAL HANDLES", "MORE INTERESTS"],
  },

  men_only: {
    theme: "men",
    fallbackName: "Tonight’s Event",
    subtitle:
      "Add the details you want displayed on tonight’s Connection Board.",
    sections: [
      {
        label: "Position",
        tone: "position",
        items: ["TOP", "BOTTOM", "SWITCH"],
      },
      {
        label: "Intention",
        tone: "blue",
        items: [
          "Open to Play",
          "Watching",
          "Conversation",
          "Negotiation",
        ],
      },
      {
        label: "Sexual Preferences",
        tone: "rose",
        items: ["Share what you want visible"],
      },
      {
        label: "Interests & Kinks",
        tone: "violet",
        items: ["Add the interests you want people to see"],
      },
    ],
    more: ["SOCIAL", "LIMITS", "NOTES"],
  },

  standard: {
    theme: "standard",
    fallbackName: "Studio125",
    subtitle:
      "Add the details you want displayed on tonight’s Connection Board.",
    sections: [
      {
        label: "Who You Are",
        tone: "violet",
        items: ["Add the identity details you want visible"],
      },
      {
        label: "What You’re Seeking",
        tone: "cyan",
        items: ["Connection", "Conversation", "Play"],
      },
      {
        label: "Interests",
        tone: "blue",
        items: ["Share what you’re open to discussing"],
      },
      {
        label: "Boundaries & Notes",
        tone: "gold",
        items: ["Add anything important you want people to know"],
      },
    ],
    more: ["SOCIAL", "ORIENTATION", "MORE DETAILS"],
  },
};

export default function KioskStartPage({ onStart }) {
  const [entryFormPreset, setEntryFormPreset] =
    useState(getPresetFromStorage);

  const [eventName, setEventName] =
    useState(getEventNameFromStorage);
  const [eventSubtitle, setEventSubtitle] =
    useState(getEventSubtitleFromStorage);

  useEffect(() => {
    let cancelled = false;

    function savePreset(nextPreset) {
      if (!nextPreset) return;

      setEntryFormPreset(nextPreset);

      try {
        window.localStorage.setItem("entryFormPreset", nextPreset);
      } catch {
        // Ignore localStorage issues.
      }
    }

    function saveEventName(nextEventName) {
      if (!nextEventName) return;

      setEventName(nextEventName);

      try {
        window.localStorage.setItem(
          "kioskEventName",
          nextEventName
        );
      } catch {
        // Ignore localStorage issues.
      }
    }

    function saveEventSubtitle(nextSubtitle) {
      setEventSubtitle(nextSubtitle || "");
      try {
        window.localStorage.setItem("kioskEventSubtitle", nextSubtitle || "");
      } catch {
        // Ignore localStorage issues.
      }
    }

    async function resolveActiveEvent(settingsRow) {
      const activePresetId =
        settingsRow?.active_event_display_preset_id;

      if (activePresetId && supabase) {
        const { data: activePreset, error: presetError } =
          await supabase
            .from("event_display_presets")
            .select("event_name, event_description")
            .eq("id", activePresetId)
            .maybeSingle();

        if (!presetError && activePreset?.event_name) {
          return { name: activePreset.event_name, subtitle: parseEventV2(activePreset.event_description)?.shortLabel || "" };
        }
      }

      return { name: settingsRow?.event_name || "", subtitle: "" };
    }

    async function loadPreset() {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("board_settings")
        .select(
          "entry_form_preset, event_name, active_event_display_preset_id, updated_at"
        )
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled || error || !data) return;

      savePreset(data.entry_form_preset);

      const resolvedEvent = await resolveActiveEvent(data);

      if (!cancelled) {
        saveEventName(resolvedEvent.name);
        saveEventSubtitle(resolvedEvent.subtitle);
      }
    }

    loadPreset();

    const interval = window.setInterval(loadPreset, 1000);

    const channel = supabase
      ? supabase
          .channel("kiosk-start-entry-form-preset")
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "board_settings",
            },
            (payload) => {
              const nextSettings = payload?.new || {};

              savePreset(nextSettings.entry_form_preset);

              resolveActiveEvent(nextSettings).then(
                (resolvedEvent) => {
                  if (!cancelled) {
                    saveEventName(resolvedEvent.name);
                    saveEventSubtitle(resolvedEvent.subtitle);
                  }
                }
              );
            }
          )
          .subscribe()
      : null;

    return () => {
      cancelled = true;
      window.clearInterval(interval);

      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const config =
    kioskPresetConfigs[entryFormPreset] ||
    kioskPresetConfigs.standard;

  const displayEventName =
    eventName || config.fallbackName;

  const mobileEntryUrl =
    `${window.location.origin}/liveboard/mobile`;

  return (
    <main
      className={`presetKioskPage presetKioskTheme-${config.theme}`}
      onClick={onStart}
    >
      <div className="presetKioskGlow presetKioskGlowOne" />
      <div className="presetKioskGlow presetKioskGlowTwo" />
      <div className="presetKioskGlow presetKioskGlowThree" />

      <div className="presetKioskShell">
        <section className="presetKioskEntryPanel">
          <header className="presetKioskHeader">
            <div>
              <div className="presetKioskEventName">
                {displayEventName}
              </div>

              <h1>Connection Board</h1>

              <p>{eventSubtitle || config.subtitle}</p>
            </div>

            <div className="presetKioskPreviewBadge">
              ENTRY PREVIEW
            </div>
          </header>

          <div className="presetKioskFormPreview">
            <div className="presetPreviewIdentityRow">
              <div className="presetPreviewField">
                <div className="presetPreviewLabel">
                  Name / Scene Name
                </div>

                <div className="presetPreviewInput">
                  Your name as you want it shown
                </div>
              </div>

              <div className="presetPreviewField presetPreviewSocialField">
                <div className="presetPreviewLabel">
                  Social Handle
                </div>

                <div className="presetPreviewInput">
                  @yourhandle
                </div>
              </div>
            </div>

            <div className="presetPreviewSectionGrid">
              {config.sections.map((section, index) => (
                <div
                  key={`${section.label}-${index}`}
                  className={`presetPreviewSection presetPreviewTone-${section.tone}`}
                >
                  <div className="presetPreviewSectionTitle">
                    {section.label}
                  </div>

                  <div className="presetPreviewChips">
                    {section.items.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="presetPreviewMore">
              {config.more
                .filter(
                  (item) =>
                    !["PROFILE PHOTO", "SOCIAL HANDLES"].includes(item)
                )
                .map((item) => (
                  <span key={item}>{item}</span>
                ))}
            </div>
          </div>

          <button
            type="button"
            className="presetKioskStartButton"
            onClick={(event) => {
              event.stopPropagation();
              onStart();
            }}
          >
            <span>START YOUR ENTRY</span>
            <small>Use this kiosk</small>
          </button>
        </section>

        <aside className="presetKioskMobilePanel">
          <div
            className="presetKioskPhoneIcon"
            aria-hidden="true"
          >
            ↗
          </div>

          <div className="presetKioskMobileEyebrow">
            MOBILE ENTRY
          </div>

          <h2>Use your phone instead</h2>

          <div className="presetKioskMobileSubhead">
            &amp; upload a picture
          </div>

          <div className="presetKioskQrFrame">
            <QRCodeSVG
              value={mobileEntryUrl}
              size={280}
              level="M"
              bgColor="#ffffff"
              fgColor="#000000"
              className="presetKioskQrSvg"
            />
          </div>

          <div className="presetKioskScanText">
            SCAN HERE
          </div>

          <p className="presetKioskMobileExplanation">
            Complete your Connection Board entry on your
            phone and choose the picture you want to use.
          </p>

          {config.profile ? (
            <div className="presetKioskProfilePrompt">
              <div className="presetKioskProfileEyebrow">
                {config.profile.eyebrow}
              </div>

              <p>{config.profile.text}</p>

              <div className="presetKioskProfileAction">
                {config.profile.action}
              </div>

              <div className="presetKioskProfileHint">
                {config.profile.hint}
              </div>
            </div>
          ) : null}

          <div className="presetKioskMobileUrl">
            studio125nyc.com/liveboard/mobile
          </div>
        </aside>
      </div>
    </main>
  );
}
