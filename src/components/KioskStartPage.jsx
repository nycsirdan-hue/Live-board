import React from "react";
import "./KioskStartPage.css";

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

function UpArrowIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 52V12" />
      <path d="M16 28 32 12l16 16" />
    </svg>
  );
}

function DownArrowIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 12v40" />
      <path d="M16 36l16 16 16-16" />
    </svg>
  );
}

function RotateIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M48 20a20 20 0 0 0-33 7" />
      <path d="M14 14v13h13" />
      <path d="M16 44a20 20 0 0 0 33-7" />
      <path d="M50 50V37H37" />
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

export default function KioskStartPage({ onStart }) {
  return (
    <main className="kioskStartPage">
      <section
        className="kioskPreviewArea kioskPreviewAreaButton"
        role="button"
        tabIndex={0}
        onClick={(event) => { event.stopPropagation(); onStart(); }}
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
              <h1>The Sanctuary Connection Board</h1>
              <p>A live connection board for scenes, play, and conversation.</p>
            </div>
          </header>

          <div className="previewSupportRow">
            <div className="supportCard hostCard">
              <div className="supportIcon crownIcon"><CrownIcon /></div>
              <div>
                <h3>See the Host &amp; Co-Host Here</h3>
                <p>Their roles and offerings</p>
              </div>
            </div>

            <div className="supportCard monitorCard">
              <div className="supportIcon shieldIcon"><ShieldIcon /></div>
              <div>
                <h3>See Dungeon Monitors Here</h3>
                <p>Their roles and offerings</p>
              </div>
            </div>
          </div>

          <div className="roleRow">
            <div className="roleBox topRole">
              <div className="roleIcon"><UpArrowIcon /></div>
              <div className="roleTextWrap">
                <h2>Top</h2>
                <div className="roleSubLabel">Give</div>
              </div>
            </div>

            <div className="roleBox bottomRole">
              <div className="roleIcon"><DownArrowIcon /></div>
              <div className="roleTextWrap">
                <h2>Bottom</h2>
                <div className="roleSubLabel">Receive</div>
              </div>
            </div>

            <div className="roleBox switchRole">
              <div className="roleIcon"><RotateIcon /></div>
              <div className="roleTextWrap">
                <h2>Switch</h2>
                <div className="roleSubLabel">Both Give &amp; Receive</div>
              </div>
            </div>
          </div>

          <div className="exampleEntryBlock">
            <div className="exampleEntryLabel">Example Entry</div>

            <div className="exampleEntryCard">
              <div className="entryNameLine">
                <strong>Your Name</strong>
                <span>| Real or Scene</span>
              </div>

              <div className="entryIdentityLine">
                <span>How you identify</span>
                <SmallArrowIcon />
                <span>What you’re seeking</span>
                <span className="orientationText">| Orientation</span>
              </div>

              <div className="entryIntention">
                Tonight’s intention
              </div>

              <div className="entryInterests">
                Your interests, kinks, fetishes, etc.
              </div>
            </div>
          </div>
        </div>

        <button className="kioskStartButton" type="button" onClick={onStart}>
          <span>START</span>
          <small>Add Yourself to the Board</small>
        </button>
      </section>
    </main>
  );
}
