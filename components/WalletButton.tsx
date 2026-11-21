"use client";

/** "Add to Apple Wallet": inside the mobile app the pass must open in Safari, so the app is asked to do it. */
export function WalletButton() {
  const href = "/api/wallet/apple";
  return (
    <a
      className="btn btn-primary btn-block btn-login"
      href={href}
      onClick={(e) => {
        const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } }).ReactNativeWebView;
        if (rn) { e.preventDefault(); rn.postMessage(JSON.stringify({ type: "openExternal", url: href })); }
      }}
    >
      Add to Apple Wallet
    </a>
  );
}
