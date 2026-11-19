/**
 * Look of the approved desktop profile prototype (requirements/LOOP_Contractor_Desktop_Prototype): Arial 15px text and
 * 8px-radius buttons, rather than the marketing site's Inter and pill buttons. Used only by the desktop My LOOP profile
 * and its editors.
 */
export const PROTO_FONT = "Arial, Helvetica, sans-serif";

const BTN_BASE =
  "inline-block cursor-pointer rounded-lg border px-[15px] py-2.5 text-center font-bold hover:border-[#caff35] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#caff35] disabled:cursor-default disabled:opacity-50";

/** `.btn` */
export const BTN = `${BTN_BASE} border-[#47616a] bg-[#1b2b32] text-white`;
/** `.btn.primary` */
export const BTN_PRIMARY = `${BTN_BASE} border-[#caff35] bg-[#caff35] text-[#101a12]`;
/** `.btn.small`: add to either of the above. */
export const BTN_SMALL = "!px-2.5 !py-1.5 !text-xs";

/** Brings buttons from shared forms (pill-shaped on the marketing site) into the prototype's shape inside a modal. */
export const PROTO_BUTTONS_WITHIN =
  "[&_button.rounded-full]:!rounded-lg [&_label.rounded-full]:!rounded-lg [&_a.rounded-full]:!rounded-lg [&_button.rounded-full]:!px-[15px] [&_button.rounded-full]:!py-2.5 [&_button.rounded-full]:!font-bold [&_label.rounded-full]:!font-bold";

export const EYEBROW = "text-[11px] font-bold uppercase tracking-[2px] text-[#caff35]";
