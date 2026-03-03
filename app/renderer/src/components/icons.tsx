import type { SVGProps } from 'react'

interface IconProps extends SVGProps<SVGSVGElement> {
	size?: number
}

function BaseIcon({ size = 18, children, ...props }: IconProps) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
			{children}
		</svg>
	)
}

export function TrashIcon(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M4 7l16 0" />
			<path d="M10 11l0 6" />
			<path d="M14 11l0 6" />
			<path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
			<path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
		</BaseIcon>
	)
}

export function StarOutlineIcon(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245" />
		</BaseIcon>
	)
}

export function StarFilledIcon({ size = 18, ...props }: IconProps) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M8.243 7.34l-6.38 .925l-.113 .023a1 1 0 0 0 -.44 1.684l4.622 4.499l-1.09 6.355l-.013 .11a1 1 0 0 0 1.464 .944l5.706 -3l5.693 3l.1 .046a1 1 0 0 0 1.352 -1.1l-1.091 -6.355l4.624 -4.5l.078 -.085a1 1 0 0 0 -.633 -1.62l-6.38 -.926l-2.852 -5.78a1 1 0 0 0 -1.794 0l-2.853 5.78z" />
		</svg>
	)
}

export function MenuIcon(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M4 6l16 0" />
			<path d="M4 12l16 0" />
			<path d="M4 18l16 0" />
		</BaseIcon>
	)
}

export function MoonIcon(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008" />
		</BaseIcon>
	)
}

export function SunIcon(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
			<path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" />
		</BaseIcon>
	)
}

export function SettingsIcon(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065" />
			<path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
		</BaseIcon>
	)
}

export function StrataIcon(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M14 3v4a1 1 0 0 0 1 1h4" />
			<path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
			<path d="M10 18l5 -5a1.414 1.414 0 0 0 -2 -2l-5 5v2h2" />
		</BaseIcon>
	)
}

export function ArchiveIcon(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M3 6a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2" />
			<path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-10" />
			<path d="M10 12l4 0" />
		</BaseIcon>
	)
}

export function EyeIcon(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
			<path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" />
		</BaseIcon>
	)
}

export function CopyIcon(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" />
			<path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
		</BaseIcon>
	)
}

export function TagIcon(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
			<path d="M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3" />
		</BaseIcon>
	)
}

export function ExportIcon(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M12 3v12" />
			<path d="M8 11l4 4l4 -4" />
			<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
		</BaseIcon>
	)
}

export function CloseIcon(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M18 6l-12 12" />
			<path d="M6 6l12 12" />
		</BaseIcon>
	)
}

export function CheckIcon(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M5 12l5 5l10 -10" />
		</BaseIcon>
	)
}

export function CircleChevronLeftIcon(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M13 15l-3 -3l3 -3" />
			<path d="M21 12a9 9 0 1 0 -18 0a9 9 0 0 0 18 0" />
		</BaseIcon>
	)
}

export function CircleChevronRightIcon(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<path d="M11 9l3 3l-3 3" />
			<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
		</BaseIcon>
	)
}
