/** @type {import('@sveltejs/kit').ParamMatcher} */
export function match(param) {
	return /^npub(\d|[a-z]){59}$/.test(param);
}
