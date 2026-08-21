import { useEffect, useState } from "react";
import { toDataURL } from "qrcode";

const STOCKFIX_APP_URL = "https://stock-fix.replit.app";

export default function QRPage() {
  const [qrCode, setQrCode] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;

    toDataURL(STOCKFIX_APP_URL, {
      width: 800,
      margin: 4,
      errorCorrectionLevel: "H",
      color: { dark: "#003B71", light: "#FFFFFF" },
    })
      .then((dataUrl) => {
        if (active) setQrCode(dataUrl);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      gap: 16,
      minHeight: "100vh",
      padding: 24,
      boxSizing: "border-box",
      background: "#fff",
      color: "#003B71",
      fontFamily: "Arial, sans-serif",
      textAlign: "center",
    }}>
      <h1 style={{ margin: 0, fontSize: 28 }}>StockFix</h1>
      <p style={{ margin: 0 }}>Scan to open the current StockFix app</p>
      {qrCode ? (
        <img
          src={qrCode}
          width={400}
          height={400}
          alt={`QR code for ${STOCKFIX_APP_URL}`}
          style={{ maxWidth: "100%", height: "auto" }}
        />
      ) : (
        <p>{loadFailed ? "Open the current app using the link below." : "Generating QR code…"}</p>
      )}
      <a href={STOCKFIX_APP_URL} style={{ color: "#003B71", fontWeight: 700 }}>
        {STOCKFIX_APP_URL}
      </a>
    </main>
  );
}
