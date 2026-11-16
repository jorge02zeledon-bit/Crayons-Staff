import { promises as fs } from "node:fs";
import path from "node:path";
import { PKPass } from "passkit-generator";
import type { ScheduleState, Teacher } from "./schedule";

/**
 * Apple Wallet passes. Apple requires every pass to be signed with a Pass Type ID
 * certificate from an Apple Developer account, so this only works once these are set:
 *   APPLE_PASS_TYPE_ID        pass.com.yourschool.staffbadge
 *   APPLE_TEAM_ID             the 10-character Team ID
 *   APPLE_PASS_CERT_B64       base64 of the pass certificate (PEM)
 *   APPLE_PASS_KEY_B64        base64 of its private key (PEM)
 *   APPLE_PASS_KEY_PASSPHRASE optional, if the key is encrypted
 *   APPLE_WWDR_CERT_B64       base64 of Apple's WWDR G4 certificate (PEM)
 * See the README for the step-by-step.
 */
export function appleWalletConfigured(): boolean {
  return !!(process.env.APPLE_PASS_TYPE_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_PASS_CERT_B64 && process.env.APPLE_PASS_KEY_B64 && process.env.APPLE_WWDR_CERT_B64);
}

function b64(name: string): Buffer { return Buffer.from(process.env[name] || "", "base64"); }

async function images(): Promise<Record<string, Buffer>> {
  const dir = path.join(process.cwd(), "assets", "wallet");
  const names = ["icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "logo@2x.png", "thumbnail.png", "thumbnail@2x.png"];
  const out: Record<string, Buffer> = {};
  await Promise.all(names.map(async (n) => { out[n] = await fs.readFile(path.join(dir, n)); }));
  return out;
}

export async function buildApplePass(t: Teacher, state: ScheduleState, origin: string): Promise<Buffer> {
  const pos = state.positions.find((p) => p.id === t.usualPositionId)?.label || "";
  const area = t.usualArea === "both" ? "Preschool & Elementary" : t.usualArea === "preschool" ? "Preschool" : "Elementary";
  const pass = new PKPass(await images(), {
    wwdr: b64("APPLE_WWDR_CERT_B64"),
    signerCert: b64("APPLE_PASS_CERT_B64"),
    signerKey: b64("APPLE_PASS_KEY_B64"),
    signerKeyPassphrase: process.env.APPLE_PASS_KEY_PASSPHRASE || undefined,
  }, {
    formatVersion: 1,
    passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID!,
    teamIdentifier: process.env.APPLE_TEAM_ID!,
    serialNumber: `${t.id}-${t.badgeCode}`,
    organizationName: state.settings.schoolName,
    description: `${state.settings.schoolName} staff badge`,
    logoText: state.settings.schoolName,
    foregroundColor: "rgb(30, 27, 58)",
    backgroundColor: "rgb(255, 255, 255)",
    labelColor: "rgb(95, 92, 122)",
  });
  pass.type = "generic";
  pass.primaryFields.push({ key: "name", label: "STAFF", value: t.name });
  pass.secondaryFields.push({ key: "position", label: "POSITION", value: pos }, { key: "area", label: "AREA", value: area });
  pass.auxiliaryFields.push({ key: "code", label: "BADGE", value: t.badgeCode || "" });
  pass.backFields.push(
    { key: "how", label: "How to use", value: "Hold this pass up to the kiosk camera at the front office to clock in, start or end a break, and clock out." },
    { key: "site", label: "Schedule", value: `${origin}/schedule` },
  );
  pass.setBarcodes({ message: `CS:${t.badgeCode}`, format: "PKBarcodeFormatQR", messageEncoding: "iso-8859-1", altText: t.badgeCode || "" });
  return pass.getAsBuffer();
}
