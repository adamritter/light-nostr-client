import { nip19 } from 'nostr-tools';
import TimeAgo from 'javascript-time-ago';
import type { Event } from 'nostr-tools';

// English.
import en from 'javascript-time-ago/locale/en';
TimeAgo.addLocale(en);

// Create formatter (English).
const timeAgo = new TimeAgo('en-US');

export type MetadataContent = {
	picture?: string;
	display_name?: string;
	name?: string;
	nip05?: string;
	about?: string;
	followerCount?: number;
	website?: string;
};
export function parseJSON(json: string | undefined) {
	if (json) {
		return JSON.parse(json);
	}
}

async function fetchJSON(url: string) {
	return fetch(url)
		.then((response) => response.json())
		.catch((e) => {
			throw new Error('error fetching ' + url + ' ' + e);
		});
}

export function npubEncode(pubkey: string) {
	try {
		return nip19.npubEncode(pubkey);
	} catch (e) {
		console.error('invalid pubkey ', pubkey + ' called from npubEncode');
		throw new Error('invalid pubkey' + pubkey + e);
	}
}
export function npubDecode(npub: string): string {
	try {
		// @ts-ignore
		return nip19.decode(npub).data;
	} catch (e) {
		console.error('invalid npub ', npub + ' called from npubDecode');
		throw new Error('invalid npub' + npub + e);
	}
}
export async function fetchInfo(server: string, pubkey: string) {
	const url = `${server}/${pubkey}/info.json`;
	return fetchJSON(url);
}

const DEFAULT_RELAYS = [
	'wss://eden.nostr.land',
	'wss://nostr.fmt.wiz.biz',
	'wss://relay.damus.io',
	'wss://nostr-pub.wellorder.net',
	'wss://relay.nostr.info',
	'wss://offchain.pub',
	'wss://nos.lol',
	'wss://brb.io',
	'wss://relay.snort.social',
	'wss://relay.current.fyi',
	'wss://nostr.relayer.se'
];

export function writeRelaysForContactList(contactList?: { content: string }) {
	const relays = [];
	try {
		// @ts-ignore
		const data = JSON.parse(contactList?.content);
		if (data) {
			for (const [url, read_write] of Object.entries(data)) {
				// @ts-ignore
				if (read_write?.write) {
					relays.push(url);
				}
			}
		}
	} catch (e) {
		console.error('error parsing contact list with content ' + contactList?.content, e);
	}
	if (relays.length === 0) {
		return DEFAULT_RELAYS;
	}
	return relays;
}

export async function replaceReferences(event: Event, content: string, relayPool: RelayPool) {
	// find #[number]
	const matches = content.match(/#\[[0-9]+\]/g);
	// which metadata.tags does it map to?
	if (matches) {
		for (const match of matches) {
			const index = parseInt(match.substring(2, match.length - 1));
			const tag = event.tags[index];
			if (tag && tag[1]) {
				const tagMetadata = await relayPool.fetchAndCacheMetadata(tag[1]);
				if (tagMetadata) {
					const infoMetadata = parseJSON(tagMetadata.content) as MetadataContent;
					if (infoMetadata?.display_name) {
						content = content.replaceAll(
							match,
							`<a onclick="load('${tag[1]}')">@${infoMetadata.display_name}</a>`
						);
					} else {
						content = content.replaceAll(match, `<a onclick="load('${tag[1]}')">@${tag[1]}</a>`);
					}
				}
			} else {
				console.log('no tag found for ', match, 'index', index, 'tags', event.tags);
			}
		}
	}
	return content;
}

export function profileForInfoMetadata(
	infoMetadata: {
		picture?: string;
		display_name?: string;
		name?: string;
		nip05?: string;
		about?: string;
		followerCount?: number;
	},
	pubkey: string
) {
	let body = [];
	let picture = infoMetadata?.picture;
	body.push('<span style="display: flex; justify-content: flex-start;">');
	if (picture) {
		body.push(
			`<a onclick='load(
                "${pubkey}"
            )'><img src='${picture}' style='border-radius: 50%; cursor: pointer; max-height: 60px); max-width: 60px;' width=60 height=60></a><br>`
		);
	} else {
		// just leave 60px
		body.push("<span style='width: 60px'></span>");
	}
	body.push('<span>');
	body.push(`<a href="#" onclick='load(
                "${pubkey}"
            )'>`);
	if (infoMetadata.display_name) {
		body.push(`<b style='font-size: 20px'>${infoMetadata.display_name}</b>`);
	}
	if (infoMetadata.name) {
		body.push(` @${infoMetadata.name}<br>`);
	}
	body.push('</a><br>');
	if (infoMetadata.nip05) {
		body.push(`<span style='color: #34ba7c'>${infoMetadata.nip05}</span><br>`);
	}
	if (infoMetadata.about) {
		body.push(`${infoMetadata.about}<br>`);
	}

	body.push(`${infoMetadata?.followerCount || 0}  followers<br></span></span>`);
	return body.join('');
}
export const escapeHtml = (unsafe: string) => {
	return unsafe
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
};

export function selectRandom(array: any[], n: number) {
	return array
		.slice()
		.sort(() => 0.5 - Math.random())
		.slice(0, n);
}

export function getFinalRedirect(id: string, redirectHolders: Map<string, string>) {
	while (redirectHolders.has(id)) {
		id = redirectHolders.get(id)!;
	}
	return id;
}

export async function showNote(event: Event, metadata?: Event, relayPool: RelayPool) {
	const pubkey = event.pubkey;
	if (!metadata) {
		metadata = await relayPool.fetchAndCacheMetadata(pubkey);
	}
	const infoMetadata = parseJSON(metadata?.content) as MetadataContent;
	const body = [];
	const picture = infoMetadata?.picture;
	body.push(
		`<span style="display: flex; justify-content: flex-start; order: ${event.created_at}" id="${event.id}">`
	);
	if (picture) {
		body.push(
			`<a onclick='load(
				"${pubkey}"
			)'><img src='${picture}' style='border-radius: 50%; cursor: pointer; max-height:30px; max-width: 30px;' width=60 height=60></a><br>`
		);
	} else {
		// just leave 60px
		body.push("<span style='width: 60px'></span>");
	}
	body.push('<span>');
	body.push(`<a href="#" onclick='load(
				"${pubkey}"
			)'>`);
	if (infoMetadata.display_name) {
		body.push(`<b style='font-size: 20px'>${infoMetadata.display_name}</b>`);
	}
	if (infoMetadata.name) {
		body.push(` @${infoMetadata.name}`);
	}
	body.push(' ' + timeAgo.format(event.created_at * 1000, 'mini'));
	body.push('<br></a>');

	let content = escapeHtml(event.content).replaceAll('\n', '<br>');
	// replace http and https with regexp
	// content = content.replaceAll(
	// 	/(https?:\/\/[^\s]+\.(png|jpg|jpeg))/g,
	// 	'<img src="https://imgproxy.iris.to/insecure/rs:fit:1138:1138/plain/$1" width="569" height="569" />'
	// );
	// content = content.replaceAll(
	// 	/(\s)(https?:\/\/[^\s]+)/g,
	// 	'$1<a href="$2" target="_blank">$2</a>'
	// );
	content = content.replaceAll(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
	content = await replaceReferences(event, content, relayPool); // Move to top
	body.push(`<span>${content}</span><br>`);

	// body.push(`${infoMetadata?.followerCount || 0}  followers<br></span></span>`);
	body.push('</span></span>');
	return body.join('');
}

/**
 * @param {String} HTML representing a single element
 * @return {Element}
 */
export function htmlToElement(html: string) {
	const template = document.createElement('template');
	html = html.trim(); // Never return a text node of whitespace as the result
	template.innerHTML = html;
	const node = template.content.firstChild;
	return template.content.firstChild;
}
