declare module "qrcode" {
  interface ToDataURLOptions {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    color?: {
      dark?: string;
      light?: string;
    };
  }

  export function toDataURL(text: string, options?: ToDataURLOptions): Promise<string>;
}