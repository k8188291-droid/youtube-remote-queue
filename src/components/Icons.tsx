import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;
const base = (props: IconProps) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

export const PlayIcon = (props: IconProps) => <svg {...base(props)}><path d="m6 3 14 9-14 9z" /></svg>;
export const PauseIcon = (props: IconProps) => <svg {...base(props)}><path d="M8 5v14M16 5v14" /></svg>;
export const NextIcon = (props: IconProps) => <svg {...base(props)}><path d="m5 4 10 8-10 8zM19 5v14" /></svg>;
export const PreviousIcon = (props: IconProps) => <svg {...base(props)}><path d="m19 4-10 8 10 8zM5 5v14" /></svg>;
export const TrashIcon = (props: IconProps) => <svg {...base(props)}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" /></svg>;
export const ChevronUpIcon = (props: IconProps) => <svg {...base(props)}><path d="m6 15 6-6 6 6" /></svg>;
export const ChevronDownIcon = (props: IconProps) => <svg {...base(props)}><path d="m6 9 6 6 6-6" /></svg>;
export const PhoneIcon = (props: IconProps) => <svg {...base(props)}><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>;
export const TvIcon = (props: IconProps) => <svg {...base(props)}><rect x="2" y="4" width="20" height="15" rx="2" /><path d="m8 22 4-3 4 3" /></svg>;
export const VolumeIcon = (props: IconProps) => <svg {...base(props)}><path d="M11 5 6 9H2v6h4l5 4zM15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" /></svg>;
export const LinkIcon = (props: IconProps) => <svg {...base(props)}><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></svg>;
