import React, { useEffect, useRef, useState } from "react";
import App from "./App";
import KioskStartPage from "./components/KioskStartPage";
import "./kiosk-success-return.css";
import { getLiveboardPathMode, isLiveboardKioskPath } from "./liveboardRoutes";

export default function KioskEntryShell() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode") || getLiveboardPathMode();
  const cleanKioskPath = isLiveboardKioskPath();
  const [showKioskStart, setShowKioskStart] = useState(true);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const returnTimerRef = useRef(null);

  /*
    Kiosk start page is only for iPad kiosk mode.
    Phone/mobile direct entry, display, and setup bypass the kiosk start page.
  */
  const isPhoneEntryMode =
    mode === "entry" &&
    !cleanKioskPath &&
    params.get("kiosk") !== "1";

  const bypassKioskStart =
    isPhoneEntryMode || mode === "display" || mode === "setup" || mode === "admin";

  const startEntry = () => {
    /*
      Clean Studio125 kiosk route already tells the app what it is.
      Legacy query-string URLs retain their old behavior.
    */
    if (!cleanKioskPath) {
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.set("mode", "entry");
      nextParams.set("kiosk", "1");
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}?${nextParams.toString()}`
      );
    }

    setShowSuccessOverlay(false);
    setShowKioskStart(false);
  };

  const returnToStart = () => {
    /*
      Keep /liveboard/kiosk clean after a successful entry.
      Legacy kiosk URLs still return using their query-string mode.
    */
    if (!cleanKioskPath) {
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.set("mode", "kiosk");
      nextParams.delete("kiosk");
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}?${nextParams.toString()}`
      );
    }

    setShowSuccessOverlay(false);
    setShowKioskStart(true);
  };

  useEffect(() => {
    if (bypassKioskStart || showKioskStart) return;

    const detectSuccess = () => {
      const pageText = document.body.innerText || "";

      const isSuccessScreen =
        pageText.includes("Success") &&
        (
          pageText.includes("You've been added to the board") ||
          pageText.includes("You’ve been added to the board") ||
          pageText.includes("added to the board")
        );

      if (isSuccessScreen && !returnTimerRef.current) {
        setShowSuccessOverlay(true);

        returnTimerRef.current = window.setTimeout(() => {
          returnTimerRef.current = null;
          returnToStart();
        }, 4000);
      }
    };

    detectSuccess();

    const observer = new MutationObserver(detectSuccess);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();

      if (returnTimerRef.current) {
        window.clearTimeout(returnTimerRef.current);
        returnTimerRef.current = null;
      }
    };
  }, [bypassKioskStart, showKioskStart]);

  if (bypassKioskStart) {
    return <App />;
  }

  if (showKioskStart) {
    return <KioskStartPage onStart={startEntry} />;
  }

  return (
    <>
      <App />

      {showSuccessOverlay && (
        <div className="kioskSuccessOverlay" role="status" aria-live="polite">
          <div className="kioskSuccessCard">
            <div className="kioskSuccessCheck">✓</div>
            <h1>Success!</h1>
            <p>You’ve been added to the board.</p>
          </div>
        </div>
      )}
    </>
  );
}
