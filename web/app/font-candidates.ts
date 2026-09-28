/** TEMPORARY: loaders for the font candidates in lib/font-options.ts (fonts download only when used). */
import {
  Alegreya_Sans,
  Alegreya_SC,
  Archivo,
  Bodoni_Moda,
  Bricolage_Grotesque,
  Fraunces,
  Hanken_Grotesk,
  IBM_Plex_Sans,
  IM_Fell_English_SC,
  Instrument_Sans,
  Young_Serif,
} from "next/font/google";

const bodoni = Bodoni_Moda({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-bodoni", axes: ["opsz"] });
const fraunces = Fraunces({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-fraunces", axes: ["opsz", "SOFT", "WONK"] });
const fell = IM_Fell_English_SC({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--font-fell" });
const alegreyaSc = Alegreya_SC({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "500", "700"], variable: "--font-alegreya-sc" });
const young = Young_Serif({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--font-young" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-bricolage", axes: ["opsz", "wdth"] });

const archivo = Archivo({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-archivo", axes: ["wdth"] });
const instrument = Instrument_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-instrument", axes: ["wdth"] });
const plex = IBM_Plex_Sans({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "500", "600", "700"], variable: "--font-plex" });
const alegreyaSans = Alegreya_Sans({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "500", "700"], variable: "--font-alegreya-sans" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-hanken" });

export const candidateFontVars = [bodoni, fraunces, fell, alegreyaSc, young, bricolage, archivo, instrument, plex, alegreyaSans, hanken]
  .map((f) => f.variable)
  .join(" ");
