import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import "./KioskStartPage.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

function CrownIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M10 48h44l4-30-15 12-11-18-11 18L6 18l4 30Z" />
      <path d="M14 54h36" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="32" cy="12" r="3" />
      <circle cx="58" cy="18" r="3" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 6 52 14v17c0 14-8.5 24-20 29C20.5 55 12 45 12 31V14L32 6Z" />
      <path d="M32 14v38" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 6l5.8 17.5L56 29.5 38.5 36 32 58l-6.5-22L8 29.5l18.2-6L32 6Z" />
      <path d="M50 8l2.5 7.5L60 18l-7.5 2.5L50 28l-2.5-7.5L40 18l7.5-2.5L50 8Z" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 55S10 42 10 24c0-8 5.5-14 13-14 4.5 0 7.5 2.4 9 5.2C33.5 12.4 36.5 10 41 10c7.5 0 13 6 13 14 0 18-22 31-22 31Z" />
    </svg>
  );
}

function SmallArrowIcon() {
  return (
    <svg className="smallArrowIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

function getPresetFromStorage() {
  try {
    return window.localStorage.getItem("entryFormPreset") || "standard";
  } catch {
    return "standard";
  }
}

export default function KioskStartPage({ onStart }) {
  const [entryFormPreset, setEntryFormPreset] = useState(getPresetFromStorage);
  const isDiaperMode = entryFormPreset === "diaper_debauchery_glow";
  const isMenMode = entryFormPreset === "men_only";

  useEffect(() => {
    let cancelled = false;

    async function loadPreset() {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("board_settings")
        .select("entry_form_preset, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cancelled && !error && data?.entry_form_preset) {
        setEntryFormPreset(data.entry_form_preset);

        try {
          window.localStorage.setItem("entryFormPreset", data.entry_form_preset);
        } catch {
          // Ignore localStorage issues.
        }
      }
    }

    loadPreset();

    const interval = window.setInterval(loadPreset, 5000);

    const channel = supabase
      ? supabase
          .channel("kiosk-start-entry-form-preset")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "board_settings" },
            (payload) => {
              const nextPreset = payload?.new?.entry_form_preset;
              if (nextPreset) {
                setEntryFormPreset(nextPreset);

                try {
                  window.localStorage.setItem("entryFormPreset", nextPreset);
                } catch {
                  // Ignore localStorage issues.
                }
              }
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

  const pageCopy = isDiaperMode
    ? {
        title: "KrINKles Connection Board",
        subtitle: "Come proud. Come playful. Come padded. Add your vibe for tonight.",
        hostTitle: "Hosts & Helpers",
        hostBody: "Find the people holding the room.",
        monitorTitle: "Safety & Support",
        monitorBody: "See who can help if you need anything.",
        cardOneTitle: "Tonight’s Vibe",
        cardOneBody: "Padded, playful, proud, social, shy, flirty, or fully feral.",
        cardTwoTitle: "Open To",
        cardTwoBody: "Connection, dancing, cuddles, play, conversation, or glow-up chaos.",
        cardThreeTitle: "Kinks & Notes",
        cardThreeBody: "Share what you want visible: diaper play, care energy, limits, interests, and scene details.",
        exampleLabel: "Example Glow Entry",
        nameLine: "Your Name / Scene Name",
        nameSubline: "Padded, proud, playful, social, or shy",
        seekingLeft: "My vibe tonight",
        seekingRight: "What I’m open to",
        orientation: "| Social handles optional",
        intention: "Open to dancing, cuddles, diaper talk, glow play, or just hanging out",
        interests: "Diaper play, ABDL, caregiver energy, roleplay, impact, service, pride energy",
        button: "JOIN THE BOARD",
        buttonSmall: "Add Yourself to Tonight’s Glow Board",
      }
    : isMenMode
      ? {
          title: "Corrosion Connection Board",
          subtitle: "Men’s BDSM & Sex Party. Add your position, intention, sexual interests, kinks, and notes for tonight.",
          hostTitle: "Hosts & Support",
          hostBody: "Find the people holding the room.",
          monitorTitle: "Safety & Consent",
          monitorBody: "See who can help if you need anything.",
          cardOneTitle: "Position",
          cardOneBody: "Top, bottom, switch, side, voyeur, service, or however you want to be read tonight.",
          cardTwoTitle: "Intention",
          cardTwoBody: "Share the energy you are bringing into the room.",
          cardThreeTitle: "Sex, Kinks & Notes",
          cardThreeBody: "List what you are open to discussing: BDSM, sex, limits, safer sex, interests, and boundaries.",
          exampleLabel: "Example Men’s Entry",
          nameLine: "Your Name / Scene Name",
          nameSubline: "Position, intention, and room energy",
          seekingLeft: "Position",
          seekingRight: "Sexual preferences",
          orientation: "| Kinks and notes visible",
          intention: "Open to BDSM, sex, impact, service, watching, conversation, or negotiation",
          interests: "Impact, rope, oral, service, safer sex notes, limits, scene interests, consent first",
          button: "JOIN THE BOARD",
          buttonSmall: "Add Yourself to Tonight’s Board",
        }
      : {
          title: "The Sanctuary Connection Board",
          subtitle: "A live connection board for scenes, play, and conversation.",
          hostTitle: "Host & Co-Host",
          hostBody: "Find the people holding the event.",
          monitorTitle: "Dungeon Monitors",
          monitorBody: "See who is available for safety and support.",
          cardOneTitle: "Who You Are",
          cardOneBody: "Add the name and identity details you want people to see.",
          cardTwoTitle: "What You’re Seeking",
          cardTwoBody: "Share what kind of connection, scene, or conversation you’re open to.",
          cardThreeTitle: "Interests & Boundaries",
          cardThreeBody: "List the kinks, interests, responsibilities, or limits you want visible.",
          exampleLabel: "Example Entry",
          nameLine: "Your Name",
          nameSubline: "Real or Scene",
          seekingLeft: "How you identify",
          seekingRight: "What you’re seeking",
          orientation: "| Orientation optional",
          intention: "Tonight’s intention",
          interests: "Your interests, kinks, fetishes, responsibilities, or boundaries",
          button: "START",
          buttonSmall: "Add Yourself to the Board",
        };

  return (
    <main className={`kioskStartPage ${isDiaperMode ? "kioskStartPageDiaper" : isMenMode ? "kioskStartPageMenOnly" : "kioskStartPageStandard"}`}>
      <section
        className="kioskPreviewArea kioskPreviewAreaButton"
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onStart();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onStart();
          }
        }}
      >
        <div className="connectionPreview">
          <header className="previewHeader">
            <div className="displayStyleHeader">
              <h1>{pageCopy.title}</h1>
              <p>{pageCopy.subtitle}</p>
            </div>
          </header>

          <div className="previewSupportRow">
            <div className="supportCard hostCard">
              <div className="supportIcon crownIcon">
                <CrownIcon />
              </div>
              <div>
                <h3>{pageCopy.hostTitle}</h3>
                <p>{pageCopy.hostBody}</p>
              </div>
            </div>

            <div className="supportCard monitorCard">
              <div className="supportIcon shieldIcon">
                <ShieldIcon />
              </div>
              <div>
                <h3>{pageCopy.monitorTitle}</h3>
                <p>{pageCopy.monitorBody}</p>
              </div>
            </div>
          </div>

          <div className="startInfoRow">
            <div className="startInfoBox startInfoBoxOne">
              <div className="roleIcon">
                <SparkleIcon />
              </div>
              <div className="roleTextWrap">
                <h2>{pageCopy.cardOneTitle}</h2>
                <div className="roleSubLabel">{pageCopy.cardOneBody}</div>
              </div>
            </div>

            <div className="startInfoBox startInfoBoxTwo">
              <div className="roleIcon">
                <HeartIcon />
              </div>
              <div className="roleTextWrap">
                <h2>{pageCopy.cardTwoTitle}</h2>
                <div className="roleSubLabel">{pageCopy.cardTwoBody}</div>
              </div>
            </div>

            <div className="startInfoBox startInfoBoxThree">
              <div className="roleIcon">
                <ShieldIcon />
              </div>
              <div className="roleTextWrap">
                <h2>{pageCopy.cardThreeTitle}</h2>
                <div className="roleSubLabel">{pageCopy.cardThreeBody}</div>
              </div>
            </div>
          </div>

          <div className="exampleEntryBlock">
            <div className="exampleEntryLabel">{pageCopy.exampleLabel}</div>

            <div className="exampleEntryCard">
              <div className="entryNameLine">
                <strong>{pageCopy.nameLine}</strong>
                <span>| {pageCopy.nameSubline}</span>
              </div>

              <div className="entryIdentityLine">
                <span>{pageCopy.seekingLeft}</span>
                <SmallArrowIcon />
                <span>{pageCopy.seekingRight}</span>
                <span className="orientationText">{pageCopy.orientation}</span>
              </div>

              <div className="entryIntention">{pageCopy.intention}</div>

              <div className="entryInterests">{pageCopy.interests}</div>
            </div>
          </div>
        </div>

        <button className="kioskStartButton" type="button" onClick={onStart}>
          <span>{pageCopy.button}</span>
        </button>
      </section>
    </main>
  );
}
