import { redirect } from '@sveltejs/kit';

export function load() {
	throw redirect(302, '/npub1dcl4zejwr8sg9h6jzl75fy4mj6g8gpdqkfczseca6lef0d5gvzxqvux5ey');
}
