/**
 * What an extension hands the host for its window's header (holzi spec 090): three areas of
 * controls, drawn by the host in the header of the extension's own tab. The description replaces
 * the previous one whole; the host keeps nothing between page loads.
 *
 * Texts are shown as text, never as HTML. An `icon` is a path inside the extension's own bundle
 * (an installed extension) or additionally a `data:` URL (a development version); a picture is a
 * raster image or an SVG up to 256 KiB. The host refuses a description that breaks its limits (at
 * most 32 controls, 64 menu entries, 8 options; texts up to 120 characters) with error `3001`.
 */

/** How a control gives way when the header is too narrow. */
export type HeaderCollapseForm = "overflow" | "icon" | "shrink" | "keep";

export interface HeaderCollapse {
  /** 0 to 1000; the lowest collapses first. Without it the control collapses after every control that has one. */
  order?: number;
  /** `overflow` (default): into the overflow menu; `icon`: the picture alone; `shrink`: narrower; `keep`: stays as long as anything else can give way. */
  form?: HeaderCollapseForm;
}

/** The fields every control has. */
export interface HeaderControlBase {
  /** Unique in the description; comes back in the events. Up to 64 characters. */
  id: string;
  /** The accessible name; required for every type except `title` and `separator`. */
  label?: string;
  /** A path in the extension's bundle (or a `data:` URL in a development version). */
  icon?: string;
  /** Draw the picture in the header's text colour from its alpha channel. */
  monochrome?: boolean;
  /** Default is the label. */
  tooltip?: string;
  disabled?: boolean;
  collapse?: HeaderCollapse;
}

/** One entry of a `menu` control. */
export type HeaderMenuItem =
  | { type: "item"; id: string; label: string; icon?: string; disabled?: boolean }
  | { type: "separator" };

/** One option of a `choice` control. */
export interface HeaderOption {
  id: string;
  label: string;
  icon?: string;
}

/** One segment of a `breadcrumb` control. */
export interface HeaderSegment {
  id: string;
  label: string;
}

/** Event: `click`. */
export interface HeaderButton extends HeaderControlBase {
  type: "button";
  text?: string;
}

/** Event: `toggle` (the new state). */
export interface HeaderToggle extends HeaderControlBase {
  type: "toggle";
  pressed: boolean;
  text?: string;
}

/** Events: `input` (merged, at most every ~100 ms) and `submit` (Enter). */
export interface HeaderSearch extends HeaderControlBase {
  type: "search";
  value: string;
  placeholder?: string;
}

/** Event: `click` with the entry's id as `value`. */
export interface HeaderMenu extends HeaderControlBase {
  type: "menu";
  items: HeaderMenuItem[];
  text?: string;
}

/** Event: `select` with the option's id as `value`. */
export interface HeaderChoice extends HeaderControlBase {
  type: "choice";
  options: HeaderOption[];
  selected: string;
}

/** Events: `select` (the segment's id) and, when `editable`, `submit` (the typed path). */
export interface HeaderBreadcrumb extends HeaderControlBase {
  type: "breadcrumb";
  segments: HeaderSegment[];
  editable?: boolean;
  editValue?: string;
}

/** Text without an event; replaces the label. */
export interface HeaderTitle extends HeaderControlBase {
  type: "title";
  text: string;
}

export interface HeaderSeparator extends HeaderControlBase {
  type: "separator";
}

export type HeaderControl =
  | HeaderButton
  | HeaderToggle
  | HeaderSearch
  | HeaderMenu
  | HeaderChoice
  | HeaderBreadcrumb
  | HeaderTitle
  | HeaderSeparator;

/** The description of the header: three areas of controls. A missing area is empty. */
export interface HeaderDescription {
  start?: HeaderControl[];
  center?: HeaderControl[];
  end?: HeaderControl[];
}

export type HeaderEventKind = "click" | "toggle" | "input" | "submit" | "select";

/** What the extension is told when a control is used. */
export interface HeaderEvent {
  /** The control's id. */
  id: string;
  kind: HeaderEventKind;
  /** Text for `input`, `submit` and `select` (and a menu's `click`), a flag for `toggle`; absent for the `click` of a button. */
  value?: string | boolean;
}
