import { BRAND_MARK_PATH, PRODUCT_NAME } from "../constants/branding";

export function BrandLogo({
	className = "size-20",
	testId = "brand-logo",
}: {
	className?: string;
	testId?: string;
}) {
	return (
		<svg
			data-testid={testId}
			role="img"
			aria-label={PRODUCT_NAME}
			width="20"
			height="20"
			viewBox="0 0 800 800"
			className={`${className} shrink-0 text-primary`}
			xmlns="http://www.w3.org/2000/svg"
		>
			<path fillRule="evenodd" fill="currentColor" d={BRAND_MARK_PATH} />
		</svg>
	);
}
