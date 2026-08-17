import { Wrench } from "lucide-react";

// Shared animated loading screen - added 2026-08-16 to replace bare
// "Loading live inventory data..." text across every sf2 screen (Carin:
// "we need to have a loading .... with the wrench going in circles or
// something"). Used identically everywhere so a restyle only needs to
// happen in one place.
export default function Sf2LoadingState() {
  return (
    <div className="stockfix2-page">
      <div className="sf2-loading">
        <Wrench size={28} className="sf2-loading-icon" />
        <p className="sf2-loading-text">Loading live inventory data...</p>
      </div>
    </div>
  );
}
