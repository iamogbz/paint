import { html } from "lit";

export const iconFolderOpen = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 14l1.5-2.9A2 2 0 0 1 9.3 10H20a2 2 0 0 1 1.9 2.6l-2 6A2 2 0 0 1 18 20H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v2"/>
  </svg>
`;

export const iconDownload = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
`;

export const iconImage = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
`;

export const iconLoader2 = (size = 24, color = "#E63946") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
`;

export const iconSparkles = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
    <path d="M20 3v4"/>
    <path d="M22 5h-4"/>
    <path d="M4 17v2"/>
    <path d="M5 18H3"/>
  </svg>
`;

export const iconUpload = (size = 32, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
`;

export const iconPaintBucket = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/>
    <path d="m5 2 5 5"/>
    <path d="M2 13h15"/>
    <path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/>
  </svg>
`;

export const iconEye = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
`;

export const iconSplit = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 3h5v5"/>
    <path d="M8 3H3v5"/>
    <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.828L3 3"/>
    <path d="m21 3-7.828 7.872A4 4 0 0 0 12 13.7"/>
  </svg>
`;

export const iconPalette = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="13.5" cy="6.5" r=".5" fill="${color}"/>
    <circle cx="17.5" cy="10.5" r=".5" fill="${color}"/>
    <circle cx="8.5" cy="7.5" r=".5" fill="${color}"/>
    <circle cx="6.5" cy="12.5" r=".5" fill="${color}"/>
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.92 0 1.7-.72 1.7-1.61 0-.43-.17-.83-.44-1.13-.27-.3-.43-.7-.43-1.13 0-.89.72-1.61 1.61-1.61H16c3.31 0 6-2.69 6-6 0-4.97-4.48-9-10-9Z"/>
  </svg>
`;

export const iconPaintbrush = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="m14.622 17.897-10.68-2.913"></path>
    <path d="M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z"></path>
    <path d="M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15"></path>
  </svg>
`;

export const iconCheck = (size = 14, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
`;

export const iconCheckCircle2 = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
    <path d="m9 12 2 2 4-4"/>
  </svg>
`;

export const iconTrash2 = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18"/>
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
    <line x1="10" y1="11" x2="10" y2="17"/>
    <line x1="14" y1="11" x2="14" y2="17"/>
  </svg>
`;

export const iconGalleryVertical = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 3h18"/>
    <path d="M3 21h18"/>
    <rect width="18" height="10" x="3" y="7" rx="2"/>
  </svg>
`;

export const iconX = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6 6 18"/>
    <path d="m6 6 12 12"/>
  </svg>
`;

export const iconZoomIn = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    <line x1="11" y1="8" x2="11" y2="14"/>
    <line x1="8" y1="11" x2="14" y2="11"/>
  </svg>
`;

export const iconZoomOut = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    <line x1="8" y1="11" x2="14" y2="11"/>
  </svg>
`;

export const iconRotateCcw = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
  </svg>
`;


export const iconMove = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="5 9 2 12 5 15"/>
    <polyline points="9 5 12 2 15 5"/>
    <polyline points="19 9 22 12 19 15"/>
    <polyline points="9 19 12 22 15 19"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <line x1="12" y1="2" x2="12" y2="22"/>
  </svg>
`;

export const iconEdit2 = (size = 16, color = "currentColor") => html`
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
  </svg>
`;

export const iconChevronLeft = (size = 24, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>
`;

export const iconChevronRight = (size = 24, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="m9 18 6-6-6-6"/>
  </svg>
`;

export const iconPlus = (size = 16, color = "currentColor") => html`
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
`;

