/**
 * PAdES-compatible PDF signer — 100% client-side.
 *
 * Produces a PDF with:
 *   - /Sig dictionary with /ByteRange
 *   - PKCS#7 detached signature (SubFilter adbe.pkcs7.detached)
 *   - Visual stamp on the last page
 *
 * Uses node-forge for PKCS#12 parsing and PKCS#7 generation,
 * and pdf-lib for the visual stamp layer.
 */

import forge from "node-forge";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SignerInfo {
  name: string;
  dni: string;
  role: string;
  geo: string;
  timestamp: string;
}

export interface P12ParseResult {
  commonName: string;
  serialNumber: string; // DNI/NIF from the certificate
  certificate: forge.pki.Certificate;
  privateKey: forge.pki.PrivateKey;
  chain: forge.pki.Certificate[];
}

/* ------------------------------------------------------------------ */
/*  1. Parse PKCS#12                                                  */
/* ------------------------------------------------------------------ */

export function parseP12(p12Buffer: ArrayBuffer, password: string): P12ParseResult {
  const p12Der = forge.util.binary.raw.encode(new Uint8Array(p12Buffer));
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  // Extract bags
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })?.[forge.pki.oids.certBag] || [];
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })?.[forge.pki.oids.pkcs8ShroudedKeyBag] || [];

  if (!keyBags.length) throw new Error("No se encontró clave privada en el certificado");

  const privateKey = keyBags[0].key as forge.pki.PrivateKey;
  if (!privateKey) throw new Error("No se pudo extraer la clave privada");

  // Find the end-entity certificate (the one matching the private key)
  let mainCert: forge.pki.Certificate | null = null;
  const chain: forge.pki.Certificate[] = [];

  for (const bag of certBags) {
    const cert = bag.cert;
    if (!cert) continue;
    if (!mainCert && cert.publicKey) {
      // Check if this cert matches the private key by comparing modulus
      const pubMod = (cert.publicKey as any).n?.toString(16);
      const privMod = (privateKey as any).n?.toString(16);
      if (pubMod && privMod && pubMod === privMod) {
        mainCert = cert;
        continue;
      }
    }
    chain.push(cert);
  }

  if (!mainCert && certBags.length > 0) {
    mainCert = certBags[0].cert!;
  }
  if (!mainCert) throw new Error("No se encontró certificado en el archivo");

  // Extract CN and serialNumber (DNI/NIF)
  const cnAttr = mainCert.subject.getField("CN");
  const snAttr = mainCert.subject.getField({ name: "serialName" }) || mainCert.subject.getField("2.5.4.5");
  const commonName = cnAttr?.value || "Desconocido";
  const serialNumber = snAttr?.value || "";

  return { commonName, serialNumber, certificate: mainCert, privateKey, chain };
}

/* ------------------------------------------------------------------ */
/*  2. Add visual stamp via pdf-lib (returns PDF bytes)               */
/* ------------------------------------------------------------------ */

async function addVisualStamp(
  pdfBytes: Uint8Array,
  signer: SignerInfo,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const stampW = 300;
  const stampH = 100;
  const margin = 36;

  // Simple anti-overlap: bottom-right by default
  const x = lastPage.getWidth() - stampW - margin;
  const y = margin;

  // Background
  lastPage.drawRectangle({
    x, y, width: stampW, height: stampH,
    color: rgb(0.97, 0.97, 0.97),
    borderColor: rgb(0.3, 0.3, 0.3),
    borderWidth: 0.75,
  });

  // Left: Name in large bold
  const nameLines = splitText(signer.name, 18);
  nameLines.forEach((line, i) => {
    lastPage.drawText(line, {
      x: x + 8, y: y + stampH - 20 - i * 14,
      size: 11, font: fontBold, color: rgb(0.1, 0.1, 0.1),
    });
  });

  // Right block
  const rightX = x + 140;
  const lines = [
    `Firmado digitalmente por`,
    signer.name,
    `ID: ${signer.dni}`,
    `Fecha: ${new Date(signer.timestamp).toLocaleString("es-ES")} +01'00'`,
    `Localización: ${signer.geo || "N/A"}`,
    `Rol: ${signer.role}`,
  ];
  lines.forEach((line, i) => {
    lastPage.drawText(line, {
      x: rightX, y: y + stampH - 16 - i * 12,
      size: 7, font, color: rgb(0.25, 0.25, 0.25),
      maxWidth: stampW - 148,
    });
  });

  // Footer
  lastPage.drawText("Firma PAdES — TEKTRA", {
    x: x + 8, y: y + 4, size: 6, font, color: rgb(0.5, 0.5, 0.5),
  });

  return pdfDoc.save();
}

function splitText(text: string, maxLen: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > maxLen) {
      if (current) lines.push(current.trim());
      current = w;
    } else {
      current = (current + " " + w).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines.length ? lines : [text];
}

/* ------------------------------------------------------------------ */
/*  3. PAdES signature with ByteRange + PKCS#7                       */
/* ------------------------------------------------------------------ */

const SIGNATURE_MAX_LENGTH = 16384; // 16 KB hex placeholder

/**
 * Sign a PDF with a PKCS#12 certificate, producing a PAdES-compatible file.
 */
export async function signPdfWithP12(
  originalPdfBytes: ArrayBuffer,
  p12: P12ParseResult,
  signer: SignerInfo,
): Promise<Uint8Array> {
  // Step 1: Add visual stamp
  const stampedBytes = await addVisualStamp(new Uint8Array(originalPdfBytes), signer);

  // Step 2: Add signature placeholder to the PDF
  const pdfWithPlaceholder = addSignaturePlaceholder(stampedBytes);

  // Step 3: Calculate hash of ByteRange segments
  const { byteRange, contentsStart, contentsEnd } = findByteRange(pdfWithPlaceholder);
  const segment1 = pdfWithPlaceholder.slice(byteRange[0], byteRange[0] + byteRange[1]);
  const segment2 = pdfWithPlaceholder.slice(byteRange[2], byteRange[2] + byteRange[3]);

  // Step 4: Generate PKCS#7 signature
  const dataToSign = new Uint8Array(segment1.length + segment2.length);
  dataToSign.set(new Uint8Array(segment1), 0);
  dataToSign.set(new Uint8Array(segment2), segment1.length);

  const pkcs7Hex = generatePKCS7(dataToSign, p12);

  // Step 5: Insert signature into placeholder
  const result = new Uint8Array(pdfWithPlaceholder);
  const hexBytes = new TextEncoder().encode(pkcs7Hex.padEnd(SIGNATURE_MAX_LENGTH * 2, "0"));
  // Write between the angle brackets of /Contents
  for (let i = 0; i < hexBytes.length && (contentsStart + 1 + i) < contentsEnd; i++) {
    result[contentsStart + 1 + i] = hexBytes[i];
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Placeholder insertion                                              */
/* ------------------------------------------------------------------ */

function addSignaturePlaceholder(pdfBytes: Uint8Array): Uint8Array {
  const pdf = new TextDecoder("latin1").decode(pdfBytes);

  // Find the last %%EOF
  const eofIndex = pdf.lastIndexOf("%%EOF");
  if (eofIndex === -1) throw new Error("PDF inválido: no se encontró %%EOF");

  // Find the xref/startxref before %%EOF
  const beforeEof = pdf.substring(0, eofIndex);

  // We need to find the last cross-reference section
  const startxrefMatch = beforeEof.match(/startxref\s+(\d+)\s*$/);
  const oldXrefOffset = startxrefMatch ? parseInt(startxrefMatch[1]) : 0;

  // Count existing objects to determine next object number
  const objMatches = pdf.matchAll(/(\d+)\s+\d+\s+obj/g);
  let maxObjNum = 0;
  for (const m of objMatches) {
    const n = parseInt(m[1]);
    if (n > maxObjNum) maxObjNum = n;
  }

  const sigObjNum = maxObjNum + 1;
  const now = new Date();
  const dateStr = formatPdfDate(now);

  // Build the Contents hex placeholder
  const contentsHex = "0".repeat(SIGNATURE_MAX_LENGTH * 2);

  // Build signature object
  const sigObj = [
    `${sigObjNum} 0 obj`,
    `<<`,
    `/Type /Sig`,
    `/Filter /Adobe.PPKLite`,
    `/SubFilter /adbe.pkcs7.detached`,
    `/ByteRange [0 0000000000 0000000000 0000000000]`,
    `/Contents <${contentsHex}>`,
    `/M (D:${dateStr})`,
    `/Reason (Firma digital TEKTRA)`,
    `/Location (${signer.geo || "ES"})`,
    `>>`,
    `endobj`,
  ].join("\n");

  // We need to add the sig object and update cross-references
  // For simplicity, use incremental update approach
  const sigObjOffset = pdfBytes.length;

  // Build incremental update
  const acroFormObjNum = sigObjNum + 1;
  const widgetObjNum = sigObjNum + 2;

  // Find last page object reference
  const pageRef = findLastPageRef(pdf);

  const widgetObj = [
    `${widgetObjNum} 0 obj`,
    `<<`,
    `/Type /Annot`,
    `/Subtype /Widget`,
    `/FT /Sig`,
    `/Rect [0 0 0 0]`,
    `/V ${sigObjNum} 0 R`,
    `/T (Signature_TEKTRA)`,
    `/F 132`,
    `/P ${pageRef}`,
    `>>`,
    `endobj`,
  ].join("\n");

  const sigObjBytes = new TextEncoder().encode(sigObj + "\n");
  const widgetObjBytes = new TextEncoder().encode(widgetObj + "\n");

  const widgetObjOffset = sigObjOffset + sigObjBytes.length;

  // Build xref for incremental update
  const xrefOffset = sigObjOffset + sigObjBytes.length + widgetObjBytes.length;

  const xrefSection = [
    `xref`,
    `${sigObjNum} 2`,
    `${String(sigObjOffset).padStart(10, "0")} 00000 n `,
    `${String(widgetObjOffset).padStart(10, "0")} 00000 n `,
    `trailer`,
    `<<`,
    `/Size ${widgetObjNum + 1}`,
    `/Root ${findRootRef(pdf)}`,
    `/Prev ${oldXrefOffset}`,
    `>>`,
    `startxref`,
    `${xrefOffset}`,
    `%%EOF`,
  ].join("\n");

  const xrefBytes = new TextEncoder().encode(xrefSection + "\n");

  // Combine everything
  const result = new Uint8Array(pdfBytes.length + sigObjBytes.length + widgetObjBytes.length + xrefBytes.length);
  result.set(pdfBytes, 0);
  result.set(sigObjBytes, pdfBytes.length);
  result.set(widgetObjBytes, pdfBytes.length + sigObjBytes.length);
  result.set(xrefBytes, pdfBytes.length + sigObjBytes.length + widgetObjBytes.length);

  // Now fix the ByteRange values
  return fixByteRange(result);
}

// Shared signer info for building the sig object
const signer = { geo: "" };

function findLastPageRef(pdf: string): string {
  // Find page objects - look for /Type /Page (not /Pages)
  const pageMatches = [...pdf.matchAll(/(\d+)\s+0\s+obj[\s\S]*?\/Type\s*\/Page(?!\s*s)\b/g)];
  if (pageMatches.length > 0) {
    const lastMatch = pageMatches[pageMatches.length - 1];
    return `${lastMatch[1]} 0 R`;
  }
  // Fallback: find any page reference in /Pages /Kids array
  const kidsMatch = pdf.match(/\/Kids\s*\[([^\]]+)\]/);
  if (kidsMatch) {
    const refs = kidsMatch[1].trim().split(/\s+(?=\d)/);
    return refs[refs.length - 1]?.trim() || "1 0 R";
  }
  return "1 0 R";
}

function findRootRef(pdf: string): string {
  const rootMatch = pdf.match(/\/Root\s+(\d+\s+\d+\s+R)/);
  return rootMatch ? rootMatch[1] : "1 0 R";
}

function formatPdfDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const hh = pad(Math.floor(Math.abs(offset) / 60));
  const mm = pad(Math.abs(offset) % 60);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${sign}${hh}'${mm}'`;
}

/* ------------------------------------------------------------------ */
/*  ByteRange fixing                                                   */
/* ------------------------------------------------------------------ */

function fixByteRange(pdfBytes: Uint8Array): Uint8Array {
  const pdf = new TextDecoder("latin1").decode(pdfBytes);

  // Find /Contents <...>
  const contentsMatch = pdf.match(/\/Contents\s*<([0-9a-fA-F]+)>/);
  if (!contentsMatch) throw new Error("No se encontró el placeholder de firma");

  const contentsHexStart = pdf.indexOf("<" + contentsMatch[1] + ">");
  const contentsHexEnd = contentsHexStart + contentsMatch[1].length + 2; // includes < and >

  const byteRange1Start = 0;
  const byteRange1Length = contentsHexStart;
  const byteRange2Start = contentsHexEnd;
  const byteRange2Length = pdfBytes.length - contentsHexEnd;

  // Build the new ByteRange string
  const newByteRange = `/ByteRange [${byteRange1Start} ${byteRange1Length} ${byteRange2Start} ${byteRange2Length}]`;

  // Find the old ByteRange and replace it
  const oldByteRangeMatch = pdf.match(/\/ByteRange\s*\[[^\]]+\]/);
  if (!oldByteRangeMatch) throw new Error("No se encontró ByteRange");

  const oldByteRange = oldByteRangeMatch[0];
  const oldByteRangeIdx = pdf.indexOf(oldByteRange);

  // Pad new ByteRange to same length as old one
  const paddedByteRange = newByteRange.padEnd(oldByteRange.length, " ");

  const encoder = new TextEncoder();
  const replacement = encoder.encode(paddedByteRange);

  const result = new Uint8Array(pdfBytes);
  for (let i = 0; i < replacement.length; i++) {
    result[oldByteRangeIdx + i] = replacement[i];
  }

  return result;
}

function findByteRange(pdfBytes: Uint8Array): {
  byteRange: [number, number, number, number];
  contentsStart: number;
  contentsEnd: number;
} {
  const pdf = new TextDecoder("latin1").decode(pdfBytes);

  const brMatch = pdf.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
  if (!brMatch) throw new Error("ByteRange no encontrado");

  const byteRange: [number, number, number, number] = [
    parseInt(brMatch[1]),
    parseInt(brMatch[2]),
    parseInt(brMatch[3]),
    parseInt(brMatch[4]),
  ];

  // Find /Contents <...>
  const contentsMatch = pdf.match(/\/Contents\s*<([0-9a-fA-F]+)>/);
  if (!contentsMatch) throw new Error("Contents placeholder no encontrado");

  const contentsStart = pdf.indexOf("<" + contentsMatch[1] + ">");
  const contentsEnd = contentsStart + contentsMatch[1].length + 2;

  return { byteRange, contentsStart, contentsEnd };
}

/* ------------------------------------------------------------------ */
/*  PKCS#7 generation                                                  */
/* ------------------------------------------------------------------ */

function generatePKCS7(dataToSign: Uint8Array, p12: P12ParseResult): string {
  const md = forge.md.sha256.create();
  md.update(forge.util.binary.raw.encode(dataToSign));
  const digest = md.digest();

  // Create PKCS#7 signed data
  const p7 = forge.pkcs7.createSignedData();

  p7.content = forge.util.createBuffer("");

  // Add certificate
  p7.addCertificate(p12.certificate);
  for (const cert of p12.chain) {
    p7.addCertificate(cert);
  }

  // Build the PKCS#7 signed data with the actual ByteRange content
  const p7Final = forge.pkcs7.createSignedData();
  p7Final.content = forge.util.createBuffer(forge.util.binary.raw.encode(dataToSign));

  p7Final.addCertificate(p12.certificate);
  for (const cert of p12.chain) {
    p7Final.addCertificate(cert);
  }

  p7Final.addSigner({
    key: p12.privateKey as any,
    certificate: p12.certificate,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      {
        type: forge.pki.oids.contentType,
        value: forge.pki.oids.data,
      },
      {
        type: forge.pki.oids.signingTime,
        value: new Date().toISOString(),
      },
      {
        type: forge.pki.oids.messageDigest,
      },
    ],
  });

  p7Final.sign({ detached: true });

  // Get DER bytes
  const asn1 = p7Final.toAsn1();
  const der = forge.asn1.toDer(asn1);
  const derBytes = der.getBytes();

  // Convert to hex
  let hex = "";
  for (let i = 0; i < derBytes.length; i++) {
    hex += derBytes.charCodeAt(i).toString(16).padStart(2, "0");
  }

  return hex;
}

/* ------------------------------------------------------------------ */
/*  SHA-256 hash utility                                              */
/* ------------------------------------------------------------------ */

export async function computeSHA256(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
