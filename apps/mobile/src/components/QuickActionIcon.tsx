import React from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useTheme } from '@/theme';

// Brand orange used by all the source SVGs (apps/mobile/assets/icons/*.svg).
const ICON_COLOR = '#E37F2B';

// Each entry is the SYMBOL only (the card frame is drawn uniformly by the
// container below). The 4 source SVGs that shipped with a built-in frame have
// it stripped here and their viewBox tightened around the symbol.

// Add-expense (add-expense.svg) — plus
const ADD = `<svg viewBox="15 14 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M25 16V32" stroke="${ICON_COLOR}" stroke-width="1.4" stroke-linecap="round"/>
<path d="M17 24H33" stroke="${ICON_COLOR}" stroke-width="1.4" stroke-linecap="round"/>
</svg>`;

// Scan-receipt (scan-receipt.svg) — QR squares + scan beam
const SCAN = `<svg viewBox="9 7 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="11.5" y="9" width="11" height="11" stroke="${ICON_COLOR}"/>
<rect x="15" y="12.5" width="4" height="4" fill="${ICON_COLOR}"/>
<rect x="33.5" y="9" width="11" height="11" stroke="${ICON_COLOR}"/>
<rect x="37" y="12.5" width="4" height="4" fill="${ICON_COLOR}"/>
<rect x="11.5" y="32" width="11" height="11" stroke="${ICON_COLOR}"/>
<rect x="15" y="35.5" width="4" height="4" fill="${ICON_COLOR}"/>
<rect x="37" y="35.5" width="3" height="3" fill="${ICON_COLOR}"/>
<rect x="33" y="31.5" width="3" height="3" fill="${ICON_COLOR}"/>
<rect x="33" y="38.5" width="3" height="3" fill="${ICON_COLOR}"/>
<rect x="41" y="31.5" width="3" height="3" fill="${ICON_COLOR}"/>
<rect x="41" y="38.5" width="3" height="3" fill="${ICON_COLOR}"/>
<rect x="9" y="24.5" width="38" height="2" fill="${ICON_COLOR}"/>
</svg>`;

// Voice (voice.svg) — waveform bars
const VOICE = `<svg viewBox="4 7 40 37" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="22" y="9" width="4" height="33" rx="1" stroke="${ICON_COLOR}"/>
<rect x="30" y="16" width="4" height="19" rx="1" stroke="${ICON_COLOR}"/>
<rect x="14" y="16" width="4" height="19" rx="1" stroke="${ICON_COLOR}"/>
<rect x="6" y="23" width="4" height="4" rx="1" stroke="${ICON_COLOR}"/>
<rect x="38" y="23" width="4" height="4" rx="1" stroke="${ICON_COLOR}"/>
</svg>`;

// Transfers (transfers.svg) — two horizontal arrows
const TRANSFERS = `<svg viewBox="0 14 49 26" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M0.219677 33.1985C-0.0732155 32.9056 -0.0732155 32.4307 0.219677 32.1378L4.99265 27.3648C5.28554 27.0719 5.76041 27.0719 6.05331 27.3648C6.3462 27.6577 6.3462 28.1326 6.05331 28.4255L1.81067 32.6681L6.05331 36.9108C6.3462 37.2037 6.3462 37.6785 6.05331 37.9714C5.76041 38.2643 5.28554 38.2643 4.99265 37.9714L0.219677 33.1985ZM49.0693 32.6681V33.4181H0.750008V32.6681V31.9181H49.0693V32.6681Z" fill="${ICON_COLOR}"/>
<path d="M48.919 22.0304C49.2119 21.7375 49.2119 21.2626 48.919 20.9697L44.146 16.1967C43.8531 15.9038 43.3783 15.9038 43.0854 16.1967C42.7925 16.4896 42.7925 16.9645 43.0854 17.2574L47.328 21.5L43.0854 25.7427C42.7925 26.0356 42.7925 26.5104 43.0854 26.8033C43.3783 27.0962 43.8531 27.0962 44.146 26.8033L48.919 22.0304ZM0.0693359 21.5V22.25H48.3887V21.5V20.75H0.0693359V21.5Z" fill="${ICON_COLOR}"/>
</svg>`;

// Exchange (exchange.svg) — four diagonal arrows
const EXCHANGE = `<svg viewBox="0 0 59 59" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M30.059 54.0133C30.3597 54.2982 30.3725 54.7729 30.0875 55.0736C29.8026 55.3743 29.3279 55.387 29.0273 55.1021L29.5431 54.5577L30.059 54.0133ZM5.39698 32.4069C5.38585 31.9929 5.71248 31.6482 6.12655 31.6371L12.8741 31.4556C13.2882 31.4444 13.6329 31.7711 13.644 32.1851C13.6551 32.5992 13.3285 32.9439 12.9144 32.955L6.9166 33.1163L7.07791 39.1142C7.08905 39.5282 6.76241 39.8729 6.34835 39.8841C5.93428 39.8952 5.58959 39.5686 5.57846 39.1545L5.39698 32.4069ZM29.5431 54.5577L29.0273 55.1021L5.63083 32.9312L6.14671 32.3868L6.66259 31.8424L30.059 54.0133L29.5431 54.5577Z" fill="${ICON_COLOR}"/>
<path d="M28.3656 4.7366C28.0649 4.45168 28.0522 3.97698 28.3371 3.67632C28.622 3.37566 29.0967 3.36289 29.3973 3.6478L28.8815 4.1922L28.3656 4.7366ZM53.0276 26.343C53.0388 26.757 52.7121 27.1017 52.2981 27.1129L45.5505 27.2943C45.1364 27.3055 44.7917 26.9788 44.7806 26.5648C44.7695 26.1507 45.0961 25.806 45.5102 25.7949L51.508 25.6336L51.3467 19.6357C51.3356 19.2217 51.6622 18.877 52.0763 18.8658C52.4903 18.8547 52.835 19.1813 52.8462 19.5954L53.0276 26.343ZM28.8815 4.1922L29.3973 3.6478L52.7938 25.8187L52.2779 26.3631L51.762 26.9075L28.3656 4.7366L28.8815 4.1922Z" fill="${ICON_COLOR}"/>
<path d="M3.70236 29.2267C3.41745 29.5274 3.43022 30.0021 3.73088 30.287C4.03154 30.5719 4.50624 30.5592 4.79116 30.2585L4.24676 29.7426L3.70236 29.2267ZM27.1674 6.32601C27.1563 5.91195 26.8116 5.58531 26.3975 5.59645L19.65 5.77792C19.2359 5.78906 18.9093 6.13375 18.9204 6.54781C18.9315 6.96188 19.2762 7.28851 19.6903 7.27738L25.6881 7.11607L25.8494 13.1139C25.8606 13.528 26.2053 13.8546 26.6193 13.8435C27.0334 13.8323 27.36 13.4876 27.3489 13.0736L27.1674 6.32601ZM4.24676 29.7426L4.79116 30.2585L26.9621 6.86206L26.4177 6.34618L25.8733 5.8303L3.70236 29.2267L4.24676 29.7426Z" fill="${ICON_COLOR}"/>
<path d="M55.0247 30.0402C55.3096 29.7396 55.2968 29.2649 54.9962 28.98C54.6955 28.695 54.2208 28.7078 53.9359 29.0085L54.4803 29.5244L55.0247 30.0402ZM31.5596 52.941C31.5708 53.355 31.9155 53.6817 32.3295 53.6705L39.0771 53.489C39.4911 53.4779 39.8178 53.1332 39.8066 52.7192C39.7955 52.3051 39.4508 51.9785 39.0367 51.9896L33.0389 52.1509L32.8776 46.1531C32.8665 45.739 32.5218 45.4124 32.1077 45.4235C31.6937 45.4346 31.367 45.7793 31.3782 46.1934L31.5596 52.941ZM54.4803 29.5244L53.9359 29.0085L31.765 52.4049L32.3094 52.9208L32.8537 53.4367L55.0247 30.0402L54.4803 29.5244Z" fill="${ICON_COLOR}"/>
</svg>`;

// Converter (converter.svg) — currency arrows
const CONVERTER = `<svg viewBox="0 0 60 48" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M34.0713 6.5C37.4336 10.0037 39.5 14.7605 39.5 20C39.5 30.7696 30.7696 39.5 20 39.5C19.153 39.5 18.3185 39.446 17.5 39.3412" stroke="${ICON_COLOR}" stroke-linecap="round"/>
<path d="M24.5 1.0218C23.0554 0.680566 21.5488 0.5 20 0.5C9.23045 0.5 0.5 9.23045 0.5 20C0.5 25.7752 3.01063 30.9641 7 34.5347" stroke="${ICON_COLOR}" stroke-linecap="round"/>
<path d="M49.5 10.9666C46.689 9.39546 43.4491 8.5 40 8.5C29.2304 8.5 20.5 17.2304 20.5 28C20.5 34.469 23.6501 40.2024 28.5 43.7497" stroke="${ICON_COLOR}" stroke-linecap="round"/>
<path d="M58.5595 22C59.1701 23.8902 59.5 25.9066 59.5 28C59.5 38.7696 50.7696 47.5 40 47.5C38.8052 47.5 37.6355 47.3926 36.5 47.1868" stroke="${ICON_COLOR}" stroke-linecap="round"/>
<path d="M11.0455 27.5V24.9193L11.4012 25.2647C10.4526 25.2512 9.55665 25.1089 8.71344 24.838C7.87022 24.5535 7.13241 24.1267 6.5 23.5578L7.09289 22.2166C7.7253 22.7449 8.39065 23.1378 9.08893 23.3952C9.78722 23.6526 10.6041 23.7813 11.5395 23.7813C12.6726 23.7813 13.5158 23.5578 14.0692 23.1107C14.6225 22.6501 14.8992 22.0608 14.8992 21.3428C14.8992 20.7602 14.695 20.2996 14.2866 19.961C13.8913 19.6087 13.2325 19.331 12.3103 19.1278L10.334 18.7011C9.13505 18.4301 8.24572 17.9898 7.66601 17.3802C7.0863 16.757 6.79644 15.9374 6.79644 14.9214C6.79644 14.1357 6.9809 13.438 7.3498 12.8283C7.73188 12.2052 8.25889 11.7175 8.93083 11.3652C9.60277 10.9995 10.3867 10.7963 11.2826 10.7556L11.0455 11.0401V8.5H12.3893V11.0401L12.1324 10.7556C12.8307 10.7827 13.5422 10.9385 14.2668 11.223C14.9914 11.5075 15.6041 11.9342 16.1047 12.5032L15.5514 13.8037C15.0244 13.2483 14.4381 12.8487 13.7925 12.6048C13.1469 12.3474 12.4289 12.2187 11.6383 12.2187C10.637 12.2187 9.83992 12.4626 9.24704 12.9503C8.65415 13.438 8.35771 14.0815 8.35771 14.8807C8.35771 15.5039 8.54216 16.0052 8.91107 16.3845C9.29315 16.7638 9.9058 17.0415 10.749 17.2176L12.7253 17.6647C14.0033 17.9357 14.9519 18.3624 15.5711 18.9449C16.1904 19.5139 16.5 20.2861 16.5 21.2615C16.5 22.0337 16.309 22.7111 15.9269 23.2936C15.5448 23.8626 15.0244 24.3164 14.3656 24.6551C13.7069 24.9802 12.9427 25.1766 12.0731 25.2444L12.3893 24.8989V27.5H11.0455Z" fill="${ICON_COLOR}"/>
<path d="M22.1464 27.8536C21.9512 27.6583 21.9512 27.3417 22.1464 27.1464L25.3284 23.9645C25.5237 23.7692 25.8403 23.7692 26.0355 23.9645C26.2308 24.1597 26.2308 24.4763 26.0355 24.6716L23.2071 27.5L26.0355 30.3284C26.2308 30.5237 26.2308 30.8403 26.0355 31.0355C25.8403 31.2308 25.5237 31.2308 25.3284 31.0355L22.1464 27.8536ZM33.1302 27.5V28H22.5V27.5V27H33.1302V27.5Z" fill="${ICON_COLOR}"/>
<path d="M37.4838 22.8536C37.6791 22.6583 37.6791 22.3417 37.4838 22.1464L34.3018 18.9645C34.1066 18.7692 33.79 18.7692 33.5947 18.9645C33.3995 19.1597 33.3995 19.4763 33.5947 19.6716L36.4231 22.5L33.5947 25.3284C33.3995 25.5237 33.3995 25.8403 33.5947 26.0355C33.79 26.2308 34.1066 26.2308 34.3018 26.0355L37.4838 22.8536ZM26.5 22.5V23H37.1303V22.5V22H26.5V22.5Z" fill="${ICON_COLOR}"/>
<path d="M47.333 40.876C46.137 40.876 45.0253 40.6767 43.998 40.278C42.9707 39.864 42.0737 39.289 41.307 38.553C40.5557 37.817 39.9653 36.9507 39.536 35.954C39.122 34.9573 38.915 33.8687 38.915 32.688C38.915 31.5073 39.122 30.4187 39.536 29.422C39.9653 28.4253 40.5557 27.559 41.307 26.823C42.0737 26.087 42.9707 25.5197 43.998 25.121C45.0253 24.707 46.137 24.5 47.333 24.5C48.529 24.5 49.633 24.6993 50.645 25.098C51.6723 25.4813 52.5463 26.064 53.267 26.846L52.163 27.927C51.519 27.2523 50.7907 26.7693 49.978 26.478C49.1807 26.1713 48.3297 26.018 47.425 26.018C46.4437 26.018 45.539 26.1867 44.711 26.524C43.883 26.846 43.1623 27.3137 42.549 27.927C41.9357 28.525 41.4603 29.2303 41.123 30.043C40.7857 30.8403 40.617 31.722 40.617 32.688C40.617 33.654 40.7857 34.5433 41.123 35.356C41.4603 36.1533 41.9357 36.8587 42.549 37.472C43.1623 38.07 43.883 38.5377 44.711 38.875C45.539 39.197 46.4437 39.358 47.425 39.358C48.3297 39.358 49.1807 39.2047 49.978 38.898C50.7907 38.5913 51.519 38.1007 52.163 37.426L53.267 38.507C52.5463 39.289 51.6723 39.8793 50.645 40.278C49.633 40.6767 48.529 40.876 47.333 40.876ZM36.5 34.781V33.769H48.828V34.781H36.5ZM36.5 31.607V30.595H48.828V31.607H36.5Z" fill="${ICON_COLOR}"/>
</svg>`;

// Purchase request — shopping cart
const CART = `<svg viewBox="2 4 44 40" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M4 6H9L14 30H36L41 14H14" stroke="${ICON_COLOR}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="18" cy="36" r="3" stroke="${ICON_COLOR}" stroke-width="1.8"/>
<circle cx="32" cy="36" r="3" stroke="${ICON_COLOR}" stroke-width="1.8"/>
</svg>`;

// Subscriptions (subscriptions.svg) — envelope
const SUBSCRIPTIONS = `<svg viewBox="0 0 57 46" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M46.3613 40.75H9.63867L28 27.6143L46.3613 40.75Z" stroke="${ICON_COLOR}"/>
<path d="M46.0166 10.75H9.9834L28 0.574219L46.0166 10.75Z" stroke="${ICON_COLOR}"/>
<path d="M51 39.6064V12.3936L35.751 26L51 39.6064Z" stroke="${ICON_COLOR}"/>
<path d="M6 39.6064L6 12.3936L21.249 26L6 39.6064Z" stroke="${ICON_COLOR}"/>
</svg>`;

// Each icon carries its symbol's viewBox aspect (w/h) so we can render the SVG
// at exactly that shape — no internal letterboxing — and let the flex container
// center it. Square boxes would otherwise push a wide symbol (transfers) off-center.
const ICONS: Record<string, { xml: string; w: number; h: number }> = {
  add_expense: { xml: ADD, w: 20, h: 20 },
  scan_receipt: { xml: SCAN, w: 38, h: 38 },
  voice_expense: { xml: VOICE, w: 40, h: 37 },
  voice_income: { xml: VOICE, w: 40, h: 37 },
  scan_invoice: { xml: SCAN, w: 38, h: 38 },
  transfers: { xml: TRANSFERS, w: 49, h: 26 },
  exchange: { xml: EXCHANGE, w: 59, h: 59 },
  converter: { xml: CONVERTER, w: 60, h: 48 },
  subscriptions: { xml: SUBSCRIPTIONS, w: 57, h: 46 },
  purchase_request: { xml: CART, w: 44, h: 40 },
};

const BOX = 46;
const SYMBOL = 28; // the longer symbol dimension fits to this

/**
 * Quick-action icon: every symbol sits inside a uniform orange rounded-square
 * outline on a `surface` backing — the backing is near-invisible on the page
 * but keeps the icon readable where the first row overlaps the orange hero.
 * `color` recolors the whole icon (used for the green income/invoice variants).
 */
export function QuickActionIcon({ name, color }: { name: string; color?: string }) {
  const theme = useTheme();
  const def = ICONS[name];
  if (!def) return null;
  const stroke = color ?? ICON_COLOR;
  const xml = color ? def.xml.split(ICON_COLOR).join(color) : def.xml;

  // Render the SVG element at the symbol's real aspect ratio so it has no extra
  // internal padding; the flex container then centers it both ways.
  const scale = SYMBOL / Math.max(def.w, def.h);
  const w = Math.round(def.w * scale);
  const h = Math.round(def.h * scale);

  return (
    <View
      style={{
        width: BOX,
        height: BOX,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: stroke,
        backgroundColor: theme.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SvgXml xml={xml} width={w} height={h} />
    </View>
  );
}
